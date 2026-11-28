#!/usr/bin/env node
/**
 * Локальный демо-сид: организатор, ивенты, юзер со статусами, кошелёк, рефералы.
 *   DATABASE_URL=... node scripts/seed-demo.mjs
 */
import crypto from 'crypto';
const hashPassword = (p) => crypto.createHash('sha256').update(p).digest('hex');
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Нужен DATABASE_URL');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
const DEMO_TG_ID = 10001n;

async function main() {
  let org = await prisma.organizer.findFirst({
    where: { login: 'demo_admin' },
  });
  if (!org) {
    org = await prisma.organizer.create({
      data: {
        first_name: 'Артур',
        username: 'artur_demo',
        login: 'demo_admin',
        password: hashPassword('demo1234'),
        status: 'APPROVED',
        isSuperAdmin: true,
        telegram_id: DEMO_TG_ID,
      },
    });
    console.log('Организатор:', org.login, '/ demo1234');
  } else {
    console.log('Организатор уже есть:', org.login);
  }

  await prisma.organizerBalance.upsert({
    where: { organizerId: org.id },
    create: { organizerId: org.id, balance: 42.5 },
    update: { balance: 42.5 },
  });

  const titles = [
    { title: '🎪 Фестиваль у фонтана', desc: '**Главное** событие сезона.\nСделайте репост и приложите скрин.', loc: 'Москва, Парк', featured: true, paid: false },
    { title: '🎸 Acoustic вечер', desc: 'Камерный концерт. Репост в сторис.', loc: 'Санкт-Петербург', featured: false, paid: false },
    { title: '💰 Платный репост · Demo', desc: 'За каждый одобренный репост — USDT.', loc: 'Онлайн', featured: false, paid: true },
  ];

  const existing = await prisma.event.count({ where: { organizerId: org.id } });
  let events = await prisma.event.findMany({ where: { organizerId: org.id }, orderBy: { createdAt: 'asc' } });
  if (existing < 3) {
    for (const t of titles.slice(existing)) {
      const date = new Date();
      date.setDate(date.getDate() + 10);
      const ev = await prisma.event.create({
        data: {
          title: t.title,
          description: t.desc,
          date,
          location: t.loc,
          repostUrl: 'https://t.me/check_storis_bot',
          isActive: true,
          isFeatured: t.featured,
          organizerId: org.id,
          price: t.paid ? null : 5000,
          discountPrice: t.paid ? null : 3000,
          isPaidRepost: t.paid,
          repostRewardUsdt: t.paid ? 5 : null,
          repostsNeeded: t.paid ? 20 : null,
          repostsFilled: t.paid ? 3 : 0,
          campaignBudget: t.paid ? 100 : null,
          campaignTotal: t.paid ? 120 : null,
          campaignStatus: t.paid ? 'active' : null,
        },
      });
      events.push(ev);
      console.log('Ивент:', ev.title);
    }
  }

  let user = await prisma.user.findUnique({ where: { telegram_id: DEMO_TG_ID } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        telegram_id: DEMO_TG_ID,
        first_name: 'Мария',
        username: 'maria_demo',
        referralCode: 'DEMO01',
      },
    });
    console.log('Юзер:', user.first_name);
  }

  let friend = await prisma.user.findUnique({ where: { telegram_id: 10002n } });
  if (!friend) {
    friend = await prisma.user.create({
      data: {
        telegram_id: 10002n,
        first_name: 'Иван',
        username: 'ivan_ref',
        referralCode: 'REF002',
        referredById: user.id,
      },
    });
  }

  await prisma.userWallet.upsert({
    where: { userId: user.id },
    create: { userId: user.id, balance: 12.5, totalEarned: 18, totalPaid: 5.5 },
    update: { balance: 12.5, totalEarned: 18, totalPaid: 5.5 },
  });

  const [e0, e1, e2] = events;
  if (e0) {
    await prisma.registration.upsert({
      where: { userId_eventId: { userId: user.id, eventId: e0.id } },
      create: { userId: user.id, eventId: e0.id, status: 'PENDING', proofUrl: 'https://placehold.co/400x700/png', storyUrl: 'https://t.me/stories/demo' },
      update: { status: 'PENDING' },
    });
  }
  if (e1) {
    await prisma.registration.upsert({
      where: { userId_eventId: { userId: user.id, eventId: e1.id } },
      create: { userId: user.id, eventId: e1.id, status: 'APPROVED', proofUrl: 'https://placehold.co/400x700/png', paidAmount: null },
      update: { status: 'APPROVED' },
    });
  }
  if (e2) {
    await prisma.registration.upsert({
      where: { userId_eventId: { userId: user.id, eventId: e2.id } },
      create: { userId: user.id, eventId: e2.id, status: 'REJECTED', proofUrl: 'https://placehold.co/400x700/png', adminNote: 'Скрин обрезан — приложите полный кадр' },
      update: { status: 'REJECTED', adminNote: 'Скрин обрезан — приложите полный кадр' },
    });
  }

  const earnCount = await prisma.referralEarning.count({ where: { referrerId: user.id } });
  if (earnCount === 0) {
    const someReg = await prisma.registration.findFirst({ where: { userId: user.id } });
    await prisma.referralEarning.create({
      data: {
        referrerId: user.id,
        referralId: friend.id,
        registrationId: someReg?.id || 'demo-reg',
        amount: 0.1,
        type: 'first_repost',
      },
    });
  }

  console.log('OK demo seed. login=demo_admin password=demo1234 tg=', DEMO_TG_ID.toString());
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
