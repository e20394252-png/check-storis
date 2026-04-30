import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// GET /api/admin/organizers — список организаторов (только для суперадмина)
export async function GET() {
  const me = await getSession();
  if (!me || !me.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const prisma = getPrisma();
  const organizers = await prisma.organizer.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { events: true } } },
  });
  return NextResponse.json({
    organizers: organizers.map(o => ({
      ...o,
      telegram_id: o.telegram_id.toString(),
    })),
  });
}

// PATCH /api/admin/organizers — аппрув/отклонение организатора
export async function PATCH(req: NextRequest) {
  const me = await getSession();
  if (!me || !me.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { organizerId, action } = await req.json();
  if (!organizerId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const prisma = getPrisma();
  const updated = await prisma.organizer.update({
    where: { id: organizerId },
    data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED' },
  });
  return NextResponse.json({ success: true, status: updated.status });
}
