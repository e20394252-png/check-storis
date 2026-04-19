import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { validateInitData, parseUserFromInitData } from '@/lib/twa';
import { notifyAdminNewRegistration } from '@/lib/notify';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData, eventId, proofBase64 } = body;

    // 1. Validate initData
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!validateInitData(initData, botToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse user
    const tgUser = parseUserFromInitData(initData);
    if (!tgUser?.id) {
      return NextResponse.json({ error: 'Invalid user data' }, { status: 400 });
    }

    if (!proofBase64) {
      return NextResponse.json({ error: 'Screenshot required' }, { status: 400 });
    }

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
    }

    const prisma = getPrisma();

    // 3. Upsert user
    const user = await prisma.user.upsert({
      where: { telegram_id: BigInt(tgUser.id) },
      update: {
        username: tgUser.username || null,
        first_name: tgUser.first_name || null,
      },
      create: {
        telegram_id: BigInt(tgUser.id),
        username: tgUser.username || null,
        first_name: tgUser.first_name || null,
      },
    });

    // 4. Verify event exists
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // 5. Build proof URL (store as base64 data URL)
    const proofUrl = proofBase64.startsWith('data:')
      ? proofBase64
      : `data:image/jpeg;base64,${proofBase64}`;

    // 6. Upsert registration
    const existing = await prisma.registration.findUnique({ where: { userId: user.id } });

    let registration;
    if (existing) {
      // Update proof and reset to PENDING (allow re-submission after rejection)
      registration = await prisma.registration.update({
        where: { id: existing.id },
        data: {
          proofUrl,
          status: 'PENDING',
          adminNote: null,
          eventId,
        },
      });
    } else {
      registration = await prisma.registration.create({
        data: {
          userId: user.id,
          eventId,
          proofUrl,
          status: 'PENDING',
        },
      });
    }

    // 7. Notify admin (fire-and-forget)
    const displayName = tgUser.first_name || tgUser.username || 'Пользователь';
    notifyAdminNewRegistration(registration.id, displayName, tgUser.username, proofUrl).catch(console.error);

    return NextResponse.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('[api/register] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
