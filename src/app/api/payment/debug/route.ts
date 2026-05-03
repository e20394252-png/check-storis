import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/payment/debug?key=checkStoris2026 — список всех заявок (для отладки)
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (key !== (process.env.ADMIN_SECRET || 'checkStoris2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    const requests = await prisma.paymentRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      count: requests.length,
      requests: requests.map(r => ({
        id: r.id,
        eventId: r.eventId,
        eventTitle: r.eventTitle,
        price: r.price,
        paymentType: r.paymentType,
        telegramId: r.telegramId.toString(),
        firstName: r.firstName,
        username: r.username,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
