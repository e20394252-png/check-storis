import { NextResponse } from 'next/server';
import { getSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN || '';
const IS_TESTNET = process.env.CRYPTOBOT_TESTNET === 'true';
const BASE_URL = IS_TESTNET
  ? 'https://testnet-pay.crypt.bot/api'
  : 'https://pay.crypt.bot/api';

/**
 * POST /api/cryptobot/setup-webhook
 * Sets up the CryptoBot webhook URL to point to our /api/cryptobot/webhook endpoint.
 * Only callable by superadmin.
 */
export async function POST() {
  const me = await getSession();
  if (!me?.isSuperAdmin) {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  if (!CRYPTOBOT_TOKEN) {
    return NextResponse.json({ error: 'CRYPTOBOT_TOKEN не задан в переменных окружения' }, { status: 500 });
  }

  const APP_URL =
    process.env.NEXT_PUBLIC_MINI_APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null);

  if (!APP_URL) {
    return NextResponse.json({ error: 'APP_URL не определён (NEXT_PUBLIC_MINI_APP_URL или RAILWAY_PUBLIC_DOMAIN)' }, { status: 500 });
  }

  const webhookUrl = `${APP_URL}/api/cryptobot/webhook`;

  try {
    // Set webhook via CryptoBot API
    const res = await fetch(`${BASE_URL}/setWebhook`, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: webhookUrl }),
    });

    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({
        error: 'CryptoBot setWebhook failed',
        details: data.error || data,
        webhookUrl,
        rawResponse: data,
      }, { status: 500 });
    }

    // Also get current app info to verify
    const infoRes = await fetch(`${BASE_URL}/getMe`, {
      method: 'POST',
      headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN },
    });
    const infoData = await infoRes.json();

    return NextResponse.json({
      success: true,
      webhookUrl,
      testnet: IS_TESTNET,
      app: infoData.ok ? infoData.result : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/cryptobot/setup-webhook
 * Returns current CryptoBot connection status.
 */
export async function GET() {
  const me = await getSession();
  if (!me?.isSuperAdmin) {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  if (!CRYPTOBOT_TOKEN) {
    return NextResponse.json({
      connected: false,
      error: 'CRYPTOBOT_TOKEN не задан',
      testnet: IS_TESTNET,
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
      });
    }

    return NextResponse.json({
      connected: true,
      testnet: IS_TESTNET,
      app: data.result,
    });
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      error: err.message,
      testnet: IS_TESTNET,
    });
  }
}
