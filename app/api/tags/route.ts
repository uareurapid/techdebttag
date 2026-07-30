// GET /api/tags — Get all tag configs
// POST /api/tags — Add a new tag

import { NextRequest, NextResponse } from 'next/server';
import { getTagConfigs, addTagConfig } from '@/server/db';
import { getUserId } from '@/server/auth';

export async function GET() {
  try {
    const tags = getTagConfigs();
    return NextResponse.json(tags);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await getUserId(); // Must be authenticated to modify tags
    const body = await req.json();
    const { tag, priority } = body;

    if (!tag) {
      return NextResponse.json({ error: 'tag is required' }, { status: 400 });
    }

    const validPriorities = ['critical', 'high', 'medium', 'low', 'info'];
    if (priority && !validPriorities.includes(priority)) {
      return NextResponse.json({ error: `priority must be one of: ${validPriorities.join(', ')}` }, { status: 400 });
    }

    const result = addTagConfig(tag.toUpperCase(), priority || 'medium');
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
