import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let prisma: PrismaClient | undefined;

export function getPrisma() {
  if (!prisma) {
    const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}
