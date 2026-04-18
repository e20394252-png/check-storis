import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One-time DB schema setup via raw SQL — no Prisma CLI needed.
 * Call: POST /api/admin/migrate?key=YOUR_ADMIN_SECRET
 */
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const adminSecret = process.env.ADMIN_SECRET || 'checkStoris2026';
  if (key !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 500 });
  }

  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();

    await prisma.$connect();

    const results: string[] = [];

    // 1. Create ENUM type
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
      results.push('✅ ENUM RegistrationStatus created (or already exists)');
    } catch (e: any) {
      results.push(`⚠️ ENUM: ${e.message}`);
    }

    // 2. Create User table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "User" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          telegram_id BIGINT UNIQUE NOT NULL,
          username TEXT,
          first_name TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      results.push('✅ Table User created (or already exists)');
    } catch (e: any) {
      results.push(`❌ Table User: ${e.message}`);
    }

    // 3. Create Event table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Event" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          title TEXT NOT NULL,
          description TEXT,
          date TIMESTAMPTZ,
          location TEXT,
          "repostUrl" TEXT,
          "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      results.push('✅ Table Event created (or already exists)');
    } catch (e: any) {
      results.push(`❌ Table Event: ${e.message}`);
    }

    // 4. Create Registration table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Registration" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "userId" TEXT UNIQUE NOT NULL,
          "eventId" TEXT NOT NULL,
          status "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
          "proofUrl" TEXT,
          "adminNote" TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE,
          CONSTRAINT fk_event FOREIGN KEY ("eventId") REFERENCES "Event"(id)
        );
      `);
      results.push('✅ Table Registration created (or already exists)');
    } catch (e: any) {
      results.push(`❌ Table Registration: ${e.message}`);
    }

    // 5. Verify tables exist
    const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`
    );
    const tableNames = tables.map((t: any) => t.tablename);

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      results,
      tables: tableNames,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      stack: err.stack?.substring(0, 500),
    }, { status: 500 });
  }
}

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
