import { NextResponse } from 'next/server';
import { getSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me — get current session info
 */
export async function GET() {
  const organizer = await getSession();
  if (!organizer) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    organizer: {
      id: organizer.id,
      telegram_id: organizer.telegram_id.toString(),
      first_name: organizer.first_name,
      username: organizer.username,
      photo_url: organizer.photo_url,
      status: organizer.status,
      isSuperAdmin: organizer.isSuperAdmin,
    },
  });
}
