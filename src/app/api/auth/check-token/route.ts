import { NextRequest, NextResponse } from 'next/server';
import { consumeAuthToken, getAuthToken } from '@/lib/auth-tokens';
import { createSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// GET /api/auth/check-token?token=X — проверить статус токена
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 400 });

  const t = getAuthToken(token);
  if (!t) return NextResponse.json({ status: 'expired' });
  if (!t.verified) return NextResponse.json({ status: 'pending' });

  // Токен подтверждён — создаём сессию и потребляем токен
  const consumed = consumeAuthToken(token);
  if (!consumed || !consumed.organizerId) {
    return NextResponse.json({ status: 'expired' });
  }

  await createSession(consumed.organizerId);

  return NextResponse.json({
    status: 'verified',
    organizer: {
      id: consumed.organizerId,
      first_name: consumed.firstName,
      username: consumed.username,
    },
  });
}
