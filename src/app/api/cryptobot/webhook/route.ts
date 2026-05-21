import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { verifyCryptoBotSignature } from '@/lib/cryptobot';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cryptobot/webhook
 * CryptoBot calls this when an invoice is paid.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('crypto-pay-api-signature') || '';

    // Verify signature
    if (!verifyCryptoBotSignature(rawBody, signature)) {
      console.warn('[cryptobot-webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const body = JSON.parse(rawBody);

    if (body.update_type !== 'invoice_paid') {
      return NextResponse.json({ ok: true }); // ignore non-payment updates
    }

    const invoice = body.payload;
    if (!invoice?.payload) {
      console.warn('[cryptobot-webhook] No payload in invoice');
      return NextResponse.json({ ok: true });
    }

    const { eventId, organizerId, additionalSlots } = JSON.parse(invoice.payload);
    const paidAmount = parseFloat(invoice.amount);

    const prisma = getPrisma();

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organizer: true },
    });

    if (!event) {
      console.error('[cryptobot-webhook] Event not found:', eventId);
      return NextResponse.json({ ok: true });
    }

    if (additionalSlots && additionalSlots > 0) {
      // Докупка слотов
      const newRepostsNeeded = (event.repostsNeeded || 0) + additionalSlots;
      const newBudget = (event.repostRewardUsdt || 0) * newRepostsNeeded;
      const newTotal = Math.round(newBudget * 1.2 * 100) / 100;

      await prisma.event.update({
        where: { id: eventId },
        data: {
          repostsNeeded: newRepostsNeeded,
          campaignBudget: newBudget,
          campaignTotal: newTotal,
          campaignStatus: 'active', // ensure active after top-up
        },
      });
    } else {
      // Первичная оплата — активируем кампанию
      await prisma.event.update({
        where: { id: eventId },
        data: {
          campaignStatus: 'active',
          isActive: true, // make visible to users
        },
      });
    }

    // Update organizer balance
    await prisma.organizerBalance.upsert({
      where: { organizerId },
      create: {
        organizerId,
        balance: 0,
        totalDeposited: paidAmount,
        totalSpent: 0,
      },
      update: {
        totalDeposited: { increment: paidAmount },
      },
    });

    // Notify organizer via Telegram
    const orgTelegramId = event.organizer?.telegram_id;
    if (orgTelegramId) {
      const { notifyOrgPaymentReceived } = await import('@/lib/notify');
      notifyOrgPaymentReceived(
        orgTelegramId,
        event.title,
        paidAmount,
        additionalSlots > 0 ? additionalSlots : undefined,
      ).catch(console.error);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[cryptobot-webhook] Error:', err);
    return NextResponse.json({ ok: true }); // always 200 to prevent retries on our errors
  }
}
