import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { validateInitData, parseUserFromInitData } from '@/lib/twa';
import { notifyAdminNewRegistration } from '@/lib/notify';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData, eventId, proofBase64, storyUrl } = body;

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
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organizer: true },
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // 4.1 For paid repost campaigns — extra validation
    if (event.isPaidRepost) {
      if (event.campaignStatus !== 'active') {
        return NextResponse.json({ error: 'Campaign is not active' }, { status: 400 });
      }
      if (event.repostsNeeded && event.repostsFilled >= event.repostsNeeded) {
        return NextResponse.json({ error: 'Campaign slots are full' }, { status: 400 });
      }
      // Story URL is required for paid reposts
      if (!storyUrl) {
        return NextResponse.json({ error: 'Story link is required for paid campaigns' }, { status: 400 });
      }
    }

    // 5. Build proof URL (store as base64 data URL)
    const proofUrl = proofBase64.startsWith('data:')
      ? proofBase64
      : `data:image/jpeg;base64,${proofBase64}`;

    // 6. Upsert registration by userId+eventId (compound unique)
    const existing = await prisma.registration.findUnique({
      where: { userId_eventId: { userId: user.id, eventId } },
    });

    let registration;
    if (existing) {
      registration = await prisma.registration.update({
        where: { id: existing.id },
        data: {
          proofUrl,
          storyUrl: storyUrl || null,
          status: 'PENDING',
          adminNote: null,
        },
      });
    } else {
      registration = await prisma.registration.create({
        data: {
          userId: user.id,
          eventId,
          proofUrl,
          storyUrl: storyUrl || null,
          status: 'PENDING',
        },
      });
    }

    // 7. Notify: for paid events → organizer, for regular events → admin
    const displayName = tgUser.first_name || tgUser.username || 'Пользователь';

    if (event.isPaidRepost && event.organizer?.telegram_id) {
      const { notifyOrgNewPaidRepost } = await import('@/lib/notify');
      notifyOrgNewPaidRepost(
        event.organizer.telegram_id,
        registration.id,
        displayName,
        tgUser.username,
        storyUrl,
        event.title,
      ).catch(console.error);
    } else {
      notifyAdminNewRegistration(registration.id, displayName, tgUser.username, proofUrl).catch(console.error);
    }

    return NextResponse.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('[api/register] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
