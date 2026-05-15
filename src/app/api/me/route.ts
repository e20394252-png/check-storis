import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { validateInitData, parseUserFromInitData } from '@/lib/twa';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const initData = req.headers.get('x-telegram-init-data') || '';
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!validateInitData(initData, botToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tgUser = parseUserFromInitData(initData);
    if (!tgUser?.id) {
      return NextResponse.json({ error: 'Invalid user data' }, { status: 400 });
    }

    const prisma = getPrisma();

    // Все мероприятия — фронтенд разделит на актуальные и прошедшие
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const user = await prisma.user.findUnique({
      where: { telegram_id: BigInt(tgUser.id) },
      include: { registrations: true },
    });

    const registrationMap: Record<string, { status: string; createdAt: Date; adminNote?: string | null }> = {};
    if (user?.registrations) {
      for (const reg of user.registrations) {
        registrationMap[reg.eventId] = {
          status: reg.status.toLowerCase(),
          createdAt: reg.createdAt,
          adminNote: reg.adminNote,
        };
      }
    }

    return NextResponse.json({
      user: {
        first_name: tgUser.first_name || null,
        username: tgUser.username || null,
      },
      events: events.map(ev => ({
        id: ev.id,
        title: ev.title,
        description: ev.description,
        date: ev.date,
        location: ev.location,
        repostUrl: ev.repostUrl,
        imageUrl: ev.imageUrl,
        price: ev.price,
        discountPrice: ev.discountPrice,
        registration: registrationMap[ev.id] || null,
      })),
    });
  } catch (err) {
    console.error('[api/me] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
