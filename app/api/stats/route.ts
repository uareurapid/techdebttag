// GET /api/stats?repo_id=1 — Get stats for a repo

import { NextRequest, NextResponse } from 'next/server';
import { getRepoStats, getRepo } from '@/server/db';
import { getUserId } from '@/server/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repo_id');

    if (!repoId) {
      return NextResponse.json({ error: 'repo_id is required' }, { status: 400 });
    }

    // Verify ownership
    const userId = await getUserId();
    const repo = getRepo(parseInt(repoId)) as any;
    if (repo && repo.user_id != null && repo.user_id !== userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const stats = getRepoStats(parseInt(repoId));
    if (!stats) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }

    return NextResponse.json(stats);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
