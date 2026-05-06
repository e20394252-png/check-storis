import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { createSession } from '@/lib/admin-session';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST /api/auth/login-org — вход организатора по логину/паролю
export async function POST(req: NextRequest) {
  try {
    const { login, password } = await req.json();

    if (!login || !password) {
      return NextResponse.json({ error: 'Логин и пароль обязательны' }, { status: 400 });
    }

    const prisma = getPrisma();
    const organizer = await prisma.organizer.findFirst({ where: { login } });

    if (!organizer) {
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
    }

    if (organizer.password !== hashPassword(password)) {
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
    }

    // Создаём сессию
    await createSession(organizer.id);

    return NextResponse.json({
      success: true,
      organizer: {
        id: organizer.id,
        first_name: organizer.first_name,
        login: organizer.login,
        status: organizer.status,
        isSuperAdmin: organizer.isSuperAdmin,
      },
    });
  } catch (err: any) {
    console.error('[login-org]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
