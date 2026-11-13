import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SAMPLES = [
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

/** POST /api/admin/seed-test?key=ADMIN_SECRET — одно рандомное тестовое мероприятие */
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const adminSecret = process.env.ADMIN_SECRET || 'checkStoris2026';
  if (key !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prisma = getPrisma();
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
      },
    });
  }

  const pick = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 14);

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

  return NextResponse.json({
    success: true,
    event: {
      id: event.id,
      title: event.title,
      date: event.date,
      location: event.location,
    },
  });
}
