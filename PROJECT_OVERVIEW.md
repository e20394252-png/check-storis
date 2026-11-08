# check-storis — обзор проекта и запуск

Краткая «памятка» для реанимации проекта: что это, где данные, какие переменные нужны, как поднять локально и в проде.

---

## Что это

**check-storis** — монолит на **Next.js 16** (App Router) + **PostgreSQL** + **Prisma 7** + бот **Telegraf**.

В одном репозитории:

| Часть | Путь | Назначение |
|-------|------|------------|
| Mini App | `/` | Регистрация на мероприятия, скрин репоста, кошелёк/вывод (CryptoBot), рефералы |
| Админка | `/admin` | Вход через Telegram, мероприятия, заявки, организаторы и др. |
| API | `/api/...` | Авторизация, регистрация, вебхуки Telegram (прокси в LidTech), платежи |

**Доп. документация в репозитории:**

- `HOSTING.md` — **деплой**: сейчас Northflank (GitHub → `main`), резерв Render (`render.yaml`)
- `ARCHITECTURE_GUIDE.md` — архитектура, вебхук-прокси, LidTech, авторизация, чеклист деплоя
- `REPOST_BOT_SPEC.md` — более ранний упрощённый замысел; текущая `prisma/schema.prisma` шире (организаторы, кошельки, платные репосты, рефералы)

---

## Где хранятся важные данные

| Что | Где |
|-----|-----|
| Пользователи, мероприятия, заявки, кошельки, выводы, рефералы | **PostgreSQL** (`prisma/schema.prisma`) |
| Сессии админа | Подписанные **cookies** (`SESSION_SECRET` или запасной вариант из `ADMIN_SECRET`) |
| Одноразовые токены входа «через бота» | **В памяти процесса** (`src/lib/auth-tokens.ts`) — сбрасываются при перезапуске |
| Секреты и URL | **Переменные окружения** (`.env*` в `.gitignore`, в репо не коммитятся) |

В репозитории нет дампов БД — восстановление = тот же `DATABASE_URL` с хостинга/бэкапа или чистая БД + `POST /api/admin/migrate`.

---

## Переменные окружения

### Обязательные для базовой работы

```env
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=
NEXT_PUBLIC_BOT_USERNAME=          # без @
```

### Админка и безопасность

```env
ADMIN_SECRET=                      # в коде есть дефолт checkStoris2026 — в проде задать свой
SUPER_ADMIN_IDS=                   # Telegram user id через запятую
SESSION_SECRET=                    # опционально; иначе используется запасной вариант из ADMIN_SECRET
```

### Публичный URL приложения

```env
NEXT_PUBLIC_MINI_APP_URL=https://...
```

На Railway можно не задавать, если есть `RAILWAY_PUBLIC_DOMAIN` — код подставит `https://...` сам.

### Опционально: уведомления админам

```env
ADMIN_CHAT_IDS=                    # или ADMIN_CHAT_ID
```

### LidTech (бот + оплата мероприятий)

```env
LIDTECH_BOT_WEBHOOK_URL=
LIDTECH_PAYMENT_URL=
```

> В `src/app/api/webhook/telegram/route.ts` и payment-роутах есть **fallback URL в коде** — в проде лучше явно задать env, чтобы не полагаться на захардкоженные значения.

### CryptoBot (инвойсы, вывод USDT)

```env
CRYPTOBOT_TOKEN=
CRYPTOBOT_TESTNET=true             # при необходимости
```

### Прочее

```env
DIRECT_DATABASE_URL=               # если у провайдера отдельный URL для Prisma/pg
OPENAI_API_KEY=                    # парсинг ссылок в админке (`/api/admin/parse-link`)
```

Полный перечень использования — поиск `process.env` по `src/`.

---

## Схема БД

Файл: `prisma/schema.prisma`.

Основные сущности: `User`, `Event`, `Registration`, `Organizer`, `PaymentRequest`, `UserWallet`, `Withdrawal`, `OrganizerBalance`, `ReferralEarning`.

Папки `prisma/migrations` в репо может не быть — схему на сервере приводят через **`POST /api/admin/migrate?key=<ADMIN_SECRET>`** (см. `ARCHITECTURE_GUIDE.md`, раздел 8).

---

## Локальный запуск

**Требования:** Node **20** (как в `Dockerfile`), PostgreSQL.

```bash
cd check-storis
npm ci
npx prisma generate
# создать .env.local с DATABASE_URL и остальным
npm run dev
```

После первого подключения к БД — при необходимости вызвать migrate (локально через curl/Postman с `ADMIN_SECRET`).

Для вебхука Telegram локально обычно нужен туннель (ngrok и т.п.) и `setup-webhook`.

---

## Продакшен

- **Сейчас:** [**Northflank**](https://northflank.com) — деплой по **push в `main`**, сборка из `Dockerfile`, env в панели Northflank. Подробно: **`HOSTING.md`**.
- **Резерв (Render):** `render.yaml` не удалять — web `check-storis` + Postgres `check-storis-db`; возврат и список env из blueprint: **`HOSTING.md`**.
- **Docker (общее):** `output: 'standalone'` в `next.config.ts`; `prisma generate` + `npm run build`, старт — `node server.js`, порт **3000**.

### Telegram: порядок настройки вебхука (с LidTech)

1. Деплой → `GET /api/admin/setup-webhook?key=SECRET` — наш вебхук.
2. Подключить бота в LidTech (он может перезаписать вебхук).
3. `GET .../setup-webhook?key=SECRET&action=info` — скопировать URL LidTech → `LIDTECH_BOT_WEBHOOK_URL`.
4. Снова `setup-webhook` без `action` — наш прокси снова основной.

Подробно: `ARCHITECTURE_GUIDE.md`, разделы 2 и 9.

---

## Структура (укороченно)

```
src/app/page.tsx              # Mini App
src/app/admin/                # админка
src/app/api/                  # REST + вебхуки
src/lib/bot.ts, notify.ts, prisma.ts, twa.ts, cryptobot.ts, ...
prisma/schema.prisma
ARCHITECTURE_GUIDE.md
Dockerfile, render.yaml, HOSTING.md
```

---

## Чеклист «вспомнить проект»

- [ ] Бот в @BotFather, токен и username в env
- [ ] PostgreSQL и `DATABASE_URL`
- [ ] `SUPER_ADMIN_IDS`, свой `ADMIN_SECRET`, при необходимости `SESSION_SECRET`
- [ ] `NEXT_PUBLIC_MINI_APP_URL` (домен Northflank; при Render — из панели; опционально `RAILWAY_PUBLIC_DOMAIN`)
- [ ] Деплой: push в `main` → Northflank (см. `HOSTING.md`)
- [ ] `POST /api/admin/migrate` после изменений схемы / нового деплоя
- [ ] Вебхук + LidTech по инструкции в `ARCHITECTURE_GUIDE.md`
- [ ] CryptoBot — если нужны платные репосты и вывод
- [ ] Mini App URL в настройках бота

---

*Документ создан для быстрого онбординга; детали реализации — в `ARCHITECTURE_GUIDE.md` и исходниках.*
