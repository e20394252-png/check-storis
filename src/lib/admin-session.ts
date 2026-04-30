import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getPrisma } from './prisma';

const SESSION_COOKIE = 'admin_session';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_SECRET || 'checkStoris2026session';

/**
 * Create a signed session token for an organizer.
 * Format: organizerId.signature
 */
function signToken(organizerId: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(organizerId).digest('hex').slice(0, 16);
  return `${organizerId}.${sig}`;
}

/**
 * Verify and extract organizerId from a signed token.
 */
function verifyToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [organizerId, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(organizerId).digest('hex').slice(0, 16);
  if (sig !== expectedSig) return null;
  return organizerId;
}

/**
 * Set session cookie for the given organizer.
 */
export async function createSession(organizerId: string) {
  const token = signToken(organizerId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

/**
 * Get the current session's organizer, or null if not authenticated.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const organizerId = verifyToken(token);
  if (!organizerId) return null;

  try {
    const prisma = getPrisma();
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
    });
    return organizer;
  } catch {
    return null;
  }
}

/**
 * Clear the session cookie (logout).
 */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
