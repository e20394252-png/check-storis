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
      include: {
        registrations: true,
        wallet: true,
      },
    });

    const registrationMap: Record<string, { status: string; createdAt: Date; adminNote?: string | null; paidAmount?: number | null }> = {};
    if (user?.registrations) {
      for (const reg of user.registrations) {
        registrationMap[reg.eventId] = {
          status: reg.status.toLowerCase(),
          createdAt: reg.createdAt,
          adminNote: reg.adminNote,
          paidAmount: reg.paidAmount,
        };
      }
    }

    return NextResponse.json({
      user: {
        first_name: tgUser.first_name || null,
        username: tgUser.username || null,
      },
      wallet: user?.wallet ? {
        balance: user.wallet.balance,
        totalEarned: user.wallet.totalEarned,
        totalPaid: user.wallet.totalPaid,
      } : null,
      events: events
        .filter(ev => {
          // For paid reposts: only show if campaign is active
          if (ev.isPaidRepost) {
            return ev.campaignStatus === 'active' && ev.isActive;
          }
          return true; // non-paid: show all as before
        })
        .map(ev => ({
          id: ev.id,
          title: ev.title,
          description: ev.description,
          date: ev.date,
          location: ev.location,
          repostUrl: ev.repostUrl,
          imageUrl: ev.imageUrl,
          price: ev.price,
          discountPrice: ev.discountPrice,
          // Paid repost fields
          isPaidRepost: ev.isPaidRepost,
          repostRewardUsdt: ev.repostRewardUsdt,
          repostsNeeded: ev.repostsNeeded,
          repostsFilled: ev.repostsFilled,
          campaignStatus: ev.campaignStatus,
          registration: registrationMap[ev.id] || null,
        })),
    });
  } catch (err) {
    console.error('[api/me] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
