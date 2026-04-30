import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const adminSecret = process.env.ADMIN_SECRET || 'checkStoris2026';
  if (key !== adminSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });

  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    await prisma.$connect();
    const results: string[] = [];

    const run = async (label: string, sql: string) => {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push(`✅ ${label}`);
      } catch (e: any) {
        results.push(`⚠️ ${label}: ${e.message.split('\n')[0]}`);
      }
    };

    // ENUMS
    await run('ENUM RegistrationStatus', `
      DO $$ BEGIN
        CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await run('ENUM OrganizerStatus', `
      DO $$ BEGIN
        CREATE TYPE "OrganizerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // User table
    await run('Table User', `
      CREATE TABLE IF NOT EXISTS "User" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        telegram_id BIGINT UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Organizer table (NEW)
    await run('Table Organizer', `
      CREATE TABLE IF NOT EXISTS "Organizer" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        telegram_id BIGINT UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        photo_url TEXT,
        status "OrganizerStatus" NOT NULL DEFAULT 'PENDING',
        "isSuperAdmin" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Event table
    await run('Table Event', `
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

    // New columns on Event
    await run('Event.imageUrl', `ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;`);
    await run('Event.organizerId', `ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "organizerId" TEXT;`);
    await run('Event FK organizer', `
      DO $$ BEGIN
        ALTER TABLE "Event" ADD CONSTRAINT fk_event_organizer FOREIGN KEY ("organizerId") REFERENCES "Organizer"(id);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Registration table
    await run('Table Registration', `
      CREATE TABLE IF NOT EXISTS "Registration" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId" TEXT NOT NULL,
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

    // New column on Registration
    await run('Registration.storyUrl', `ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "storyUrl" TEXT;`);

    // Constraints
    await run('Drop old userId unique', `ALTER TABLE "Registration" DROP CONSTRAINT IF EXISTS "Registration_userId_key";`);
    await run('Compound unique userId+eventId', `
      DO $$ BEGIN
        ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_eventId_key" UNIQUE ("userId", "eventId");
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);

    const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`
    );
    await prisma.$disconnect();

    return NextResponse.json({ success: true, results, tables: tables.map((t: any) => t.tablename) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const adminSecret = process.env.ADMIN_SECRET || 'checkStoris2026';
  if (key !== adminSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dbUrl = process.env.DATABASE_URL;
  return NextResponse.json({ status: 'ready', hasDbUrl: !!dbUrl });
}
