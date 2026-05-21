import { Telegraf } from 'telegraf';
import { getPrisma } from '@/lib/prisma';
import { notifyRegistrationApproved, notifyRegistrationRejected } from '@/lib/notify';

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'dummy_token');

const APP_URL =
  process.env.NEXT_PUBLIC_MINI_APP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'https://check-storis-production-673a.up.railway.app');
// ── /start handler — авторизация через login_ deep link ───────────────────
// Обычный /start (без payload) обработает ЛидТех.
// /start login_TOKEN — авторизация организатора (наш webhook).
bot.start(async (ctx) => {
  const payload = (ctx as any).startPayload || '';

  // Если нет login_ payload — пропускаем, ЛидТех обработает
  if (!payload.startsWith('login_')) return;

  const token = payload.slice(6); // убираем "login_"
  const prisma = getPrisma();
  const { verifyAuthToken } = await import('@/lib/auth-tokens');

  const tgId = BigInt(ctx.from.id);
  const superAdminIds = (process.env.SUPER_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isSuperAdmin = superAdminIds.includes(String(ctx.from.id));

  const organizer = await prisma.organizer.upsert({
    where: { telegram_id: tgId },
    update: {
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      ...(isSuperAdmin ? { status: 'APPROVED', isSuperAdmin: true } : {}),
    },
    create: {
      telegram_id: tgId,
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      status: isSuperAdmin ? 'APPROVED' : 'PENDING',
      isSuperAdmin,
    },
  });

  const ok = verifyAuthToken(token, {
    organizerId: organizer.id,
    telegramId: tgId,
    firstName: ctx.from.first_name,
    username: ctx.from.username,
  });

  if (ok) {
    await ctx.reply(
      `✅ Авторизация успешна!\n\nВернитесь на сайт — вход выполнен автоматически.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('❌ Ссылка для входа устарела. Попробуйте ещё раз на сайте.');
  }
});

// ── Callback query handler (approve/reject from admin Telegram message) ────
bot.on('callback_query', async (ctx) => {
  try {
    const data = (ctx.callbackQuery as any).data as string;
    if (!data) return;

    // ── Standard registration approve/reject (admin) ──
    if (data.startsWith('reg:')) {
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
      return;
    }

    // ── Paid repost approve/reject (organizer) ──
    if (data.startsWith('paid_reg:')) {
      const [, action, registrationId] = data.split(':');

      const prisma = getPrisma();
      const registration = await prisma.registration.findUnique({
        where: { id: registrationId },
        include: { user: true, event: { include: { organizer: true } } },
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

      // Verify the caller is the event organizer
      const callerTgId = BigInt(ctx.from.id);
      if (registration.event?.organizer?.telegram_id !== callerTgId) {
        await ctx.answerCbQuery('⛔ Вы не организатор этого мероприятия');
        return;
      }

      const event = registration.event;
      const telegramId = registration.user?.telegram_id;
      const eventTitle = event?.title || 'Мероприятие';

      if (action === 'approve') {
        const rewardAmount = event?.repostRewardUsdt || 0;

        if (rewardAmount > 0) {
          // 1. Credit user wallet
          await prisma.userWallet.upsert({
            where: { userId: registration.userId },
            create: {
              userId: registration.userId,
              balance: rewardAmount,
              totalEarned: rewardAmount,
            },
            update: {
              balance: { increment: rewardAmount },
              totalEarned: { increment: rewardAmount },
            },
          });

          // 2. Update registration
          await prisma.registration.update({
            where: { id: registrationId },
            data: { status: 'APPROVED', paidAmount: rewardAmount },
          });

          // 3. Update campaign progress
          const updatedEvent = await prisma.event.update({
            where: { id: registration.eventId },
            data: { repostsFilled: { increment: 1 } },
          });

          // 4. Check if campaign completed
          if (updatedEvent.repostsNeeded && updatedEvent.repostsFilled >= updatedEvent.repostsNeeded) {
            await prisma.event.update({
              where: { id: registration.eventId },
              data: { campaignStatus: 'completed', isActive: false },
            });
            const { notifyOrgCampaignCompleted } = await import('@/lib/notify');
            notifyOrgCampaignCompleted(callerTgId, eventTitle).catch(console.error);
          }
        } else {
          await prisma.registration.update({
            where: { id: registrationId },
            data: { status: 'APPROVED' },
          });
        }

        await ctx.answerCbQuery(`✅ Одобрено! +${rewardAmount} USDT юзеру`);
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [[{ text: `✅ ОДОБРЕНО (+${rewardAmount} USDT)`, callback_data: 'done' }]],
        });

        // Notify user
        if (telegramId && rewardAmount > 0) {
          const { notifyUserPaidRepostApproved } = await import('@/lib/notify');
          notifyUserPaidRepostApproved(telegramId, rewardAmount, eventTitle).catch(console.error);
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
          const { notifyUserPaidRepostRejected } = await import('@/lib/notify');
          notifyUserPaidRepostRejected(telegramId, eventTitle).catch(console.error);
        }
      }
      return;
    }
  } catch (err) {
    console.error('callback_query error:', err);
    await ctx.answerCbQuery('Ошибка сервера');
  }
});

bot.catch((err, ctx) => {
  console.error(`Bot error for ${ctx.updateType}`, err);
});

