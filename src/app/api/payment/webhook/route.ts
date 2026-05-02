import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/payment/webhook — пользователь нажал "Оплатить", сохраняем заявку
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, eventTitle, price, type, user } = body;

    if (!eventId || !price || !type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const prisma = getPrisma();

    // Получаем telegram_id пользователя из initData
    const initData = req.headers.get('x-telegram-init-data') || '';
    let telegramId = BigInt(0);
    try {
      const params = new URLSearchParams(initData);
      const userJson = params.get('user');
      if (userJson) {
        const u = JSON.parse(userJson);
        telegramId = BigInt(u.id);
      }
    } catch {}

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
