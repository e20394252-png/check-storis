import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-key');
  return key === (process.env.ADMIN_SECRET || 'checkStoris2026');
}

// GET /api/admin/events — all events for admin panel
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const prisma = getPrisma();
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { registrations: true } },
      },
    });
    return NextResponse.json({ events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/events — create new event
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { title, description, date, location, repostUrl, isActive } = body;
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    const prisma = getPrisma();
    const event = await prisma.event.create({
      data: {
        title,
        description: description || null,
        date: date ? new Date(date) : null,
        location: location || null,
        repostUrl: repostUrl || null,
        isActive: isActive !== false,
      },
    });
    return NextResponse.json({ event });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
