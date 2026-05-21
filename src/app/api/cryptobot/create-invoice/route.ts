import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/admin-session';
import { createInvoice } from '@/lib/cryptobot';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cryptobot/create-invoice
 * Organizer creates a CryptoBot invoice to fund a paid repost campaign.
 */
export async function POST(req: NextRequest) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.status !== 'APPROVED') return NextResponse.json({ error: 'Not approved' }, { status: 403 });

  try {
    const { eventId, additionalSlots } = await req.json();
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });

    const prisma = getPrisma();
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    if (!me.isSuperAdmin && event.organizerId !== me.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!event.isPaidRepost) {
      return NextResponse.json({ error: 'Event is not a paid repost campaign' }, { status: 400 });
    }

    // Calculate amount to pay
    let amountUsdt: number;
    let description: string;

    if (additionalSlots && additionalSlots > 0) {
      // Докупка дополнительных слотов
      const extraBudget = (event.repostRewardUsdt || 0) * additionalSlots;
      const extraTotal = Math.round(extraBudget * 1.2 * 100) / 100; // +20% commission
      amountUsdt = extraTotal;
      description = `Докупка ${additionalSlots} сторис для "${event.title}"`;
    } else {
      // Первичная оплата
      if (event.campaignStatus && event.campaignStatus !== 'draft') {
        return NextResponse.json({ error: 'Campaign already funded or active' }, { status: 400 });
      }
      amountUsdt = event.campaignTotal || 0;
      if (amountUsdt <= 0) {
        return NextResponse.json({ error: 'Campaign total is 0' }, { status: 400 });
      }
      description = `Оплата кампании "${event.title}" (${event.repostsNeeded} сторис)`;
    }

    const APP_URL = process.env.NEXT_PUBLIC_MINI_APP_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000');

    const invoice = await createInvoice({
      amount: amountUsdt,
      description,
      payload: JSON.stringify({
        eventId: event.id,
        organizerId: me.id,
        additionalSlots: additionalSlots || 0,
      }),
      paidBtnUrl: `${APP_URL}/admin`,
    });

    // Update event with invoice info
    const updateData: Record<string, unknown> = {
      invoiceId: String(invoice.invoice_id),
      invoiceUrl: invoice.bot_invoice_url,
    };
    if (!additionalSlots) {
      updateData.campaignStatus = 'pending_payment';
    }

    await prisma.event.update({
      where: { id: eventId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      invoiceUrl: invoice.bot_invoice_url,
      invoiceId: invoice.invoice_id,
      amount: amountUsdt,
    });
  } catch (err: any) {
    console.error('[create-invoice] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
