import { NextResponse } from 'next/server';
import { createAuthToken } from '@/lib/auth-tokens';

export const dynamic = 'force-dynamic';

// POST /api/auth/start-login — создать токен и вернуть ссылку на бота
export async function POST() {
  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || '';
  if (!botUsername) {
    return NextResponse.json({ error: 'Bot username not configured' }, { status: 500 });
  }

  const token = createAuthToken();
  const botLink = `https://t.me/${botUsername}?start=auth_${token}`;

  return NextResponse.json({ token, botLink });
}
