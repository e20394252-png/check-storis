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

  // ── Referral deep link: /start ref_XXXXXX ──
  if (payload.startsWith('ref_')) {
    const refCode = payload.slice(4); // remove "ref_"
    const prisma = getPrisma();
    const tgId = BigInt(ctx.from.id);

    // Don't let user refer themselves
    const referrer = await prisma.user.findFirst({ where: { referralCode: refCode } });
    if (!referrer || referrer.telegram_id === tgId) {
      // Still open the app — just no referral link
      await ctx.reply(
        `👋 Добро пожаловать в CheckStoris!\n\nЗарабатывай на репостах сторис 💰`,
        { reply_markup: { inline_keyboard: [[{ text: '📱 Открыть приложение', web_app: { url: APP_URL } }]] } }
      );
      return;
    }

    // Generate referralCode for new user
    const generateCode = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      return code;
    };

    // Upsert user with referral link
    const existingUser = await prisma.user.findUnique({ where: { telegram_id: tgId } });

    if (existingUser?.referredById) {
      // Already has a referrer — just open app
      await ctx.reply(
        `👋 С возвращением!\n\nОткройте приложение, чтобы заработать на репостах 💰`,
        { reply_markup: { inline_keyboard: [[{ text: '📱 Открыть приложение', web_app: { url: APP_URL } }]] } }
      );
      return;
    }

    // Create or update user with referral
    let newCode = generateCode();
    // Ensure unique code
    while (await prisma.user.findFirst({ where: { referralCode: newCode } })) {
      newCode = generateCode();
    }

    await prisma.user.upsert({
      where: { telegram_id: tgId },
      create: {
        telegram_id: tgId,
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || null,
        referralCode: newCode,
        referredById: referrer.id,
      },
      update: {
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || null,
        referredById: referrer.id,
        ...(existingUser?.referralCode ? {} : { referralCode: newCode }),
      },
    });

    // Notify referrer
    const { notifyNewReferral } = await import('@/lib/notify');
    notifyNewReferral(referrer.telegram_id, ctx.from.username || ctx.from.first_name || 'Юзер').catch(console.error);

    await ctx.reply(
      `👋 Добро пожаловать в CheckStoris!\n\nВас пригласил @${referrer.username || referrer.first_name || 'друг'} 🎉\nЗарабатывайте на репостах сторис — ваш друг тоже получит бонус!`,
      { reply_markup: { inline_keyboard: [[{ text: '📱 Открыть приложение', web_app: { url: APP_URL } }]] } }
    );
    return;
  }

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

        // ── Referral bonus ──
        if (rewardAmount > 0) {
          try {
            const user = await prisma.user.findUnique({ where: { id: registration.userId }, select: { id: true, referredById: true, username: true, first_name: true } });
            if (user?.referredById) {
              const referrer = await prisma.user.findUnique({ where: { id: user.referredById }, select: { id: true, telegram_id: true } });
              if (referrer) {
                const REFERRAL_PERCENT = 0.10; // 10%
                const FIRST_REPOST_BONUS = 0.10; // 0.1 USDT
                const commissionBonus = Math.round(rewardAmount * REFERRAL_PERCENT * 100) / 100;
                let totalBonus = commissionBonus;

                // Check if this is the user's first approved paid repost
                const approvedCount = await prisma.registration.count({
                  where: { userId: user.id, status: 'APPROVED', paidAmount: { gt: 0 } },
                });
                const isFirstRepost = approvedCount <= 1; // just approved this one

                // Record commission earning
                await prisma.referralEarning.create({
                  data: { referrerId: referrer.id, referralId: user.id, registrationId, amount: commissionBonus, type: 'commission' },
                });

                if (isFirstRepost) {
                  totalBonus += FIRST_REPOST_BONUS;
                  await prisma.referralEarning.create({
                    data: { referrerId: referrer.id, referralId: user.id, registrationId, amount: FIRST_REPOST_BONUS, type: 'first_repost' },
                  });
                }

                // Credit referrer wallet
                await prisma.userWallet.upsert({
                  where: { userId: referrer.id },
                  create: { userId: referrer.id, balance: totalBonus, totalEarned: totalBonus },
                  update: { balance: { increment: totalBonus }, totalEarned: { increment: totalBonus } },
                });

                // Notify referrer
                const { notifyReferrerBonus } = await import('@/lib/notify');
                notifyReferrerBonus(
                  referrer.telegram_id,
                  totalBonus,
                  user.username || user.first_name || 'Юзер',
                  isFirstRepost,
                ).catch(console.error);
              }
            }
          } catch (refErr) {
            console.error('[referral] bonus error:', refErr);
          }
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

