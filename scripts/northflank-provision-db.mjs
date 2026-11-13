#!/usr/bin/env node
/**
 * Создаёт PostgreSQL addon в Northflank, подставляет DATABASE_URL в check-storis, ждёт БД.
 *
 *   set NORTHFLANK_API_TOKEN=...
 *   node scripts/northflank-provision-db.mjs
 *
 * Опционально: NF_ADDON_NAME=check-storis-db
 */
const API = 'https://api.northflank.com/v1';
const TOKEN = process.env.NORTHFLANK_API_TOKEN || process.env.NF_API_TOKEN;
const TEAM = process.env.NF_TEAM_ID || 'kassandrs-team';
const PROJECT = process.env.NF_PROJECT_ID || 'default';
const SERVICE = process.env.NF_SERVICE_NAME || 'check-storis';
const ADDON = process.env.NF_ADDON_NAME || 'check-storis-db';

if (!TOKEN) {
  console.error('Задайте NORTHFLANK_API_TOKEN');
  process.exit(1);
}

const base = `/teams/${TEAM}/projects/${PROJECT}`;

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 2000)}`);
  }
  return json;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickDatabaseUrl(creds) {
  const envs = creds?.envs ?? {};
  const keys = [
    'DATABASE_URL',
    'POSTGRES_URI',
    'POSTGRES_URL',
    'POSTGRESQL_URI',
    'POSTGRESQL_URL',
    'connectionString',
    'uri',
  ];
  for (const k of keys) {
    const v = envs[k];
    if (typeof v === 'string' && v.startsWith('postgres')) return { url: v, from: k };
  }
  const host = envs.host ?? envs.HOST;
  const port = envs.port ?? envs.PORT ?? '5432';
  const database = envs.database ?? envs.db ?? envs.DATABASE ?? 'postgres';
  const user = creds?.secrets?.username ?? envs.username;
  const password = creds?.secrets?.password ?? envs.password;
  if (user && password && host) {
    const enc = encodeURIComponent(password);
    return {
      url: `postgresql://${user}:${enc}@${host}:${port}/${database}?sslmode=require`,
      from: 'constructed',
    };
  }
  return null;
}

async function waitAddonReady(addonId, maxMin = 12) {
  const deadline = Date.now() + maxMin * 60_000;
  while (Date.now() < deadline) {
    const { data } = await api('GET', `${base}/addons/${addonId}`);
    const status = data?.status?.state ?? data?.status ?? data?.deployment?.status;
    const running =
      data?.status?.running === true ||
      status === 'RUNNING' ||
      status === 'running' ||
      data?.status?.phase === 'running';
    console.log(`  addon status: ${JSON.stringify(data?.status ?? status)}`);
    if (running) return data;
    await sleep(15_000);
  }
  throw new Error(`Addon ${addonId} not running after ${maxMin} min`);
}

async function main() {
  const list = await api('GET', `${base}/addons`);
  const items = list?.data?.addons ?? list?.data ?? list?.addons ?? [];
  let addon = Array.isArray(items) && items.find((a) => a.name === ADDON || a.id === ADDON);

  if (!addon) {
    console.log(`Создаём addon «${ADDON}» (PostgreSQL)...`);
    const created = await api('POST', `${base}/addons`, {
      name: ADDON,
      description: 'check-storis production DB',
      type: 'postgresql',
      version: '16',
      billing: {
        deploymentPlan: 'nf-compute-20',
        storageClass: 'nvme',
        storage: 6144,
        replicas: 1,
      },
      tlsEnabled: true,
      externalAccessEnabled: false,
    });
    addon = created?.data ?? created;
    console.log('Created:', addon?.id ?? addon?.name);
  } else {
    console.log(`Addon уже есть: ${addon.id ?? addon.name}`);
  }

  const addonId = addon.id ?? addon.name ?? ADDON;
  await waitAddonReady(addonId);

  const credsRes = await api('GET', `${base}/addons/${addonId}/credentials`);
  const creds = credsRes?.data ?? credsRes;
  const picked = pickDatabaseUrl(creds);
  if (!picked) {
    console.error('Не удалось собрать DATABASE_URL. envs keys:', Object.keys(creds?.envs ?? {}));
    console.error(JSON.stringify(creds, null, 2).slice(0, 1500));
    process.exit(1);
  }
  console.log(`DATABASE_URL from ${picked.from} (host redacted in log)`);

  const envRes = await api('GET', `${base}/services/${SERVICE}/runtime-environment`);
  const runtimeEnvironment = { ...(envRes?.data?.runtimeEnvironment ?? {}) };
  runtimeEnvironment.DATABASE_URL = picked.url;

  console.log(`Обновляем env сервиса «${SERVICE}» (${Object.keys(runtimeEnvironment).length} keys)...`);
  const up = await api('POST', `${base}/services/${SERVICE}/runtime-environment`, {
    runtimeEnvironment,
  });
  console.log('Service env updated, restart:', !!(up?.data?.success ?? up?.data?.restartSuccessful));

  console.log('\nДальше: дождаться рестарта и вызвать migrate:');
  console.log(`  POST .../api/admin/migrate?key=<ADMIN_SECRET>`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
