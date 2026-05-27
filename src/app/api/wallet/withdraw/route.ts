import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { validateInitData, parseUserFromInitData } from '@/lib/twa';
import { cryptoBotTransfer } from '@/lib/cryptobot';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/withdraw — user requests a USDT withdrawal via CryptoBot Transfer
 */
export async function POST(req: NextRequest) {
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

    const { amount } = await req.json();
    const MIN_WITHDRAW = 1.5; // CryptoBot minimum for USDT transfer
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (amount < MIN_WITHDRAW) {
      return NextResponse.json({
        error: `Минимальная сумма вывода — ${MIN_WITHDRAW} USDT. Накопите ещё ${(MIN_WITHDRAW - amount).toFixed(2)} USDT.`,
        code: 'AMOUNT_TOO_SMALL',
      }, { status: 400 });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { telegram_id: BigInt(tgUser.id) },
      include: { wallet: true },
    });

    if (!user?.wallet) {
      return NextResponse.json({ error: 'No wallet found' }, { status: 400 });
    }

    if (user.wallet.balance < amount) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    // Create withdrawal record
    const withdrawal = await prisma.withdrawal.create({
      data: {
        walletId: user.wallet.id,
        amount,
        status: 'pending',
      },
    });

    try {
      // Execute CryptoBot transfer
      const result = await cryptoBotTransfer(
        user.telegram_id,
        amount,
        withdrawal.id,
        `Выплата за репосты — check-storis`,
      );

      // Update withdrawal and wallet
      await prisma.$transaction([
        prisma.withdrawal.update({
          where: { id: withdrawal.id },
          data: {
            status: 'completed',
            transferId: String(result.transfer_id),
          },
        }),
        prisma.userWallet.update({
          where: { id: user.wallet.id },
          data: {
            balance: { decrement: amount },
            totalPaid: { increment: amount },
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        transferId: result.transfer_id,
        amount,
      });
    } catch (transferErr: any) {
      // Transfer failed — mark withdrawal as failed
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'failed',
          error: transferErr.message || 'Transfer failed',
        },
      });

      // Check for specific CryptoBot errors
      const errMsg = transferErr.message || '';
      if (errMsg.includes('USER_NOT_FOUND') || errMsg.includes('not found')) {
        return NextResponse.json({
          error: 'Для вывода средств необходимо активировать @CryptoBot в Telegram. Нажмите Start в боте @CryptoBot и попробуйте снова.',
          code: 'CRYPTOBOT_NOT_ACTIVATED',
        }, { status: 400 });
      }
      if (errMsg.includes('AMOUNT_TOO_SMALL')) {
        return NextResponse.json({
          error: 'Сумма слишком мала для вывода через CryptoBot. Минимум — 1.5 USDT.',
          code: 'AMOUNT_TOO_SMALL',
        }, { status: 400 });
      }
      if (errMsg.includes('NOT_ENOUGH')) {
        return NextResponse.json({
          error: 'Недостаточно средств на кошельке приложения. Обратитесь к администратору @andrewsochy.',
          code: 'APP_LOW_BALANCE',
        }, { status: 400 });
      }

      return NextResponse.json({ error: errMsg }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[wallet/withdraw] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
