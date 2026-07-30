// GET /api/findings — Get findings with filters
// PATCH /api/findings — Resolve findings or update priority

import { NextRequest, NextResponse } from 'next/server';
import { getFindings, resolveFinding, updateFindingPriority, getRepo } from '@/server/db';
import { getUserId } from '@/server/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repo_id');
    const tag = searchParams.get('tag');
    const priority = searchParams.get('priority');
    const resolved = searchParams.get('resolved');
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const format = searchParams.get('format');

    // Verify ownership if repo_id is specified
    if (repoId) {
      const userId = await getUserId();
      const repo = getRepo(parseInt(repoId)) as any;
      if (repo && repo.user_id != null && repo.user_id !== userId) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
    }

    const result = getFindings({
      repo_id: repoId ? parseInt(repoId) : undefined,
      tag: tag || undefined,
      priority: priority || undefined,
      resolved: resolved !== null ? resolved === 'true' : undefined,
      search: search || undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });

    // CSV export
    if (format === 'csv') {
      const headers = ['id', 'tag', 'file_path', 'line_number', 'excerpt_line', 'priority', 'resolved', 'repo_name', 'created_at'];
      const csvRows = [headers.join(',')];
      for (const f of result.findings as any[]) {
        csvRows.push([
          f.id,
          `"${f.tag}"`,
          `"${f.file_path}"`,
          f.line_number,
          `"${(f.excerpt_line || '').replace(/"/g, '""')}"`,
          f.priority,
          f.resolved ? 'yes' : 'no',
          `"${f.repo_name}"`,
          f.created_at,
        ].join(','));
      }
      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="techdebt-export.csv"`,
        },
      });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await getUserId(); // Must be authenticated
    const body = await req.json();
    const { action, id, priority } = body;

    if (!action || !id) {
      return NextResponse.json({ error: 'action and id are required' }, { status: 400 });
    }

    if (action === 'resolve') {
      resolveFinding(id, true);
      return NextResponse.json({ success: true });
    }

    if (action === 'unresolve') {
      resolveFinding(id, false);
      return NextResponse.json({ success: true });
    }

    if (action === 'priority') {
      if (!priority) {
        return NextResponse.json({ error: 'priority is required for priority action' }, { status: 400 });
      }
      updateFindingPriority(id, priority);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
