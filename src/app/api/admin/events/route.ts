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
  const {
    title, description, date, location, repostUrl, isActive, imageUrl,
    price, discountPrice,
    // Paid repost fields
    isPaidRepost, repostRewardUsdt, repostsNeeded,
  } = body;
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  // Calculate campaign budget if paid
  let campaignBudget: number | null = null;
  let campaignTotal: number | null = null;
  let campaignStatus: string | null = null;

  if (isPaidRepost && repostRewardUsdt && repostsNeeded) {
    campaignBudget = Math.round(repostRewardUsdt * repostsNeeded * 100) / 100;
    campaignTotal = Math.round(campaignBudget * 1.2 * 100) / 100; // +20% commission
    campaignStatus = 'draft';
  }

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
      // Paid repost events start inactive (hidden until funded)
      isActive: isPaidRepost ? false : (me.isSuperAdmin ? (isActive !== false) : false),
      organizerId: me.id,
      // Paid repost fields
      isPaidRepost: !!isPaidRepost,
      repostRewardUsdt: repostRewardUsdt ? Number(repostRewardUsdt) : null,
      repostsNeeded: repostsNeeded ? Number(repostsNeeded) : null,
      campaignBudget,
      campaignTotal,
      campaignStatus,
    },
  });

  // Уведомляем суперадмина о новом мероприятии от обычного орга
  if (!me.isSuperAdmin) {
    const { notifySuperAdminNewEvent } = await import('@/lib/notify');
    notifySuperAdminNewEvent(event.id, title, me.first_name || me.login || 'Организатор').catch(console.error);
  }

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

// PATCH /api/admin/events — campaign management (pause/resume/add_slots)
export async function PATCH(req: NextRequest) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.status !== 'APPROVED') return NextResponse.json({ error: 'Not approved' }, { status: 403 });

  const { eventId, action, additionalSlots } = await req.json();
  if (!eventId || !action) return NextResponse.json({ error: 'eventId and action required' }, { status: 400 });

  const prisma = getPrisma();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!me.isSuperAdmin && event.organizerId !== me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!event.isPaidRepost) {
    return NextResponse.json({ error: 'Not a paid campaign' }, { status: 400 });
  }

  switch (action) {
    case 'pause':
      await prisma.event.update({
        where: { id: eventId },
        data: { campaignStatus: 'paused', isActive: false },
      });
      return NextResponse.json({ success: true, campaignStatus: 'paused' });

    case 'resume':
      await prisma.event.update({
        where: { id: eventId },
        data: { campaignStatus: 'active', isActive: true },
      });
      return NextResponse.json({ success: true, campaignStatus: 'active' });

    case 'add_slots':
      if (!additionalSlots || additionalSlots <= 0) {
        return NextResponse.json({ error: 'additionalSlots must be > 0' }, { status: 400 });
      }
      // Invoice will be created via /api/cryptobot/create-invoice
      return NextResponse.json({
        success: true,
        needsPayment: true,
        additionalSlots,
        additionalCost: Math.round((event.repostRewardUsdt || 0) * additionalSlots * 1.2 * 100) / 100,
      });

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
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

  // Каскадно удаляем связанные записи перед удалением мероприятия
  await prisma.paymentRequest.deleteMany({ where: { eventId } });
  await prisma.registration.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
  return NextResponse.json({ success: true });
}
