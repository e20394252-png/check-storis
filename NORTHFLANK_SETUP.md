# Northflank — check-storis с нуля

Команда: **kassandr's team** → проект **Default** → [Services](https://app.northflank.com/t/kassandrs-team/project/default/services).

## 1. Создать сервис (если в списке только make-doc)

1. **Create new** → **Combined Service** (build + deploy из Git).
2. **Service name:** `check-storis`
3. **Source:** репозиторий **`e20394252-png/check-storis`**, ветка **`main`**
4. **Build:** Dockerfile, путь **`/Dockerfile`**, context **`/`**, BuildKit
5. **Resources (runtime):** как у make-doc — **~0.2 vCPU, 512 MB** (не 256 MB)
6. **Networking:** **Add port** → internal **3000**, **Public** = on
7. **Create service** → дождаться green build/deploy

Альтернатива из терминала (нужен [Northflank API token](https://app.northflank.com)):

```powershell
$env:NORTHFLANK_API_TOKEN = "<токен>"
node scripts/northflank-bootstrap.mjs
```

## 2. Переменные (Runtime → Variables)

Минимум для старта:

| Variable | Назначение |
|----------|------------|
| `DATABASE_URL` | PostgreSQL (Addon Postgres или внешний URL) |
| `TELEGRAM_BOT_TOKEN` | Бот @BotFather |
| `NEXT_PUBLIC_BOT_USERNAME` | `check_storis_bot` (без @) |
| `NEXT_PUBLIC_MINI_APP_URL` | **точный** HTTPS URL из Networking (без `/` в конце) |
| `ADMIN_SECRET` | свой секрет (не дефолт из кода) |
| `SUPER_ADMIN_IDS` | ваш Telegram user id |

По фичам: `SESSION_SECRET`, `ADMIN_CHAT_IDS`, `LIDTECH_*`, `CRYPTOBOT_TOKEN` — см. `PROJECT_OVERVIEW.md`.

После сохранения env — **Redeploy**.

## 3. Ссылки

- **Админка:** `https://<public-url>/admin`
- **Health:** `https://<public-url>/api/health` → поля `adminUrl`, `appUrl`, статус БД
- **Smoke:** `node scripts/smoke-check.mjs https://<public-url>`

## 4. После первого деплоя

1. `POST /api/admin/migrate?key=<ADMIN_SECRET>` (если БД новая)
2. `GET /api/admin/setup-webhook?key=<ADMIN_SECRET>` — вебхук Telegram
3. BotFather: Mini App URL = `NEXT_PUBLIC_MINI_APP_URL`

## 5. Git

Push в **`main`** → Northflank пересобирает автоматически.

Render (`render.yaml`) — запасной вариант, см. `HOSTING.md`.
