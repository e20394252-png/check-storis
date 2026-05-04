import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/payment/webhook — пользователь нажал "Оплатить", сохраняем заявку
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, eventTitle, price, type, user, telegram_id } = body;

    if (!eventId || !price || !type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // telegram_id из body или из initData
    let telegramId = BigInt(0);
    if (telegram_id) {
      telegramId = BigInt(telegram_id);
    } else {
      try {
        const initData = req.headers.get('x-telegram-init-data') || '';
        const params = new URLSearchParams(initData);
        const userJson = params.get('user');
        if (userJson) {
          const u = JSON.parse(userJson);
          telegramId = BigInt(u.id);
        }
      } catch {}
    }

    if (telegramId === BigInt(0)) {
      return NextResponse.json({ error: 'telegram_id not found' }, { status: 400 });
    }

    const prisma = getPrisma();
    const pr = await prisma.paymentRequest.create({
      data: {
        eventId,
        eventTitle: eventTitle || '',
        price: Number(price),
        paymentType: type,
        telegramId,
        firstName: user?.first_name || null,
        username: user?.username || null,
        status: 'new',
      },
    });

    // Бот отправляет ссылку на оплату в чат
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const paymentUrl = process.env.LIDTECH_PAYMENT_URL || 'https://app.leadteh.ru/w/fKXkC';
    if (botToken) {
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId.toString(),
          text: `💳 Заявка на оплату оформлена!\n\n📅 ${eventTitle}\n💰 ${price} ₽ ${type === 'discount' ? '(со скидкой)' : ''}\n\n👇 Нажмите для оплаты:`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '💳 Перейти к оплате', url: paymentUrl }]],
          },
        }),
      }).catch(err => console.error('[payment msg]', err));
    }

    return NextResponse.json({
      success: true,
      paymentRequestId: pr.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/payment/webhook?telegram_id=123 — ЛидТех дёргает этот эндпоинт
// Возвращает последнюю новую заявку пользователя и помечает как обработанную
export async function GET(req: NextRequest) {
  const telegramId = req.nextUrl.searchParams.get('telegram_id');
  if (!telegramId) {
    return NextResponse.json({ error: 'telegram_id required' }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const pr = await prisma.paymentRequest.findFirst({
      where: {
        telegramId: BigInt(telegramId),
        status: 'new',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pr) {
      return NextResponse.json({ found: false });
    }

    // Помечаем как обработанную
    await prisma.paymentRequest.update({
      where: { id: pr.id },
      data: { status: 'processed' },
    });

    return NextResponse.json({
      found: true,
      event_id: pr.eventId,
      event_title: pr.eventTitle,
      price: pr.price,
      payment_type: pr.paymentType,
      user_first_name: pr.firstName || '',
      user_username: pr.username || '',
      user_telegram_id: pr.telegramId.toString(),
      created_at: pr.createdAt.toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
