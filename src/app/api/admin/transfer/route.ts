import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/admin-session';
import { getPrisma } from '@/lib/prisma';
import { cryptoBotTransfer } from '@/lib/cryptobot';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/transfer
 * Superadmin manually transfers USDT from CryptoBot app wallet to an organizer.
 * Body: { organizerId: string, amount: number, comment?: string }
 */
export async function POST(req: NextRequest) {
  const me = await getSession();
  if (!me?.isSuperAdmin) {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  const { organizerId, amount, comment } = await req.json();

  if (!organizerId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'organizerId and positive amount required' }, { status: 400 });
  }

  const prisma = getPrisma();
  const org = await prisma.organizer.findUnique({ where: { id: organizerId } });
  if (!org) {
    return NextResponse.json({ error: 'Organizer not found' }, { status: 404 });
  }

  if (!org.telegram_id) {
    return NextResponse.json({ error: 'Organizer has no Telegram ID' }, { status: 400 });
  }

  // Generate unique spend_id for CryptoBot
  const spendId = `topup_${organizerId.slice(0, 8)}_${Date.now()}`;

  try {
    const result = await cryptoBotTransfer(
      BigInt(org.telegram_id),
      Number(amount),
      spendId,
      comment || `Пополнение кошелька от администратора`,
    );

    return NextResponse.json({
      success: true,
      transfer_id: result.transfer_id,
      status: result.status,
      amount: Number(amount),
      orgName: org.first_name || org.username || org.login || organizerId,
    });
  } catch (err: any) {
    console.error('[admin/transfer] CryptoBot transfer error:', err);
    return NextResponse.json({
      error: `Ошибка перевода: ${err.message}`,
    }, { status: 500 });
  }
}
