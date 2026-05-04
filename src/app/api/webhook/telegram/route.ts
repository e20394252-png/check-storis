import { NextRequest, NextResponse } from 'next/server';
import { bot } from '@/lib/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Проверяем — это авторизация (/start login_...) или callback (reg:...)?
    const text = body?.message?.text || '';
    const callbackData = body?.callback_query?.data || '';
    const isOurUpdate =
      text.includes('/start login_') ||
      callbackData.startsWith('reg:');

    if (isOurUpdate) {
      // Обрабатываем сами — авторизация или approve/reject
      await bot.handleUpdate(body);
    } else {
      // Всё остальное — проксируем в ЛидТех
      const lidtechWebhook = process.env.LIDTECH_BOT_WEBHOOK_URL || 'https://b860998.leadteh.ru/webhooks/telegram/610732:jHNcejZ9JzDkhaV6u48fWNm5SrkBj8Z6H2fLqH7JhqVrmN0SSPgA3YiSnTe1NtKl';
      if (lidtechWebhook) {
        fetch(lidtechWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(err => console.error('[proxy->lidtech]', err));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook/telegram] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
