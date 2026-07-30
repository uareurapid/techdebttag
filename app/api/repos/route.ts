// POST /api/repos — Create a new repo
// GET  /api/repos — List all repos (scoped to user)

import { NextRequest, NextResponse } from 'next/server';
import { createRepo, getRepos } from '@/server/db';
import { getUserId } from '@/server/auth';

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId().catch(() => null);
    const repos = getRepos(userId ?? undefined);
    return NextResponse.json(repos);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json();
    const { name, type, path_or_url, github_token } = body;

    if (!name || !type || !path_or_url) {
      return NextResponse.json({ error: 'name, type, and path_or_url are required' }, { status: 400 });
    }

    if (!['local', 'github-public', 'github-private'].includes(type)) {
      return NextResponse.json({ error: 'type must be local, github-public, or github-private' }, { status: 400 });
    }

    const result = createRepo({ name, type, path_or_url, github_token, user_id: userId });
    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
