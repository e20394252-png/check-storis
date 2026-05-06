import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { createSession } from '@/lib/admin-session';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST /api/auth/register-org — регистрация организатора по логину/паролю
export async function POST(req: NextRequest) {
  try {
    const { login, password, firstName } = await req.json();

    if (!login || !password) {
      return NextResponse.json({ error: 'Логин и пароль обязательны' }, { status: 400 });
    }
    if (login.length < 3) {
      return NextResponse.json({ error: 'Логин минимум 3 символа' }, { status: 400 });
    }
    if (password.length < 4) {
      return NextResponse.json({ error: 'Пароль минимум 4 символа' }, { status: 400 });
    }

    const prisma = getPrisma();

    // Проверяем уникальность логина
    const existing = await prisma.organizer.findFirst({ where: { login } });
    if (existing) {
      return NextResponse.json({ error: 'Этот логин уже занят' }, { status: 400 });
    }

    const organizer = await prisma.organizer.create({
      data: {
        login,
        password: hashPassword(password),
        first_name: firstName || login,
        telegram_id: BigInt(0), // нет telegram для организаторов по логину
        status: 'PENDING',
        isSuperAdmin: false,
      },
    });

    // Создаём сессию сразу (покажем экран "ожидание аппрува")
    await createSession(organizer.id);

    return NextResponse.json({
      success: true,
      organizer: {
        id: organizer.id,
        first_name: organizer.first_name,
        login: organizer.login,
        status: organizer.status,
        isSuperAdmin: false,
      },
    });
  } catch (err: any) {
    console.error('[register-org]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
