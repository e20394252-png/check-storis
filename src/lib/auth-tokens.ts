// Хранилище одноразовых токенов авторизации (in-memory, живут 5 мин)

interface AuthToken {
  token: string;
  createdAt: number;
  verified: boolean;
  organizerId?: string;
  telegramId?: bigint;
  firstName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
}

const tokens = new Map<string, AuthToken>();
const TOKEN_TTL = 5 * 60 * 1000; // 5 минут

function cleanup() {
  const now = Date.now();
  for (const [key, val] of tokens) {
    if (now - val.createdAt > TOKEN_TTL) tokens.delete(key);
  }
}

export function createAuthToken(): string {
  cleanup();
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  tokens.set(token, { token, createdAt: Date.now(), verified: false });
  return token;
}

export function getAuthToken(token: string): AuthToken | null {
  cleanup();
  return tokens.get(token) || null;
}

export function verifyAuthToken(
  token: string,
  data: { organizerId: string; telegramId: bigint; firstName?: string | null; username?: string | null; photoUrl?: string | null }
) {
  const t = tokens.get(token);
  if (!t) return false;
  if (Date.now() - t.createdAt > TOKEN_TTL) { tokens.delete(token); return false; }
  t.verified = true;
  t.organizerId = data.organizerId;
  t.telegramId = data.telegramId;
  t.firstName = data.firstName;
  t.username = data.username;
  t.photoUrl = data.photoUrl;
  return true;
}

export function consumeAuthToken(token: string): AuthToken | null {
  const t = tokens.get(token);
  if (!t || !t.verified) return null;
  tokens.delete(token);
  return t;
}
