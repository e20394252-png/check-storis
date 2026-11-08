#!/usr/bin/env node
/**
 * Создаёт combined-сервис check-storis в Northflank (GitHub → Docker → порт 3000).
 *
 *   set NORTHFLANK_API_TOKEN=...
 *   node scripts/northflank-bootstrap.mjs
 *
 * Опционально:
 *   NF_TEAM_ID=kassandrs-team   (default)
 *   NF_PROJECT_ID=default       (default)
 *   NF_SERVICE_NAME=check-storis
 */
const API = 'https://api.northflank.com/v1';
const TOKEN = process.env.NORTHFLANK_API_TOKEN || process.env.NF_API_TOKEN;
const TEAM = process.env.NF_TEAM_ID || 'kassandrs-team';
const PROJECT = process.env.NF_PROJECT_ID || 'default';
const SERVICE = process.env.NF_SERVICE_NAME || 'check-storis';
const REPO = 'https://github.com/e20394252-png/check-storis';
const BRANCH = 'main';

if (!TOKEN) {
  console.error('Задайте NORTHFLANK_API_TOKEN (Northflank → Team kassandr\'s team → API → Create token, право Project > Services > Create).');
  process.exit(1);
}

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

const payload = {
  name: SERVICE,
  description: 'Check-Storis: Telegram Mini App + admin',
  billing: {
    deploymentPlan: 'nf-compute-20',
    buildPlan: 'nf-compute-200-8',
  },
  deployment: {
    instances: 1,
    docker: { configType: 'default' },
    storage: { ephemeralStorage: { storageSize: 1024 } },
  },
  ports: [
    {
      name: 'http',
      internalPort: 3000,
      public: true,
      protocol: 'HTTP',
    },
  ],
  healthChecks: [
    {
      protocol: 'HTTP',
      type: 'readinessProbe',
      path: '/api/health',
      port: 3000,
      initialDelaySeconds: 30,
      periodSeconds: 30,
      timeoutSeconds: 5,
      failureThreshold: 3,
      successThreshold: 1,
    },
  ],
  buildSource: 'git',
  vcsData: {
    projectUrl: REPO,
    projectType: 'github',
    projectBranch: BRANCH,
  },
  buildSettings: {
    dockerfile: {
      buildEngine: 'buildkit',
      dockerFilePath: '/Dockerfile',
      dockerWorkDir: '/',
      buildkit: { useCache: true, cacheStorageSize: 8192 },
    },
  },
  buildConfiguration: {
    branchRestrictions: [BRANCH],
    isAllowList: true,
    ciIgnoreFlags: ['[skip ci]', '[ci skip]', '[no ci]', '[skip nf]', '[nf skip]', '[northflank skip]', '[skip northflank]'],
    ignoreEmptyCommits: false,
  },
};

async function main() {
  console.log(`Team: ${TEAM}, project: ${PROJECT}, service: ${SERVICE}`);

  const existing = await api(
    'GET',
    `/teams/${TEAM}/projects/${PROJECT}/services`,
  ).catch(() => null);

  const list = existing?.data ?? existing?.services ?? [];
  const found = Array.isArray(list) && list.find((s) => s.name === SERVICE || s.id === SERVICE);

  if (found) {
    console.log(`Сервис «${SERVICE}» уже есть (id: ${found.id ?? found.name}). Пропускаем create.`);
  } else {
    const created = await api(
      'POST',
      `/teams/${TEAM}/projects/${PROJECT}/services/combined`,
      payload,
    );
    console.log('Создан:', created.data?.id ?? created.data?.name ?? created);
  }

  const detail = await api(
    'GET',
    `/teams/${TEAM}/projects/${PROJECT}/services/${SERVICE}`,
  ).catch(() =>
    api('GET', `/teams/${TEAM}/projects/${PROJECT}/services`),
  );

  const svc = detail?.data ?? detail;
  const ports = svc?.ports ?? [];
  const domains = ports.flatMap((p) => p.domains ?? []).filter(Boolean);
  console.log('\n--- Следующие шаги ---');
  console.log('1. Northflank → сервис → Variables: DATABASE_URL, TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_MINI_APP_URL (= public URL), ADMIN_SECRET, SUPER_ADMIN_IDS, …');
  console.log('2. После первого green build: откройте /api/health и /admin');
  if (domains.length) {
    console.log('\nPublic domains:', domains.join(', '));
    console.log(`Admin: https://${domains[0]}/admin`);
  } else {
    console.log('\nPublic URL: Northflank → сервис → Networking (появится после деплоя).');
  }

  try {
    await api('POST', `/teams/${TEAM}/projects/${PROJECT}/services/${SERVICE}/build`, {});
    console.log('\nСборка запущена.');
  } catch (e) {
    console.warn('\nЗапуск build:', e.message);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
