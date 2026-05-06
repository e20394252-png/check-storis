import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/admin-session';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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
      telegram_id: o.telegram_id?.toString() || '0',
      login: o.login || null,
      // Не отправляем хеш пароля — суперадмин может задать новый
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

  // Уведомляем организатора через бота (если есть telegram_id)
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken && updated.telegram_id && updated.telegram_id > BigInt(0)) {
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

// PUT /api/admin/organizers — обновить логин/пароль организатора (суперадмин)
export async function PUT(req: NextRequest) {
  const me = await getSession();
  if (!me || !me.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { organizerId, login, password } = await req.json();
  if (!organizerId) {
    return NextResponse.json({ error: 'organizerId required' }, { status: 400 });
  }

  const prisma = getPrisma();
  const data: Record<string, any> = {};

  if (login !== undefined) {
    // Проверяем уникальность
    const existing = await prisma.organizer.findFirst({ where: { login, NOT: { id: organizerId } } });
    if (existing) {
      return NextResponse.json({ error: 'Этот логин уже занят' }, { status: 400 });
    }
    data.login = login;
  }

  if (password) {
    data.password = hashPassword(password);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.organizer.update({
    where: { id: organizerId },
    data,
  });

  return NextResponse.json({ success: true, login: updated.login });
}
