import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// POST /api/admin/events/[id]/push — рассылка мероприятия всем пользователям
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.status !== 'APPROVED') return NextResponse.json({ error: 'Not approved' }, { status: 403 });

  const { id } = await params;

  try {
    const prisma = getPrisma();
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    // Проверяем принадлежность
    if (!me.isSuperAdmin && event.organizerId !== me.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: { telegram_id: true },
    });

    const { broadcastEventPush } = await import('@/lib/notify');
    const result = await broadcastEventPush(event, users.map(u => u.telegram_id));

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
