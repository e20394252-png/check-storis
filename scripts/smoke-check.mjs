#!/usr/bin/env node
/**
 * Быстрая проверка прод/стейджа после деплоя.
 * Usage: node scripts/smoke-check.mjs https://your-domain.example
 */
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('Usage: node scripts/smoke-check.mjs <BASE_URL>');
  process.exit(1);
}

const endpoints = [
  { name: 'health', path: '/api/health', expectJson: true },
  { name: 'events', path: '/api/events', expectJson: true },
  { name: 'admin page', path: '/admin', expectHtml: true },
  { name: 'mini app', path: '/', expectHtml: true },
];

let failed = 0;
for (const ep of endpoints) {
  const url = base + ep.path;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const ok = res.ok || (ep.path === '/admin' && res.status === 200);
    const ct = res.headers.get('content-type') || '';
    let extra = '';
    if (ep.expectJson && ct.includes('json')) {
      const j = await res.json();
      if (ep.path === '/api/health') {
        extra = ` admin=${j.adminUrl} status=${j.status}`;
        if (j.status !== 'ok') failed++;
      }
    }
    const mark = res.ok ? 'OK' : `HTTP ${res.status}`;
    console.log(`${mark}  ${ep.name}  ${url}${extra}`);
    if (!res.ok && ep.path !== '/api/health') failed++;
  } catch (e) {
    console.log(`FAIL ${ep.name}  ${url}  ${e.message}`);
    failed++;
  }
}

process.exit(failed ? 1 : 0);
