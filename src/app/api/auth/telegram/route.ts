import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { validateTelegramLogin, type TelegramLoginData } from '@/lib/telegram-auth';
import { createSession, clearSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/telegram — authenticate via Telegram Login Widget
 * Body: TelegramLoginData
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as TelegramLoginData;
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

    if (!validateTelegramLogin(body, botToken)) {
      return NextResponse.json({ error: 'Invalid Telegram auth data' }, { status: 401 });
    }

    const prisma = getPrisma();

    // Check if this user is a super admin
    const superAdminIds = (process.env.SUPER_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isSuperAdmin = superAdminIds.includes(String(body.id));

    // Upsert organizer
    const organizer = await prisma.organizer.upsert({
      where: { telegram_id: BigInt(body.id) },
      update: {
        username: body.username || null,
        first_name: body.first_name || null,
        photo_url: body.photo_url || null,
        // If user is in SUPER_ADMIN_IDS, auto-approve and mark as super admin
        ...(isSuperAdmin ? { status: 'APPROVED', isSuperAdmin: true } : {}),
      },
      create: {
        telegram_id: BigInt(body.id),
        username: body.username || null,
        first_name: body.first_name || null,
        photo_url: body.photo_url || null,
        status: isSuperAdmin ? 'APPROVED' : 'PENDING',
        isSuperAdmin,
      },
    });

    // Create session
    await createSession(organizer.id);

    return NextResponse.json({
      success: true,
      organizer: {
        id: organizer.id,
        first_name: organizer.first_name,
        username: organizer.username,
        status: organizer.status,
        isSuperAdmin: organizer.isSuperAdmin,
      },
    });
  } catch (err) {
    console.error('[api/auth/telegram] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/telegram — logout
 */
export async function DELETE() {
  await clearSession();
  return NextResponse.json({ success: true });
}
