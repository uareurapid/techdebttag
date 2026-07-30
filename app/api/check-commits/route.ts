// POST /api/check-commits — Check if a GitHub repo has new commits

import { NextRequest, NextResponse } from 'next/server';
import { getRepo } from '@/server/db';
import { checkForNewCommits } from '@/server/scanner';
import { getUserId } from '@/server/auth';
import { commitCheckLimiter } from '@/server/rate-limit';

export async function POST(req: NextRequest) {
  try {
    // Rate limit check
    const limit = commitCheckLimiter();
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many commit checks. Please wait ${limit.retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      );
    }

    const userId = await getUserId();
    const body = await req.json();
    const { repo_id } = body;

    if (!repo_id) {
      return NextResponse.json({ error: 'repo_id is required' }, { status: 400 });
    }

    const repo = getRepo(repo_id) as any;
    if (!repo) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }

    // Verify ownership
    if (repo.user_id != null && repo.user_id !== userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (repo.type === 'local') {
      return NextResponse.json({ error: 'Local repos do not support commit checking' }, { status: 400 });
    }

    if (!repo.last_commit_sha) {
      return NextResponse.json({ message: 'No previous scan found. Run a scan first.', hasNew: true });
    }

    const result = checkForNewCommits(
      repo.path_or_url,
      repo.last_commit_sha,
      repo.github_token || undefined
    );

    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
