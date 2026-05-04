import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Хранилище кодов (in-memory)
const codes = new Map<string, { code: string; telegramId: bigint; createdAt: number }>();
const CODE_TTL = 5 * 60 * 1000; // 5 минут

function cleanup() {
  const now = Date.now();
  for (const [key, val] of codes) {
    if (now - val.createdAt > CODE_TTL) codes.delete(key);
  }
}

// POST /api/auth/send-code — отправить код в Telegram
export async function POST(req: NextRequest) {
  try {
    const { telegramId } = await req.json();
    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId required' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    cleanup();

    // Генерируем 6-значный код
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const tgId = BigInt(telegramId);
    codes.set(code, { code, telegramId: tgId, createdAt: Date.now() });

    // Отправляем код в Telegram через sendMessage API
    const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: `🔐 Ваш код для входа в админ-панель:\n\n<b>${code}</b>\n\nВведите этот код на сайте. Код действителен 5 минут.`,
        parse_mode: 'HTML',
      }),
    });

    const sendData = await sendRes.json();
    if (!sendData.ok) {
      return NextResponse.json({ error: 'Не удалось отправить сообщение. Убедитесь что вы написали боту /start хотя бы раз.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Код отправлен в Telegram' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/auth/send-code — проверить код и авторизовать
export async function PUT(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: 'code required' }, { status: 400 });
    }

    cleanup();
    const entry = codes.get(code);
    if (!entry) {
      return NextResponse.json({ error: 'Неверный или истекший код' }, { status: 400 });
    }

    const prisma = getPrisma();
    const tgId = entry.telegramId;

    const superAdminIds = (process.env.SUPER_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isSuperAdmin = superAdminIds.includes(tgId.toString());

    // Получаем инфу о пользователе из Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    let firstName: string | null = null;
    let username: string | null = null;
    try {
      const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${tgId}`);
      const chatData = await chatRes.json();
      if (chatData.ok) {
        firstName = chatData.result.first_name || null;
        username = chatData.result.username || null;
      }
    } catch {}

    const organizer = await prisma.organizer.upsert({
      where: { telegram_id: tgId },
      update: {
        username,
        first_name: firstName,
        ...(isSuperAdmin ? { status: 'APPROVED', isSuperAdmin: true } : {}),
      },
      create: {
        telegram_id: tgId,
        username,
        first_name: firstName,
        status: isSuperAdmin ? 'APPROVED' : 'PENDING',
        isSuperAdmin,
      },
    });

    codes.delete(code);

    // Создаём сессию
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const sessionData = JSON.stringify({
      organizerId: organizer.id,
      telegramId: tgId.toString(),
      firstName,
      username,
    });
    cookieStore.set('organizer_session', sessionData, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
