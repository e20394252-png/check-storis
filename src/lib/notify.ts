/**
 * Telegram notification helper for check-storis
 * Sends messages to users via Bot API using simple fetch
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL =
  process.env.NEXT_PUBLIC_MINI_APP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'https://check-storis-production-673a.up.railway.app');

async function sendMessage(chatId: string | number | bigint, text: string, extra?: object): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.warn('[notify] TELEGRAM_BOT_TOKEN not set, skipping notification');
    return false;
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
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notify] Failed to send notification:', err);
    return false;
  }
}

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Конвертирует markdown-разметку из описания мероприятия в Telegram HTML */
export function markdownToTgHtml(text: string): string {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<i>$1</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

async function sendPhoto(
  chatId: string | number | bigint,
  base64Image: string,
  caption: string,
  replyMarkup: object
) {
  if (!BOT_TOKEN) return false;
  try {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Use Telegraf's telegram helper — handles multipart correctly
    const { bot } = await import('@/lib/bot');
    await bot.telegram.sendPhoto(
      chatId.toString(),
      { source: buffer },
      {
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup as any,
      }
    );
    return true;
  } catch (err) {
    console.error('[notify] sendPhoto failed, will send text fallback:', err);
    return false;
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
    `Ты в списке участников <b>${escapeHtml(eventTitle)}</b> ✅\n\n` +
    (eventDate ? `📅 Дата: ${escapeHtml(eventDate)}\n` : '') +
    (eventLocation ? `📍 Место: ${escapeHtml(eventLocation)}\n` : '') +
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
    `К сожалению, мы не смогли подтвердить твой репост для <b>${escapeHtml(eventTitle)}</b>.\n\n` +
    (adminNote ? `Причина: ${escapeHtml(adminNote)}\n\n` : '') +
    `Загрузи скриншот повторно — убедись, что репост виден в твоём профиле.`,
    tryAgainButton
  );
}

/** Notify admin(s) about new pending registration — sends photo + buttons
 *  Supports multiple admins via ADMIN_CHAT_IDS="id1,id2" env var
 *  Falls back to single ADMIN_CHAT_ID for backward compat
 */
export async function notifyAdminNewRegistration(
  registrationId: string,
  userName: string,
  username?: string | null,
  proofBase64?: string | null
) {
  // Support both ADMIN_CHAT_IDS (comma-separated) and legacy ADMIN_CHAT_ID
  const raw = process.env.ADMIN_CHAT_IDS || process.env.ADMIN_CHAT_ID || '';
  const adminIds = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (adminIds.length === 0) return;

  const caption =
    `🔔 <b>Новая заявка на проверку!</b>\n\n` +
    `👤 ${escapeHtml(userName)}${username ? ` (@${escapeHtml(username)})` : ''}\n\n` +
    `<a href="${APP_URL}/admin?key=${process.env.ADMIN_SECRET}">Открыть панель модератора →</a>`;

  const replyMarkup = JSON.stringify({
    inline_keyboard: [[
      { text: '✅ Одобрить', callback_data: `reg:approve:${registrationId}` },
      { text: '❌ Отклонить', callback_data: `reg:reject:${registrationId}` },
    ]]
  });

  // Send to all admins in parallel
  await Promise.all(adminIds.map(async (adminId) => {
    if (proofBase64) {
      const sent = await sendPhoto(adminId, proofBase64, caption, JSON.parse(replyMarkup));
      if (!sent) {
        // Fallback: text only if photo failed
        await sendMessage(adminId, caption, {
          reply_markup: replyMarkup,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
      }
    } else {
      await sendMessage(adminId, caption, {
        reply_markup: replyMarkup,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    }
  }));
}

/** Broadcast event announcement to list of users via bot */
export async function broadcastEventPush(
  event: { id: string; title: string; description?: string | null; date?: Date | null; location?: string | null; repostUrl?: string | null },
  telegramIds: bigint[]
): Promise<{ sent: number; failed: number }> {
  const dateStr = event.date
    ? new Date(event.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const text =
    `📣 <b>${escapeHtml(event.title)}</b>\n\n` +
    (event.description ? `${markdownToTgHtml(event.description)}\n\n` : '') +
    (dateStr ? `📅 <b>Дата:</b> ${escapeHtml(dateStr)}\n` : '') +
    (event.location ? `📍 <b>Место:</b> ${escapeHtml(event.location)}\n` : '') +
    (event.repostUrl ? `\n🔗 <a href="${escapeHtml(event.repostUrl)}">Открыть публикацию для репоста</a>\n` : '') +
    `\nНажми кнопку ниже чтобы зарегистрироваться!`;

  const replyMarkup = JSON.stringify({
    inline_keyboard: [[{ text: '📱 Зарегистрироваться', web_app: { url: APP_URL } }]],
  });

  let sent = 0;
  let failed = 0;

  for (const telegramId of telegramIds) {
    try {
      const success = await sendMessage(telegramId, text, {
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      });
      if (success) {
        sent++;
      } else {
        failed++;
      }
      await new Promise(r => setTimeout(r, 50)); // ~20 msg/sec — Telegram rate limit
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

// ─── Уведомления суперадмину ──────────────────────────────────────────────

function getSuperAdminIds(): string[] {
  return (process.env.SUPER_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Уведомить суперадмина о новом организаторе */
export async function notifySuperAdminNewOrganizer(organizerId: string, name: string, login: string) {
  const ids = getSuperAdminIds();
  if (ids.length === 0) return;

  const adminUrl = APP_URL + '/admin';
  const text =
    `👤 <b>Новый организатор!</b>\n\n` +
    `Имя: <b>${escapeHtml(name)}</b>\n` +
    `Логин: <b>${escapeHtml(login)}</b>\n\n` +
    `👉 <a href="${adminUrl}">Открыть панель</a> для одобрения`;

  await Promise.all(ids.map(id => sendMessage(id, text)));
}

/** Уведомить суперадмина о новом мероприятии от организатора */
export async function notifySuperAdminNewEvent(eventId: string, title: string, organizerName: string) {
  const ids = getSuperAdminIds();
  if (ids.length === 0) return;

  const adminUrl = APP_URL + '/admin';
  const text =
    `📋 <b>Новое мероприятие на проверку!</b>\n\n` +
    `📌 <b>${escapeHtml(title)}</b>\n` +
    `👤 Организатор: ${escapeHtml(organizerName)}\n\n` +
    `Мероприятие ожидает активации.\n` +
    `👉 <a href="${adminUrl}">Открыть панель</a>`;

  await Promise.all(ids.map(id => sendMessage(id, text)));
}
