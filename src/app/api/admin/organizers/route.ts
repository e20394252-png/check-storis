import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// GET /api/admin/organizers — список организаторов (только для суперадмина)
export async function GET() {
  const me = await getSession();
  if (!me || !me.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const prisma = getPrisma();
  const organizers = await prisma.organizer.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { events: true } } },
  });
  return NextResponse.json({
    organizers: organizers.map(o => ({
      ...o,
      telegram_id: o.telegram_id.toString(),
    })),
  });
}

// PATCH /api/admin/organizers — аппрув/отклонение организатора
export async function PATCH(req: NextRequest) {
  const me = await getSession();
  if (!me || !me.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { organizerId, action } = await req.json();
  if (!organizerId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const prisma = getPrisma();
  const updated = await prisma.organizer.update({
    where: { id: organizerId },
    data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED' },
  });

  // Уведомляем организатора через бота
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken && updated.telegram_id) {
    const chatId = updated.telegram_id.toString();
    const adminUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/admin`
      : 'https://check-storis-production-673a.up.railway.app/admin';

    const text = action === 'approve'
      ? `🎉 <b>Ваша заявка одобрена!</b>\n\nТеперь вы можете создавать мероприятия в панели организатора.\n\n👉 <a href="${adminUrl}">Открыть панель</a>`
      : `❌ <b>Заявка отклонена</b>\n\nК сожалению, ваша заявка на доступ к панели организатора была отклонена.`;

    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    }).catch(err => console.error('[organizer notify]', err));
  }

  return NextResponse.json({ success: true, status: updated.status });
}
