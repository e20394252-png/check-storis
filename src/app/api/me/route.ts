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

    // Get active event
    const event = await prisma.event.findFirst({ where: { isActive: true } });

    // Find user
    const user = await prisma.user.findUnique({
      where: { telegram_id: BigInt(tgUser.id) },
      include: {
        registration: true,
      },
    });

    return NextResponse.json({
      user: {
        first_name: tgUser.first_name || null,
        username: tgUser.username || null,
      },
      registration: user?.registration
        ? {
            status: user.registration.status.toLowerCase(),
            eventId: user.registration.eventId,
            createdAt: user.registration.createdAt,
            adminNote: user.registration.adminNote,
          }
        : null,
      event: event
        ? {
            id: event.id,
            title: event.title,
            description: event.description,
            date: event.date,
            location: event.location,
            repostUrl: event.repostUrl,
          }
        : null,
    });
  } catch (err) {
    console.error('[api/me] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
