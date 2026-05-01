import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// GET /api/admin/events — мероприятия текущего организатора (суперадмин видит все)
export async function GET() {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.status !== 'APPROVED') return NextResponse.json({ error: 'Not approved' }, { status: 403 });

  const prisma = getPrisma();
  const where = me.isSuperAdmin ? {} : { organizerId: me.id };
  const events = await prisma.event.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { registrations: true } } },
  });
  return NextResponse.json({ events });
}

// POST /api/admin/events — создать мероприятие
export async function POST(req: NextRequest) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.status !== 'APPROVED') return NextResponse.json({ error: 'Not approved' }, { status: 403 });

  const body = await req.json();
  const { title, description, date, location, repostUrl, isActive, imageUrl, price, discountPrice } = body;
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const prisma = getPrisma();
  const event = await prisma.event.create({
    data: {
      title,
      description: description || null,
      date: date ? new Date(date) : null,
      location: location || null,
      repostUrl: repostUrl || null,
      imageUrl: imageUrl || null,
      price: price != null ? Number(price) : null,
      discountPrice: discountPrice != null ? Number(discountPrice) : null,
      isActive: isActive !== false,
      organizerId: me.id,
    },
  });
  return NextResponse.json({ event });
}

// PUT /api/admin/events — обновить мероприятие
export async function PUT(req: NextRequest) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.status !== 'APPROVED') return NextResponse.json({ error: 'Not approved' }, { status: 403 });

  const body = await req.json();
  const { eventId, title, description, date, location, repostUrl, isActive, imageUrl, price, discountPrice } = body;
  if (!eventId) return NextResponse.json({ error: 'Event ID required' }, { status: 400 });

  const prisma = getPrisma();
  if (!me.isSuperAdmin) {
    const ev = await prisma.event.findUnique({ where: { id: eventId } });
    if (!ev || ev.organizerId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      title: title || undefined,
      description: description ?? undefined,
      date: date ? new Date(date) : null,
      location: location ?? undefined,
      repostUrl: repostUrl ?? undefined,
      price: price != null ? Number(price) : undefined,
      discountPrice: discountPrice != null ? Number(discountPrice) : undefined,
      imageUrl: imageUrl ?? undefined,
      isActive: isActive ?? undefined,
    },
  });
  return NextResponse.json({ event });
}

// DELETE /api/admin/events — удалить мероприятие
export async function DELETE(req: NextRequest) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { eventId } = await req.json();
  const prisma = getPrisma();

  if (!me.isSuperAdmin) {
    const ev = await prisma.event.findUnique({ where: { id: eventId } });
    if (!ev || ev.organizerId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.event.delete({ where: { id: eventId } });
  return NextResponse.json({ success: true });
}
