import crypto from 'crypto';

/**
 * Validates data received from Telegram Login Widget.
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export interface TelegramLoginData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function validateTelegramLogin(data: TelegramLoginData, botToken: string): boolean {
  if (!data || !data.hash) return false;

  // Build the data-check-string
  const checkData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'hash' && value !== undefined && value !== null) {
      checkData[key] = String(value);
    }
  }

  const dataCheckString = Object.keys(checkData)
    .sort()
    .map(key => `${key}=${checkData[key]}`)
    .join('\n');

  // Secret key = SHA256(bot_token)
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (hmac !== data.hash) return false;

  // Check auth_date is not too old (allow 24 hours)
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > 86400) return false;

  return true;
}
