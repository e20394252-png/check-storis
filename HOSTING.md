# Деплой и хостинг

Актуальная схема и заархивированные варианты. Секреты (токены GitHub, БД, бота) **не хранятся в репозитории** — только в панели хостинга и локально (`.env*`, credential manager).

---

## Сейчас: Northflank (временно)

### Если сервиса ещё нет (только make-doc и т.п.)

На машине с **Northflank API token** (Team → API → Create, право **Project → Services → Create**):

```powershell
$env:NORTHFLANK_API_TOKEN = "<токен>"
node scripts/northflank-bootstrap.mjs
```

Скрипт создаёт combined-сервис **`check-storis`** в проекте **`default`** команды **`kassandrs-team`**, репозиторий GitHub, ветка `main`, Dockerfile, порт **3000**, health `GET /api/health`. Секреты приложения в скрипт **не** кладутся — задайте их в панели Northflank после создания.

---

| Параметр | Значение |
|----------|----------|
| Платформа | [Northflank](https://northflank.com) |
| Исходник | GitHub [e20394252-png/check-storis](https://github.com/e20394252-png/check-storis) |
| Триггер деплоя | **Push в ветку `main`** (интеграция GitHub → Northflank) |
| Сборка | **Docker** — корневой `Dockerfile` (Node 20, `output: 'standalone'`, `node server.js`, порт **3000**) |
| Секреты приложения | Variables / secrets в проекте Northflank (см. список в `PROJECT_OVERVIEW.md`) |
| БД | PostgreSQL (addon Northflank или внешний URL → `DATABASE_URL` в env) |

### Ссылка на админку

**Постоянный путь:** `https://<ваш-домен>/admin` (без `?key=` — вход по логину/паролю организатора или «Войти через Telegram» для суперадмина).

После деплоя откройте **`GET /api/health`** — в JSON будут актуальные `appUrl` и `adminUrl` (берутся из `NEXT_PUBLIC_MINI_APP_URL` или Host).

Локальная проверка:

```bash
node scripts/smoke-check.mjs https://<ваш-домен>
```

**Важно:** в Northflank задайте `NEXT_PUBLIC_MINI_APP_URL=https://<ваш-домен>` — иначе кнопки Mini App в боте могут вести не на тот хост.

### Что проверить в панели Northflank

1. **Service** → Git: репозиторий `check-storis`, ветка `main`, автодеплой включён.
2. **Build** → Dockerfile path: `./Dockerfile`, контекст — корень репо.
3. **Networking** → публичный HTTPS-домен → тот же URL в `NEXT_PUBLIC_MINI_APP_URL` и в BotFather (Mini App).
4. **Variables** — перенести набор env с прошлого хостинга (бот, `ADMIN_SECRET`, `SUPER_ADMIN_IDS`, LidTech, CryptoBot и т.д.).
5. После деплоя — при необходимости `POST /api/admin/migrate?key=<ADMIN_SECRET>` и `setup-webhook` (см. `ARCHITECTURE_GUIDE.md`).

### Локальная работа с GitHub (для push)

- Remote: `https://github.com/e20394252-png/check-storis.git`
- Аутентификация: **Personal Access Token** (classic или fine-grained с правами на repo) — хранить в **Git Credential Manager** / при первом `git push`, **не** коммитить в файлы и не вставлять в markdown.
- Ветка для прод-деплоя: **`main`**.

---

## Резерв: Render (ранее / можно вернуться)

Конфиг **сохранён в репозитории** — `render.yaml`. При возврате на Render можно создать Blueprint из этого файла.

### `render.yaml` (кратко)

| Ресурс | Имя | Назначение |
|--------|-----|------------|
| Web service | `check-storis` | `runtime: docker`, plan `free` |
| PostgreSQL | `check-storis-db` | `databaseName: checkstoris`, user `checkstoris` |

**Переменные в web-сервисе (из blueprint):**

| Key | Источник |
|-----|----------|
| `DATABASE_URL` | Авто из `check-storis-db` (`connectionString`) |
| `TELEGRAM_BOT_TOKEN` | Вручную в панели (`sync: false`) |
| `NEXT_PUBLIC_MINI_APP_URL` | Вручную |
| `ADMIN_SECRET` | Вручную |
| `ADMIN_CHAT_ID` | Вручную |

Остальные env (LidTech, CryptoBot, `SUPER_ADMIN_IDS`, …) на Render тоже задавались вручную в Dashboard — список см. `PROJECT_OVERVIEW.md` и `ARCHITECTURE_GUIDE.md`.

### Порядок возврата на Render

1. New → Blueprint → подключить репо, применить `render.yaml`.
2. Заполнить секреты в Environment.
3. Обновить `NEXT_PUBLIC_MINI_APP_URL` и вебхук Telegram на новый домен Render.
4. При необходимости сменить DNS / ссылки в BotFather с Northflank на Render.

---

## Docker (общее для Northflank и Render)

Файл `Dockerfile`:

- `npm ci` → `npx prisma generate` → `npm run build`
- Runtime: `.next/standalone`, пользователь `nextjs`, `PORT=3000`

`next.config.ts`: `output: 'standalone'`.

---

## Другие упоминания в коде/доках

- **Railway** — в коде опционально `RAILWAY_PUBLIC_DOMAIN` для автоподстановки URL; на текущем Northflank обычно задают `NEXT_PUBLIC_MINI_APP_URL` явно.
- **Amvera** — в `REPOST_BOT_SPEC.md` (исторический вариант из спеки repost-бота).

---

*При смене хостинга обновляйте только секцию «Сейчас» в этом файле и блок «Продакшен» в `PROJECT_OVERVIEW.md`; `render.yaml` не удалять.*
