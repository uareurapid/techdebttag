// PATCH  /api/tags/[id] — Update tag config (priority, enabled)
// DELETE /api/tags/[id] — Delete a tag config

import { NextRequest, NextResponse } from 'next/server';
import { updateTagConfig, deleteTagConfig } from '@/server/db';
import { getUserId } from '@/server/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getUserId(); // Must be authenticated to modify tags
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid tag ID' }, { status: 400 });
    }

    const body = await req.json();
    const { priority, enabled } = body;

    updateTagConfig(id, { priority, enabled });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getUserId(); // Must be authenticated to modify tags
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid tag ID' }, { status: 400 });
    }

    deleteTagConfig(id);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
