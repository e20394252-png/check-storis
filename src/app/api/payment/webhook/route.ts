import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/payment/webhook — отправляет данные пользователя на внешний webhook (LidTech)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body: { eventId, eventTitle, price, type: 'full' | 'discount', user: { first_name, username, telegram_id } }

    const webhookUrl = process.env.LIDTECH_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: 'LIDTECH_WEBHOOK_URL not set' }, { status: 500 });
    }

    const payload = {
      event_id: body.eventId,
      event_title: body.eventTitle,
      price: body.price,
      payment_type: body.type, // 'full' или 'discount'
      user_first_name: body.user?.first_name || '',
      user_username: body.user?.username || '',
      user_telegram_id: body.user?.telegram_id || '',
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    return NextResponse.json({ success: true, status: res.status, response: text });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
