#!/usr/bin/env node
/** Генерирует валидный Telegram WebApp initData для локального бота. */
import crypto from 'crypto';

const botToken = process.env.TELEGRAM_BOT_TOKEN || '123456:ABCDEF-local-dev-token';
const user = {
  id: Number(process.env.DEMO_TG_ID || 10001),
  first_name: 'Мария',
  username: 'maria_demo',
  language_code: 'ru',
};
const authDate = Math.floor(Date.now() / 1000);
const params = new URLSearchParams();
params.set('user', JSON.stringify(user));
params.set('auth_date', String(authDate));
params.set('query_id', 'AAEdemoLocalQuery');

const keys = Array.from(params.keys()).sort();
const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n');
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
params.set('hash', hash);

process.stdout.write(params.toString());
