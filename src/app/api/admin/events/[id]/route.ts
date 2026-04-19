import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-key');
  return key === (process.env.ADMIN_SECRET || 'checkStoris2026');
}

// PUT /api/admin/events/[id] — update event
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const { title, description, date, location, repostUrl, isActive } = body;
    const prisma = getPrisma();
    const event = await prisma.event.update({
      where: { id },
      data: {
        title,
        description: description || null,
        date: date ? new Date(date) : null,
        location: location || null,
        repostUrl: repostUrl || null,
        isActive: isActive !== false,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json({ event });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/admin/events/[id] — toggle isActive
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const { isActive } = await req.json();
    const prisma = getPrisma();
    const event = await prisma.event.update({
      where: { id },
      data: { isActive, updatedAt: new Date() },
    });
    return NextResponse.json({ event });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/events/[id] — delete event
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const prisma = getPrisma();
    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
