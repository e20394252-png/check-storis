import { NextResponse } from 'next/server';
import { getSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN || '';
const IS_TESTNET = process.env.CRYPTOBOT_TESTNET === 'true';
const BASE_URL = IS_TESTNET
  ? 'https://testnet-pay.crypt.bot/api'
  : 'https://pay.crypt.bot/api';

/**
 * GET /api/cryptobot/setup-webhook
 * Returns CryptoBot connection status + webhook URL for manual setup.
 */
export async function GET() {
  const me = await getSession();
  if (!me?.isSuperAdmin) {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  const APP_URL =
    process.env.NEXT_PUBLIC_MINI_APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null);

  const webhookUrl = APP_URL ? `${APP_URL}/api/cryptobot/webhook` : null;

  if (!CRYPTOBOT_TOKEN) {
    return NextResponse.json({
      connected: false,
      error: 'CRYPTOBOT_TOKEN не задан',
      testnet: IS_TESTNET,
      webhookUrl,
    });
  }

  try {
    const res = await fetch(`${BASE_URL}/getMe`, {
      method: 'POST',
      headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN },
    });
    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({
        connected: false,
        error: 'Не удалось подключиться к CryptoBot',
        testnet: IS_TESTNET,
        webhookUrl,
      });
    }

    return NextResponse.json({
      connected: true,
      testnet: IS_TESTNET,
      app: data.result,
      webhookUrl,
    });
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      error: err.message,
      testnet: IS_TESTNET,
      webhookUrl,
    });
  }
}

/**
 * POST /api/cryptobot/setup-webhook
 * Tests the webhook by sending a test ping to our own endpoint.
 */
export async function POST() {
  const me = await getSession();
  if (!me?.isSuperAdmin) {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  const APP_URL =
    process.env.NEXT_PUBLIC_MINI_APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null);

  if (!APP_URL) {
    return NextResponse.json({ error: 'APP_URL не определён' }, { status: 500 });
  }

  const webhookUrl = `${APP_URL}/api/cryptobot/webhook`;

  // Test that our webhook endpoint is reachable
  try {
    const testRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });
    const testStatus = testRes.status;

    return NextResponse.json({
      success: true,
      webhookUrl,
      testStatus,
      message: testStatus === 200 || testStatus === 400
        ? 'Webhook URL доступен и работает!'
        : `Webhook ответил статусом ${testStatus}`,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      webhookUrl,
      error: `Webhook URL недоступен: ${err.message}`,
    }, { status: 500 });
  }
}
