// POST /api/scan — Trigger a scan on a repo

import { NextRequest, NextResponse } from 'next/server';
import { getRepo, getTagConfigs, createScan, completeScan, failScan, replaceScanFindings, updateRepoLastCommit, getDb } from '@/server/db';
import { scanLocalFolder, scanGitHubRepo } from '@/server/scanner';
import { getUserId } from '@/server/auth';
import { scanLimiter } from '@/server/rate-limit';

// Add error_message column if it doesn't exist (migration)
function ensureSchema() {
  const db = getDb();
  try {
    db.exec("ALTER TABLE scans ADD COLUMN error_message TEXT DEFAULT ''");
  } catch {
    // Column already exists
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit check
    const limit = scanLimiter();
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many scans. Please wait ${limit.retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      );
    }

    const userId = await getUserId();
    ensureSchema();

    const body = await req.json();
    const { repo_id } = body;

    if (!repo_id) {
      return NextResponse.json({ error: 'repo_id is required' }, { status: 400 });
    }

    const repo = getRepo(repo_id) as import('@/server/types').Repo | undefined;
    if (!repo) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }

    // Verify ownership
    if ((repo as any).user_id != null && (repo as any).user_id !== userId) {
      return NextResponse.json({ error: 'Not authorized to scan this repo' }, { status: 403 });
    }

    const tags = await getTagConfigs();
    const enabledTags = tags.filter((t: { enabled: boolean }) => t.enabled);

    if (enabledTags.length === 0) {
      return NextResponse.json({ error: 'No tags enabled. Enable at least one tag in settings.' }, { status: 400 });
    }

    // Create scan record
    const scanResult = createScan(repo_id);
    const scanId = Number(scanResult.lastInsertRowid);

    // Run scan synchronously for GitHub repos (they clone first, so it can be fast)
    // For large local folders, keep it async
    if (repo.type === 'local') {
      // Local scan: run async to avoid timeout
      runScanAsync(scanId, repo, enabledTags);
      return NextResponse.json({
        scan_id: scanId,
        status: 'running',
        message: 'Local scan started. This may take a moment for large folders.',
      });
    } else {
      // GitHub scan: run synchronously (cloning takes time but we want feedback)
      try {
        const result = await scanGitHubRepo(
          repo.path_or_url,
          repo.github_token || undefined,
          enabledTags
        );

        const tagPriorityMap = new Map(enabledTags.map((t: import('@/server/types').TagConfig) => [t.tag, t.priority]));
        const dbFindings = result.findings.map(f => ({
          tag: f.tag,
          file_path: f.file_path,
          line_number: f.line_number,
          excerpt_before: f.excerpt_before,
          excerpt_line: f.excerpt_line,
          excerpt_after: f.excerpt_after,
          priority: tagPriorityMap.get(f.tag) || f.priority,
        }));

        replaceScanFindings(scanId, repo_id, dbFindings);
        completeScan(scanId, 0, result.findings.length);

        if (result.commitSha) {
          updateRepoLastCommit(repo_id, result.commitSha);
        }

        return NextResponse.json({
          scan_id: scanId,
          status: 'completed',
          total_findings: result.findings.length,
          message: `Scan complete. Found ${result.findings.length} debt items.`,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('GitHub scan failed:', errorMsg);
        failScan(scanId, errorMsg);
        return NextResponse.json({
          scan_id: scanId,
          status: 'failed',
          error: errorMsg,
        }, { status: 500 });
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

async function runScanAsync(
  scanId: number,
  repo: import('@/server/types').Repo,
  enabledTags: import('@/server/types').TagConfig[]
) {
  try {
    const result = await scanLocalFolder(repo.path_or_url, enabledTags);

    const tagPriorityMap = new Map(enabledTags.map((t: import('@/server/types').TagConfig) => [t.tag, t.priority]));
    const dbFindings = result.findings.map(f => ({
      tag: f.tag,
      file_path: f.file_path,
      line_number: f.line_number,
      excerpt_before: f.excerpt_before,
      excerpt_line: f.excerpt_line,
      excerpt_after: f.excerpt_after,
      priority: tagPriorityMap.get(f.tag) || f.priority,
    }));

    replaceScanFindings(scanId, repo.id, dbFindings);
    completeScan(scanId, 0, result.findings.length);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Local scan failed:', errorMsg);
    failScan(scanId, errorMsg);
  }
}
