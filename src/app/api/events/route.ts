import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/events — public list of active events
export async function GET() {
  try {
    const prisma = getPrisma();
    const events = await prisma.event.findMany({
      where: { isActive: true },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        date: true,
        location: true,
        repostUrl: true,
      },
    });
    return NextResponse.json({ events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
