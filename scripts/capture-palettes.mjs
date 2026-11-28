#!/usr/bin/env node
/**
 * Скриншоты 4 палитр @ 390x844 + сводные overview.
 * Требует: next start на BASE_URL, demo seed, playwright, pillow (через python).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const BOT = process.env.TELEGRAM_BOT_TOKEN || '123456:ABCDEF-local-dev-token';
const ROOT = '/opt/cursor/artifacts';
const W = 390;
const H = 844;

const PALETTES = [
  { id: 'sand', folder: 'palette_1', title: '1 · Песок' },
  { id: 'indigo', folder: 'palette_2', title: '2 · Индиго' },
  { id: 'emerald', folder: 'palette_3', title: '3 · Изумруд' },
  { id: 'mono', folder: 'palette_4', title: '4 · Моно+коралл' },
];

function makeInitData() {
  const user = { id: 10001, first_name: 'Мария', username: 'maria_demo', language_code: 'ru' };
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAEdemoLocalQuery');
  const keys = [...params.keys()].sort();
  const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function mockTelegramJs(initData) {
  return `window.Telegram={WebApp:{initData:${JSON.stringify(initData)},initDataUnsafe:{user:{id:10001,first_name:'Мария',username:'maria_demo'}},ready(){},expand(){},close(){},MainButton:{},BackButton:{},HapticFeedback:{}}};`;
}

async function shot(page, file) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file);
}

async function ensureAdmin(page) {
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  // Не путать с заголовком логина «Панель организатора» (case-insensitive).
  const loggedIn = (await page.getByRole('button', { name: /^Выйти$/i }).count()) > 0;
  if (loggedIn) return;
  await page.getByPlaceholder('Логин').fill('demo_admin');
  await page.getByPlaceholder('Пароль').fill('demo1234');
  await page.getByRole('button', { name: /Войти/i }).first().click();
  await page.waitForSelector('button:text("Выйти")', { timeout: 10000 });
}

async function main() {
  const initData = makeInitData();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await context.route('**/telegram.org/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: mockTelegramJs(initData),
    });
  });
  const page = await context.newPage();

  for (const p of PALETTES) {
    const dir = path.join(ROOT, p.folder);
    fs.mkdirSync(dir, { recursive: true });

    // Mini App light — events
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Привет', { timeout: 15000 });
    await page.evaluate((id) => {
      document.documentElement.setAttribute('data-palette', id);
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('cs-palette', id);
      localStorage.setItem('cs-theme', 'light');
    }, p.id);
    await page.waitForTimeout(400);
    await page.locator('nav.cs-bottom-nav button', { hasText: 'Мероприятия' }).click().catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, path.join(dir, 'mini_event.png'));

    // Profile
    await page.locator('nav.cs-bottom-nav button', { hasText: 'Профиль' }).click();
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, path.join(dir, 'mini_profile.png'));

    // Dark mini event
    await page.evaluate((id) => {
      document.documentElement.setAttribute('data-palette', id);
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('cs-theme', 'dark');
    }, p.id);
    await page.locator('nav.cs-bottom-nav button', { hasText: 'Мероприятия' }).click();
    await page.waitForTimeout(500);
    await shot(page, path.join(dir, 'mini_event_dark.png'));

    // Admin home light
    await page.evaluate((id) => {
      document.documentElement.setAttribute('data-palette', id);
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('cs-theme', 'light');
      localStorage.setItem('cs-palette', id);
    }, p.id);
    await ensureAdmin(page);
    await page.evaluate((id) => {
      document.documentElement.setAttribute('data-palette', id);
      document.documentElement.setAttribute('data-theme', 'light');
    }, p.id);
    const home = page.locator('button', { hasText: 'Главная' }).first();
    if (await home.count()) await home.click();
    await page.waitForTimeout(600);
    await shot(page, path.join(dir, 'admin_home.png'));

    // Overview collage via python
    const overview = path.join(ROOT, `${p.folder}_overview.png`);
    const files = [
      path.join(dir, 'mini_event.png'),
      path.join(dir, 'mini_profile.png'),
      path.join(dir, 'admin_home.png'),
      path.join(dir, 'mini_event_dark.png'),
    ];
    const py = `
from PIL import Image, ImageDraw, ImageFont
import os
files = ${JSON.stringify(files)}
title = ${JSON.stringify(p.title)}
out = ${JSON.stringify(overview)}
imgs = [Image.open(f).convert('RGB') for f in files]
# scale to common height
h = 844
scaled = []
for im in imgs:
    w = int(im.width * (h / im.height))
    scaled.append(im.resize((w, h), Image.Resampling.LANCZOS))
gap = 16
pad_top = 56
pad = 16
total_w = sum(i.width for i in scaled) + gap * (len(scaled) - 1) + pad * 2
total_h = h + pad_top + pad
canvas = Image.new('RGB', (total_w, total_h), (245, 245, 245))
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 28)
except Exception:
    font = ImageFont.load_default()
draw.text((pad, 14), title, fill=(30, 30, 30), font=font)
x = pad
for im in scaled:
    canvas.paste(im, (x, pad_top))
    x += im.width + gap
canvas.save(out, 'PNG', optimize=True)
print('overview', out)
`;
    const r = spawnSync('python3', ['-'], { input: py, encoding: 'utf-8' });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      throw new Error('overview failed for ' + p.id);
    }
    console.log(r.stdout.trim());
  }

  await browser.close();
  console.log('done palettes');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
