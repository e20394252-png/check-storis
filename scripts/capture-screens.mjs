#!/usr/bin/env node
/**
 * Локальные скриншоты Mini App + /admin @ 390x844.
 * Usage: PHASE=before|after node scripts/capture-screens.mjs
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const PHASE = process.env.PHASE || 'before';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = path.resolve(process.env.OUT_DIR || `/opt/cursor/artifacts/design_${PHASE}`);
const BOT = process.env.TELEGRAM_BOT_TOKEN || '123456:ABCDEF-local-dev-token';
const W = 390;
const H = 844;

fs.mkdirSync(OUT, { recursive: true });

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
  return `
    (function () {
      var user = { id: 10001, first_name: 'Мария', username: 'maria_demo', language_code: 'ru' };
      var WebApp = {
        initData: ${JSON.stringify(initData)},
        initDataUnsafe: { user: user, auth_date: Math.floor(Date.now() / 1000), hash: 'x' },
        ready: function () {},
        expand: function () {},
        close: function () {},
        themeParams: {},
        colorScheme: 'light',
        platform: 'ios',
        version: '8.0',
        isExpanded: true,
        viewportHeight: 844,
        viewportStableHeight: 844,
        MainButton: { hide: function(){}, show: function(){}, setText: function(){}, onClick: function(){}, offClick: function(){} },
        BackButton: { hide: function(){}, show: function(){}, onClick: function(){}, offClick: function(){} },
        HapticFeedback: { impactOccurred: function(){}, notificationOccurred: function(){}, selectionChanged: function(){} },
        openLink: function (u) { window.open(u, '_blank'); },
        openTelegramLink: function (u) { window.open(u, '_blank'); },
        switchInlineQuery: function () {}
      };
      window.Telegram = { WebApp: WebApp };
    })();
  `;
}

async function shot(page, name) {
  const file = path.join(OUT, `${PHASE}_${name}.png`);
  await page.waitForTimeout(350);
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file);
}

async function main() {
  const initData = makeInitData();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  await context.route('**/telegram-web-app.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: mockTelegramJs(initData),
    });
  });

  const page = await context.newPage();

  // --- Mini App light ---
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Привет', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(1200);
  await shot(page, 'mini_events_list');

  const chips = page.locator('.cs-event-chip');
  if ((await chips.count()) > 1) {
    await chips.nth(1).click();
    await page.waitForTimeout(400);
    await shot(page, 'mini_event_card_alt');
  }

  // Switch to event with rejected status if chip exists
  const rejectedChip = page.locator('.cs-event-chip', { hasText: 'Платный' });
  if (await rejectedChip.count()) {
    await rejectedChip.first().click();
    await page.waitForTimeout(400);
    await shot(page, 'mini_status_rejected');
  }

  const attach = page.getByRole('button', { name: /Приложить/i });
  if (await attach.count()) {
    await attach.first().click();
    await page.waitForTimeout(400);
    await shot(page, 'mini_upload_screen');
    const cancel = page.getByRole('button', { name: /Отмена/i });
    if (await cancel.count()) await cancel.first().click();
  }

  // Profile
  await page.locator('nav.cs-bottom-nav button', { hasText: 'Профиль' }).click();
  await page.waitForTimeout(1000);
  await shot(page, 'mini_profile_wallet');
  await page.evaluate(() => window.scrollTo(0, 480));
  await shot(page, 'mini_referrals');
  await page.evaluate(() => window.scrollTo(0, 1100));
  await shot(page, 'mini_theme_area');

  // Dark mini
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('cs-theme', 'dark');
  });
  await page.locator('nav.cs-bottom-nav button', { hasText: 'Мероприятия' }).click();
  await page.waitForTimeout(500);
  await shot(page, 'mini_events_dark');
  await page.locator('nav.cs-bottom-nav button', { hasText: 'Профиль' }).click();
  await page.waitForTimeout(500);
  await shot(page, 'mini_profile_dark');

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('cs-theme', 'light');
  });

  // --- Admin ---
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot(page, 'admin_login');

  await page.getByPlaceholder('Логин').fill('demo_admin');
  await page.getByPlaceholder('Пароль').fill('demo1234');
  await page.getByRole('button', { name: /Войти/i }).first().click();
  await page.waitForSelector('text=ПАНЕЛЬ ОРГАНИЗАТОРА', { timeout: 10000 });
  await page.waitForTimeout(800);
  await shot(page, 'admin_home');

  for (const [label, name] of [
    ['Проверка', 'admin_pending'],
    ['Мероприятия', 'admin_events'],
    ['Ещё', 'admin_more'],
  ]) {
    await page.locator('button', { hasText: label }).first().click();
    await page.waitForTimeout(700);
    await shot(page, name);
  }

  // New event — from events tab create
  const create = page.locator('button', { hasText: 'Создать' });
  const plusCreate = page.locator('button.cs-btn-create');
  if (await plusCreate.count()) {
    // go home and click create
    await page.locator('button', { hasText: 'Главная' }).first().click();
    await page.waitForTimeout(400);
    await plusCreate.first().click();
    await page.waitForTimeout(700);
    await shot(page, 'admin_new_event');
    await page.evaluate(() => window.scrollTo(0, 560));
    await shot(page, 'admin_new_event_scrolled');
  } else if (await create.count()) {
    await create.first().click();
    await page.waitForTimeout(700);
    await shot(page, 'admin_new_event');
  }

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('cs-theme', 'dark');
  });
  await page.locator('button', { hasText: 'Главная' }).first().click();
  await page.waitForTimeout(500);
  await shot(page, 'admin_home_dark');

  await browser.close();
  console.log('done', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
