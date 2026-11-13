#!/usr/bin/env node
/**
 * Одно тестовое мероприятие в прод/локаль БД.
 *   set DATABASE_URL=...
 *   node scripts/seed-test-event.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Нужен DATABASE_URL');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

const samples = [
  {
    title: '🎪 Тест: Фестиваль у фонтана',
    description: '**Тестовое** мероприятие для проверки Mini App.\nСделайте репост и приложите скрин.',
    location: 'Москва, Парк',
    repostUrl: 'https://t.me/check_storis_bot',
  },
  {
    title: '🎸 Тест: Acoustic вечер',
    description: 'Демо-событие. Можно удалить из админки.',
    location: 'Санкт-Петербург',
    repostUrl: 'https://t.me/check_storis_bot',
  },
  {
    title: '📸 Тест: Челлендж сторис',
    description: 'Случайный тест — **бесплатный** репост.',
    location: 'Онлайн',
    repostUrl: 'https://t.me/check_storis_bot',
  },
];

const pick = samples[Math.floor(Math.random() * samples.length)];
const eventDate = new Date();
eventDate.setDate(eventDate.getDate() + 14);

async function main() {
  let org = await prisma.organizer.findFirst({
    where: { OR: [{ isSuperAdmin: true }, { status: 'APPROVED' }] },
    orderBy: { createdAt: 'asc' },
  });

  if (!org) {
    org = await prisma.organizer.create({
      data: {
        first_name: 'Test Organizer',
        login: `test_org_${Date.now().toString(36)}`,
        password: 'seed',
        status: 'APPROVED',
        isSuperAdmin: true,
        telegram_id: null,
      },
    });
    console.log('Создан тестовый организатор:', org.id);
  }

  const event = await prisma.event.create({
    data: {
      title: pick.title,
      description: pick.description,
      date: eventDate,
      location: pick.location,
      repostUrl: pick.repostUrl,
      isActive: true,
      isFeatured: true,
      organizerId: org.id,
      isPaidRepost: false,
    },
  });

  console.log('Создано мероприятие:', event.id);
  console.log('Название:', event.title);
  console.log('Дата:', event.date?.toISOString());
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
