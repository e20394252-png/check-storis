import { Telegraf } from 'telegraf';
import { getPrisma } from '@/lib/prisma';
import { notifyRegistrationApproved, notifyRegistrationRejected } from '@/lib/notify';

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'dummy_token');

const APP_URL = process.env.NEXT_PUBLIC_MINI_APP_URL || 'https://check-storis.onrender.com';

// ── /start handler ─────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const prisma = getPrisma();

  // Try to get active event title for personalized greeting
  const event = await prisma.event.findFirst({ where: { isActive: true } }).catch(() => null);
  const eventTitle = event?.title || 'мероприятие';
  const repostUrl = event?.repostUrl;

  const firstName = ctx.from?.first_name || 'друг';

  return ctx.reply(
    `👋 Привет, <b>${firstName}</b>!\n\n` +
    `Хочешь попасть на <b>${eventTitle}</b>?\n\n` +
    (repostUrl
      ? `📌 Сделай репост публикации и покажи нам скриншот:\n${repostUrl}\n\n`
      : '') +
    `Нажми кнопку ниже, чтобы загрузить скриншот и зарегистрироваться!`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '📱 Открыть приложение', web_app: { url: APP_URL } }]],
      },
    }
  );
});

// ── Callback query handler (approve/reject from admin Telegram message) ────
bot.on('callback_query', async (ctx) => {
  try {
    const data = (ctx.callbackQuery as any).data as string;
    if (!data?.startsWith('reg:')) return;

    const [, action, registrationId] = data.split(':');

    const prisma = getPrisma();
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: { user: true, event: true },
    });

    if (!registration) {
      await ctx.answerCbQuery('❌ Заявка не найдена');
      return;
    }

    if (registration.status !== 'PENDING') {
      await ctx.answerCbQuery('⚠️ Уже обработано');
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      return;
    }

    const telegramId = registration.user?.telegram_id;
    const username = registration.user?.username;
    const eventTitle = registration.event?.title || 'Мероприятие';
    const eventDate = registration.event?.date
      ? new Date(registration.event.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;
    const eventLocation = registration.event?.location;

    if (action === 'approve') {
      await prisma.registration.update({
        where: { id: registrationId },
        data: { status: 'APPROVED' },
      });
      await ctx.answerCbQuery('✅ Одобрено!');
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{ text: '✅ ОДОБРЕНО', callback_data: 'done' }]],
      });
      if (telegramId) {
        notifyRegistrationApproved(telegramId, eventTitle, eventDate, eventLocation, username).catch(console.error);
      }
    } else if (action === 'reject') {
      await prisma.registration.update({
        where: { id: registrationId },
        data: { status: 'REJECTED' },
      });
      await ctx.answerCbQuery('❌ Отклонено');
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{ text: '❌ ОТКЛОНЕНО', callback_data: 'done' }]],
      });
      if (telegramId) {
        notifyRegistrationRejected(telegramId, eventTitle, null, username).catch(console.error);
      }
    }
  } catch (err) {
    console.error('callback_query error:', err);
    await ctx.answerCbQuery('Ошибка сервера');
  }
});

bot.catch((err, ctx) => {
  console.error(`Bot error for ${ctx.updateType}`, err);
});
