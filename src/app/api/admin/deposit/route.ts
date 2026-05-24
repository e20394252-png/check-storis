import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/admin-session';
import { createInvoice } from '@/lib/cryptobot';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/deposit
 * Superadmin creates an invoice to deposit USDT into the CryptoBot app wallet.
 * Body: { amount: number }
 */
export async function POST(req: NextRequest) {
  const me = await getSession();
  if (!me?.isSuperAdmin) {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  const { amount } = await req.json();
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Positive amount required' }, { status: 400 });
  }

  try {
    const APP_URL = process.env.NEXT_PUBLIC_MINI_APP_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000');

    const invoice = await createInvoice({
      amount: Number(amount),
      description: `Пополнение баланса приложения (admin deposit)`,
      payload: JSON.stringify({ type: 'admin_deposit', adminId: me.id }),
      paidBtnUrl: `${APP_URL}/admin`,
    });

    return NextResponse.json({
      success: true,
      invoiceUrl: invoice.bot_invoice_url,
      amount: Number(amount),
    });
  } catch (err: any) {
    console.error('[admin/deposit] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
