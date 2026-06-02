import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// GET /api/admin/referrals — referral tree + earnings (superAdmin only)
export async function GET() {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!me.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const prisma = getPrisma();

  // 1. All users that have referral relationships (either referred someone or were referred)
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { referredById: { not: null } },
        { referrals: { some: {} } },
      ],
    },
    include: {
      referrals: {
        select: {
          id: true,
          telegram_id: true,
          username: true,
          first_name: true,
          createdAt: true,
        },
      },
      wallet: {
        select: {
          balance: true,
          totalEarned: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 2. All referral earnings
  const earnings = await prisma.referralEarning.findMany({
    orderBy: { createdAt: 'desc' },
  });

  // 3. Aggregate stats
  const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
  const totalReferralPairs = users.filter(u => u.referredById).length;
  const totalReferrers = new Set(users.filter(u => u.referrals.length > 0).map(u => u.id)).size;

  // Build referrer map for looking up referrer names
  const userMap = new Map<string, { first_name?: string | null; username?: string | null; telegram_id: bigint }>();
  for (const u of users) {
    userMap.set(u.id, { first_name: u.first_name, username: u.username, telegram_id: u.telegram_id });
  }

  // Also fetch referrers that might not be in the filtered set
  const missingReferrerIds = users
    .filter(u => u.referredById && !userMap.has(u.referredById))
    .map(u => u.referredById!);

  if (missingReferrerIds.length > 0) {
    const missingReferrers = await prisma.user.findMany({
      where: { id: { in: missingReferrerIds } },
      select: { id: true, first_name: true, username: true, telegram_id: true },
    });
    for (const u of missingReferrers) {
      userMap.set(u.id, { first_name: u.first_name, username: u.username, telegram_id: u.telegram_id });
    }
  }

  // Serialize (handle BigInt)
  const serializedUsers = users.map((u: any) => ({
    id: u.id,
    telegram_id: u.telegram_id.toString(),
    username: u.username,
    first_name: u.first_name,
    referralCode: u.referralCode,
    referredById: u.referredById,
    referredByName: u.referredById ? (() => {
      const ref = userMap.get(u.referredById);
      return ref ? (ref.first_name || `@${ref.username}` || ref.telegram_id.toString()) : u.referredById;
    })() : null,
    createdAt: u.createdAt.toISOString(),
    referralsCount: u.referrals.length,
    referrals: u.referrals.map((r: any) => ({
      id: r.id,
      telegram_id: r.telegram_id.toString(),
      username: r.username,
      first_name: r.first_name,
      createdAt: r.createdAt.toISOString(),
    })),
    walletBalance: u.wallet?.balance ?? 0,
    walletTotalEarned: u.wallet?.totalEarned ?? 0,
  }));

  const serializedEarnings = earnings.map((e: any) => ({
    id: e.id,
    referrerId: e.referrerId,
    referrerName: (() => {
      const ref = userMap.get(e.referrerId);
      return ref ? (ref.first_name || `@${ref.username}` || ref.telegram_id.toString()) : e.referrerId;
    })(),
    referralId: e.referralId,
    referralName: (() => {
      const ref = userMap.get(e.referralId);
      return ref ? (ref.first_name || `@${ref.username}` || ref.telegram_id.toString()) : e.referralId;
    })(),
    amount: e.amount,
    type: e.type,
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({
    users: serializedUsers,
    earnings: serializedEarnings,
    stats: {
      totalReferrers,
      totalReferralPairs,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalEarningsCount: earnings.length,
    },
  });
}
