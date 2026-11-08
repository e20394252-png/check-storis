/**
 * Публичный URL приложения (Mini App, админка, вебхуки).
 * На Northflank задайте NEXT_PUBLIC_MINI_APP_URL на ваш HTTPS-домен.
 */
export function getAppUrl(requestHost?: string | null): string {
  const fromEnv = process.env.NEXT_PUBLIC_MINI_APP_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }

  const host = requestHost?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    return `${proto}://${host}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
}

export function getAdminUrl(requestHost?: string | null): string {
  return `${getAppUrl(requestHost)}/admin`;
}
