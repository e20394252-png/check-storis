/**
 * CryptoBot (Crypto Pay) API client for check-storis
 * Based on bot-storis implementation + createInvoice/webhook verification
 * Docs: https://help.send.tg/en/articles/10279948-crypto-pay-api
 */

import crypto from 'crypto';

const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN || '';
const IS_TESTNET = process.env.CRYPTOBOT_TESTNET === 'true';
const BASE_URL = IS_TESTNET
  ? 'https://testnet-pay.crypt.bot/api'
  : 'https://pay.crypt.bot/api';

if (!CRYPTOBOT_TOKEN) {
  console.warn('[cryptobot] WARNING: CRYPTOBOT_TOKEN is not set! All CryptoBot API calls will fail.');
}

// ── Base request helper ───────────────────────────────────────────────────

async function cryptoBotRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/${method}`, {
    method: 'POST',
    headers: {
      'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!data.ok) {
    const errMsg = data.error
      ? (typeof data.error === 'object' ? JSON.stringify(data.error) : data.error)
      : JSON.stringify(data);
    throw new Error(`CryptoBot API error [${method}]: ${errMsg}`);
  }

  return data.result as T;
}

// ── Exchange rates ────────────────────────────────────────────────────────

type ExchangeRate = { source: string; target: string; rate: string; is_valid: boolean };

/**
 * Get current USDT → RUB rate (how many rubles for 1 USDT)
 */
export async function getUsdtToRubRate(): Promise<number> {
  const rates: ExchangeRate[] = await cryptoBotRequest('getExchangeRates');
  const usdtRub = rates.find(r => r.source === 'USDT' && r.target === 'RUB' && r.is_valid);
  if (!usdtRub) throw new Error('CryptoBot: USDT/RUB rate not found');
  return parseFloat(usdtRub.rate);
}

/**
 * Get current RUB → USDT rate (how many USDT for 1 RUB)
 */
export async function getRubToUsdtRate(): Promise<number> {
  const usdtPerRub = await getUsdtToRubRate();
  return 1 / usdtPerRub;
}

/**
 * Convert rubles to USDT. Rounds to 2 decimals.
 */
export async function rubToUsdt(rubles: number): Promise<number> {
  const rate = await getRubToUsdtRate();
  return Math.round(rubles * rate * 100) / 100;
}

/**
 * Convert USDT to rubles for display. Rounds to 0 decimals.
 */
export async function usdtToRub(usdt: number): Promise<number> {
  const rate = await getUsdtToRubRate();
  return Math.round(usdt * rate);
}

// ── Invoice (for organizer payments) ──────────────────────────────────────

interface InvoiceResult {
  invoice_id: number;
  hash: string;
  bot_invoice_url: string;
  mini_app_invoice_url: string;
  web_app_invoice_url: string;
  status: string;
  amount: string;
}

/**
 * Create an invoice for the organizer to pay.
 */
export async function createInvoice(params: {
  amount: number;
  description: string;
  payload: string;
  paidBtnUrl?: string;
}): Promise<InvoiceResult> {
  return cryptoBotRequest<InvoiceResult>('createInvoice', {
    asset: 'USDT',
    amount: params.amount.toString(),
    description: params.description,
    payload: params.payload,
    paid_btn_name: params.paidBtnUrl ? 'callback' : undefined,
    paid_btn_url: params.paidBtnUrl || undefined,
    allow_comments: false,
    allow_anonymous: false,
  });
}

// ── Transfer (for user payouts) ───────────────────────────────────────────

interface TransferResult {
  transfer_id: number;
  status: string;
  completed_at: string;
}

/**
 * Transfer USDT to a Telegram user via CryptoBot.
 * User must have previously used @CryptoBot.
 */
export async function cryptoBotTransfer(
  telegramUserId: bigint | number,
  amountUsdt: number,
  spendId: string,
  comment?: string,
): Promise<TransferResult> {
  return cryptoBotRequest<TransferResult>('transfer', {
    user_id: Number(telegramUserId),
    asset: 'USDT',
    amount: amountUsdt.toString(),
    spend_id: spendId,
    ...(comment ? { comment } : {}),
  });
}

// ── Balance ───────────────────────────────────────────────────────────────

/**
 * Get CryptoBot app USDT balance.
 */
export async function getCryptoBotBalance(): Promise<number> {
  type Balance = { currency_code: string; available: string };
  const balances: Balance[] = await cryptoBotRequest('getBalance');
  const usdt = balances.find(b => b.currency_code === 'USDT');
  return usdt ? parseFloat(usdt.available) : 0;
}

// ── Webhook signature verification ────────────────────────────────────────

/**
 * Verify CryptoBot webhook signature (HMAC-SHA-256).
 * @param rawBody - raw JSON string of request body
 * @param signature - value of crypto-pay-api-signature header
 */
export function verifyCryptoBotSignature(rawBody: string, signature: string): boolean {
  if (!CRYPTOBOT_TOKEN || !signature) return false;
  const secret = crypto.createHash('sha256').update(CRYPTOBOT_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return hmac === signature;
}
