import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/admin-session';
import { notifyRegistrationApproved, notifyRegistrationRejected } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// GET /api/admin/registrations — заявки для текущего организатора
export async function GET() {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.status !== 'APPROVED') return NextResponse.json({ error: 'Not approved' }, { status: 403 });

  const prisma = getPrisma();

  // Суперадмин видит все, остальные — только свои
  const where = me.isSuperAdmin ? {} : { event: { organizerId: me.id } };

  const registrations = await prisma.registration.findMany({
    where,
    include: { user: true, event: true },
    orderBy: { createdAt: 'desc' },
  });

  // Убираем BigInt для JSON
  const serialized = registrations.map((r: any) => ({
    id: r.id,
    status: r.status,
    proofUrl: r.proofUrl,
    storyUrl: r.storyUrl,
    adminNote: r.adminNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    user: {
      first_name: r.user?.first_name || null,
      username: r.user?.username || null,
    },
    event: {
      id: r.event?.id,
      title: r.event?.title || null,
    },
  }));

  return NextResponse.json({ registrations: serialized });
}

// PATCH /api/admin/registrations — одобрить/отклонить заявку
export async function PATCH(req: NextRequest) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.status !== 'APPROVED') return NextResponse.json({ error: 'Not approved' }, { status: 403 });

  const { registrationId, action, adminNote } = await req.json();
  if (!registrationId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const prisma = getPrisma();
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { user: true, event: true },
  });
  if (!reg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Проверяем право доступа
  if (!me.isSuperAdmin && reg.event?.organizerId !== me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
  await prisma.registration.update({
    where: { id: registrationId },
    data: { status: newStatus, adminNote: adminNote || null },
  });

  // Уведомление пользователю
  const telegramId = reg.user?.telegram_id;
  const username = reg.user?.username;
  const eventTitle = reg.event?.title || 'Мероприятие';
  const eventDate = reg.event?.date
    ? new Date(reg.event.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const eventLoc = reg.event?.location;

  if (telegramId) {
    if (action === 'approve') {
      notifyRegistrationApproved(telegramId, eventTitle, eventDate, eventLoc, username).catch(console.error);
    } else {
      notifyRegistrationRejected(telegramId, eventTitle, adminNote, username).catch(console.error);
    }
  }

  return NextResponse.json({ success: true, status: newStatus });
}
