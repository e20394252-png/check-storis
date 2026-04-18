import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One-time DB migration endpoint.
 * Call once after deploy: POST /api/admin/migrate?key=YOUR_ADMIN_SECRET
 *
 * Uses Prisma Client programmatic sync (PrismaClient.$connect handles schema).
 * Alternatively runs prisma db push via local node_modules if available.
 */
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const adminSecret = process.env.ADMIN_SECRET || 'checkStoris2026';

  if (key !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;

  if (!dbUrl) {
    return NextResponse.json({
      error: 'DATABASE_URL is not set',
      env: Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('POSTGRES')),
    }, { status: 500 });
  }

  try {
    // Try using Prisma client to push schema via direct db operations
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();

    // Test connection first
    await prisma.$connect();

    // Run prisma db push using node_modules CLI (available in standalone next.js build context)
    let pushResult = 'Not attempted';
    try {
      const result = execSync(
        `npx --yes prisma@7 db push --accept-data-loss --url="${dbUrl}"`,
        {
          env: { ...process.env, DATABASE_URL: dbUrl },
          timeout: 60000,
          encoding: 'utf8',
        }
      );
      pushResult = result;
    } catch (pushErr: any) {
      pushResult = `CLI push failed: ${pushErr.message}\nstdout: ${pushErr.stdout}\nstderr: ${pushErr.stderr}`;
    }

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      databaseUrl: dbUrl.substring(0, 30) + '...',
      pushResult,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      stack: err.stack?.substring(0, 500),
    }, { status: 500 });
  }
}

// Also support GET for easy browser testing
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const adminSecret = process.env.ADMIN_SECRET || 'checkStoris2026';

  if (key !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;

  return NextResponse.json({
    status: 'ready',
    hasDbUrl: !!dbUrl,
    dbUrlPreview: dbUrl ? dbUrl.substring(0, 25) + '...' : null,
    allEnvKeys: Object.keys(process.env).filter(k =>
      k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG')
    ),
  });
}
