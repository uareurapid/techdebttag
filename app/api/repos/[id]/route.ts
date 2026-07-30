// DELETE /api/repos/[id] — Delete a repo and all its data

import { NextRequest, NextResponse } from 'next/server';
import { deleteRepo, getRepo } from '@/server/db';
import { getUserId } from '@/server/auth';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid repo ID' }, { status: 400 });
    }

    const repo = getRepo(id) as any;
    if (!repo) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }

    // Verify ownership
    if (repo.user_id != null && repo.user_id !== userId) {
      return NextResponse.json({ error: 'Not authorized to delete this repo' }, { status: 403 });
    }

    deleteRepo(id);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
