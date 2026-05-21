import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { validateInitData, parseUserFromInitData } from '@/lib/twa';
import { usdtToRub } from '@/lib/cryptobot';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/me — user wallet balance + history
 */
export async function GET(req: NextRequest) {
  try {
    const initData = req.headers.get('x-telegram-init-data') || '';
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!validateInitData(initData, botToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tgUser = parseUserFromInitData(initData);
    if (!tgUser?.id) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { telegram_id: BigInt(tgUser.id) },
      include: {
        wallet: {
          include: {
            withdrawals: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        },
        registrations: {
          where: { paidAmount: { not: null } },
          include: { event: { select: { title: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!user) {
      return NextResponse.json({
        balance: 0, balanceRub: 0, totalEarned: 0, totalPaid: 0, history: [],
      });
    }

    const wallet = user.wallet;

    // Get current rate for display
    let rubRate = 90; // fallback
    try { rubRate = await usdtToRub(1); } catch { /* use fallback */ }

    // Build history
    const history: Array<{
      type: string; amount: number; amountRub: number;
      title?: string; status?: string; date: string;
    }> = [];

    // Earnings
    for (const reg of user.registrations) {
      if (reg.paidAmount && reg.status === 'APPROVED') {
        history.push({
          type: 'earn',
          amount: reg.paidAmount,
          amountRub: Math.round(reg.paidAmount * rubRate),
          title: reg.event?.title || 'Мероприятие',
          date: reg.updatedAt.toISOString(),
        });
      }
    }

    // Withdrawals
    if (wallet?.withdrawals) {
      for (const w of wallet.withdrawals) {
        history.push({
          type: 'withdraw',
          amount: w.amount,
          amountRub: Math.round(w.amount * rubRate),
          status: w.status,
          date: w.createdAt.toISOString(),
        });
      }
    }

    // Sort by date desc
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const balance = wallet?.balance || 0;

    return NextResponse.json({
      balance,
      balanceRub: Math.round(balance * rubRate),
      totalEarned: wallet?.totalEarned || 0,
      totalPaid: wallet?.totalPaid || 0,
      history: history.slice(0, 30),
    });
  } catch (err: any) {
    console.error('[wallet/me] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
