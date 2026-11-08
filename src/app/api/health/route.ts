import { NextRequest, NextResponse } from 'next/server';
import { getAdminUrl, getAppUrl } from '@/lib/app-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Публичная проверка живости и ссылок (без секретов). */
export async function GET(req: NextRequest) {
  const host = req.headers.get('host');
  const appUrl = getAppUrl(host);
  const adminUrl = getAdminUrl(host);

  const checks: Record<string, { ok: boolean; detail?: string }> = {
    env_database_url: { ok: !!process.env.DATABASE_URL },
    env_telegram_bot_token: { ok: !!process.env.TELEGRAM_BOT_TOKEN },
    env_mini_app_url: {
      ok: !!process.env.NEXT_PUBLIC_MINI_APP_URL,
      detail: process.env.NEXT_PUBLIC_MINI_APP_URL
        ? 'set'
        : 'missing — ссылки в боте берутся из Host или localhost',
    },
    env_bot_username: { ok: !!process.env.NEXT_PUBLIC_BOT_USERNAME },
  };

  let db: { ok: boolean; detail?: string } = { ok: false, detail: 'not_checked' };
  if (process.env.DATABASE_URL) {
    try {
      const { getPrisma } = await import('@/lib/prisma');
      const prisma = getPrisma();
      await prisma.$queryRaw`SELECT 1`;
      db = { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      db = { ok: false, detail: msg.split('\n')[0] };
    }
  } else {
    db = { ok: false, detail: 'DATABASE_URL not set' };
  }
  checks.database = db;

  const criticalOk =
    checks.env_database_url.ok &&
    checks.env_telegram_bot_token.ok &&
    checks.database.ok;

  return NextResponse.json(
    {
      status: criticalOk ? 'ok' : 'degraded',
      appUrl,
      adminUrl,
      miniAppPath: '/',
      api: {
        events: `${appUrl}/api/events`,
        me: `${appUrl}/api/me`,
        telegramWebhook: `${appUrl}/api/webhook/telegram`,
      },
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: criticalOk ? 200 : 503 },
  );
}
