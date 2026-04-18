/**
 * Telegram notification helper for check-storis
 * Sends messages to users via Bot API using simple fetch
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_MINI_APP_URL || 'https://check-storis.onrender.com';

async function sendMessage(chatId: string | number | bigint, text: string, extra?: object) {
  if (!BOT_TOKEN) {
    console.warn('[notify] TELEGRAM_BOT_TOKEN not set, skipping notification');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        parse_mode: 'HTML',
        ...extra,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[notify] Telegram API error:', err);
    }
  } catch (err) {
    console.error('[notify] Failed to send notification:', err);
  }
}

const openAppButton = {
  reply_markup: JSON.stringify({
    inline_keyboard: [[{ text: '📱 Открыть приложение', web_app: { url: APP_URL } }]],
  }),
};

const tryAgainButton = {
  reply_markup: JSON.stringify({
    inline_keyboard: [[{ text: '📸 Попробовать снова', web_app: { url: APP_URL } }]],
  }),
};

// ─── Notification functions ────────────────────────────────────────────────

/** Send notification when admin approves registration */
export async function notifyRegistrationApproved(
  telegramId: bigint,
  eventTitle: string,
  eventDate?: string | null,
  eventLocation?: string | null,
  username?: string | null
) {
  await sendMessage(telegramId,
    `🎉 <b>Регистрация подтверждена!</b>\n\n` +
    `Ты в списке участников <b>${eventTitle}</b> ✅\n\n` +
    (eventDate ? `📅 Дата: ${eventDate}\n` : '') +
    (eventLocation ? `📍 Место: ${eventLocation}\n` : '') +
    `\nДо встречи!`,
    openAppButton
  );
}

/** Send notification when admin rejects registration */
export async function notifyRegistrationRejected(
  telegramId: bigint,
  eventTitle: string,
  adminNote?: string | null,
  username?: string | null
) {
  await sendMessage(telegramId,
    `⚠️ <b>Скриншот не прошёл проверку</b>\n\n` +
    `К сожалению, мы не смогли подтвердить твой репост для <b>${eventTitle}</b>.\n\n` +
    (adminNote ? `Причина: ${adminNote}\n\n` : '') +
    `Загрузи скриншот повторно — убедись, что репост виден в твоём профиле.`,
    tryAgainButton
  );
}

/** Notify admin group about new pending registration */
export async function notifyAdminNewRegistration(
  registrationId: string,
  userName: string,
  username?: string | null
) {
  const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
  if (!ADMIN_CHAT_ID) return;

  await sendMessage(ADMIN_CHAT_ID,
    `🔔 <b>Новая заявка на проверку!</b>\n\n` +
    `👤 ${userName}${username ? ` (@${username})` : ''}\n\n` +
    `<a href="${APP_URL}/admin?key=${process.env.ADMIN_SECRET}">Открыть панель модератора →</a>`,
    {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [
            { text: '✅ Одобрить', callback_data: `reg:approve:${registrationId}` },
            { text: '❌ Отклонить', callback_data: `reg:reject:${registrationId}` },
          ]
        ]
      }),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }
  );
}
