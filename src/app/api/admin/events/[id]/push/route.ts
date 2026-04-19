import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-key');
  return key === (process.env.ADMIN_SECRET || 'checkStoris2026');
}

// POST /api/admin/events/[id]/push — broadcast event to all users via bot
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const prisma = getPrisma();
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const users = await prisma.user.findMany({
      select: { telegram_id: true },
    });

    const { broadcastEventPush } = await import('@/lib/notify');
    const result = await broadcastEventPush(event, users.map(u => u.telegram_id));

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
