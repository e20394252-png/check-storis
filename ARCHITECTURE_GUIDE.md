# Архитектура: Telegram Mini App + Bot + Admin + LidTech

Инструкция для реализации в смежном проекте. Отличия от check-storis:
- **Нет аппрува организаторов** — админка доступна только по `SUPER_ADMIN_IDS`
- **Нет модели Organizer с PENDING/APPROVED/REJECTED** — суперюзер входит сразу

---

## Стек

- **Next.js** (App Router) — фронтенд + API
- **PostgreSQL** (Railway / Supabase) — БД
- **Prisma** — ORM
- **Telegraf** — Telegram Bot SDK
- **LidTech** — внешняя платформа для сценариев бота

---

## 1. Переменные окружения

```env
# Обязательные
TELEGRAM_BOT_TOKEN=         # Токен бота из @BotFather
NEXT_PUBLIC_BOT_USERNAME=   # Username бота без @
DATABASE_URL=               # PostgreSQL URL
SUPER_ADMIN_IDS=            # Telegram ID суперюзеров через запятую

# Опциональные
ADMIN_SECRET=checkStoris2026        # Секрет для /api/admin/* эндпоинтов
ADMIN_CHAT_IDS=                     # Куда шлются уведомления о заявках
SESSION_SECRET=                     # Для подписи сессионных cookie
LIDTECH_BOT_WEBHOOK_URL=            # URL вебхука ЛидТех (см. п.9)
LIDTECH_PAYMENT_URL=                # URL виджета оплаты ЛидТех
NEXT_PUBLIC_MINI_APP_URL=           # URL мини-аппа (авто-определяется на Railway)
```

---

## 2. Архитектура вебхука (ключевой момент!)

### Проблема
Telegram бот может иметь **только один вебхук**. Если LidTech подключен к боту — он устанавливает свой вебхук и забирает все обновления. Наш сервер ничего не получает.

### Решение: Webhook Proxy
Наш сервер устанавливается как **основной вебхук** бота и проксирует сообщения в ЛидТех:

```
Telegram → Наш вебхук (POST /api/webhook/telegram)
  ├── /start login_TOKEN        → обрабатываем сами (авторизация)
  ├── callback_query reg:*      → обрабатываем сами (одобрить/отклонить)
  └── всё остальное             → проксируем в ЛидТех
```

### Файл: `src/app/api/webhook/telegram/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { bot } from '@/lib/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const text = body?.message?.text || '';
    const callbackData = body?.callback_query?.data || '';
    const isOurUpdate =
      text.includes('/start login_') ||
      callbackData.startsWith('reg:');

    if (isOurUpdate) {
      await bot.handleUpdate(body);
    } else {
      // Проксируем в ЛидТех
      const lidtechWebhook = process.env.LIDTECH_BOT_WEBHOOK_URL;
      if (lidtechWebhook) {
        fetch(lidtechWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(err => console.error('[proxy->lidtech]', err));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook/telegram] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### Как получить LIDTECH_BOT_WEBHOOK_URL
1. Подключи бота к ЛидТех (вставь токен)
2. ЛидТех установит свой вебхук
3. Вызови `GET /api/admin/setup-webhook?key=SECRET&action=info` — увидишь URL ЛидТеха
4. Скопируй URL → сохрани в `LIDTECH_BOT_WEBHOOK_URL`
5. Вызови `GET /api/admin/setup-webhook?key=SECRET` — установит **наш** вебхук

> **ВАЖНО**: после каждого переподключения бота в ЛидТех — ЛидТех перебивает вебхук! Нужно снова вызвать `setup-webhook`.

---

## 3. Авторизация через бота (без ручного ввода ID)

### Принцип
1. Юзер на `/admin` нажимает «Войти через Telegram»
2. Сервер генерирует одноразовый токен, возвращает deep link `https://t.me/BOT?start=login_TOKEN`
3. Юзер кликает → бот получает `/start login_TOKEN`
4. Наш вебхук обрабатывает → `bot.start()` берёт `ctx.from.id` (подделать невозможно)
5. Проверяет `SUPER_ADMIN_IDS` → если совпадает, авторизует
6. Фронтенд поллит `/api/auth/check-token?token=X` каждые 2с → получает `verified` → вход

### Ключевые файлы

#### `src/lib/auth-tokens.ts` — хранилище одноразовых токенов (in-memory)
```typescript
interface AuthToken {
  token: string;
  createdAt: number;
  verified: boolean;
  adminId?: string;     // ID записи в БД
  telegramId?: bigint;
  firstName?: string | null;
  username?: string | null;
}

const tokens = new Map<string, AuthToken>();
const TOKEN_TTL = 5 * 60 * 1000; // 5 минут

// createAuthToken() — генерирует и сохраняет токен
// getAuthToken(token) — проверяет существование
// verifyAuthToken(token, data) — помечает verified + записывает данные юзера
// consumeAuthToken(token) — возвращает и удаляет (одноразовый)
```

#### `src/app/api/auth/start-login/route.ts` — генерация ссылки
```typescript
// POST → создаёт токен, возвращает { token, botLink }
const token = createAuthToken();
const botLink = `https://t.me/${botUsername}?start=login_${token}`;
```

#### `src/app/api/auth/check-token/route.ts` — polling
```typescript
// GET ?token=X → { status: 'pending' | 'verified' | 'expired' }
// При verified — создаёт сессию (cookie), возвращает данные
```

#### `src/lib/bot.ts` — обработка /start login_
```typescript
bot.start(async (ctx) => {
  const payload = (ctx as any).startPayload || '';
  if (!payload.startsWith('login_')) return; // не наше → ЛидТех обработает

  const token = payload.slice(6);
  const tgId = BigInt(ctx.from.id);

  // Упрощённая версия (без Organizer):
  const superAdminIds = (process.env.SUPER_ADMIN_IDS || '').split(',').map(s => s.trim());
  if (!superAdminIds.includes(String(ctx.from.id))) {
    await ctx.reply('❌ У вас нет доступа к админ-панели.');
    return;
  }

  // Подтверждаем токен
  const ok = verifyAuthToken(token, {
    adminId: tgId.toString(),
    telegramId: tgId,
    firstName: ctx.from.first_name,
    username: ctx.from.username,
  });

  if (ok) {
    await ctx.reply('✅ Авторизация успешна! Вернитесь на сайт.');
  } else {
    await ctx.reply('❌ Ссылка устарела. Попробуйте ещё раз.');
  }
});
```

### Сессии: `src/lib/admin-session.ts`
- Cookie `admin_session` = `adminId.hmacSignature`
- Подписывается `SESSION_SECRET`
- `createSession(id)` / `getSession()` / `clearSession()`
- TTL: 30 дней

---

## 4. Фронтенд админки (упрощённый, только суперюзер)

### `src/app/admin/page.tsx`
```
idle → кнопка "Войти через Telegram"
waiting → спиннер + polling check-token каждые 2с
error → "Ссылка устарела"
authorized → AdminClient
```

**В упрощённой версии НЕ нужно:**
- Проверка `organizer.status === 'PENDING'`
- Проверка `organizer.status === 'REJECTED'`
- Модель `Organizer` с полем `status`
- Эндпоинт аппрува организаторов

Если `SUPER_ADMIN_IDS` не совпадает → бот отвечает «нет доступа», polling остаётся `pending` → timeout → error.

---

## 5. Mini App (публичная часть)

### Telegram WebApp SDK
```html
<script src="https://telegram.org/js/telegram-web-app.js" />
```

### Получение данных юзера
```typescript
const tg = window.Telegram?.WebApp;
const initData = tg?.initData || '';  // подписанные данные
const user = tg?.initDataUnsafe?.user;
// user.id, user.first_name, user.username
```

### Валидация initData на сервере
Файл `src/lib/twa.ts`:
```typescript
import crypto from 'crypto';

export function validateInitData(initData: string, botToken: string): boolean {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const keys = Array.from(urlParams.keys()).sort();
  const dataCheckString = keys.map(key => `${key}=${urlParams.get(key)}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return calculatedHash === hash;
}
```

### Основной API: `GET /api/me`
- Header: `x-telegram-init-data: {initData}`
- Валидирует initData → возвращает мероприятия + регистрации юзера
- **Возвращает ВСЕ мероприятия** (не только isActive) — фронтенд делит на актуальные/прошедшие по дате

### Закрытие мини-аппа
```typescript
window.Telegram?.WebApp?.close?.();
```

### Открытие ссылки (открывает встроенный браузер Telegram — НЕ закрывается!)
```typescript
window.Telegram?.WebApp?.openLink?.('https://...');
// ⚠️ Встроенный браузер НЕ закрывается программно
```

### Открытие Telegram-ссылки (переход в чат)
```typescript
window.Telegram?.WebApp?.openTelegramLink?.('https://t.me/...');
```

---

## 6. Оплата через LidTech

### Принцип (НЕ открываем браузер из мини-аппа!)
1. Юзер нажимает «Оплатить» → заявка сохраняется в БД (`PaymentRequest`)
2. Сервер отправляет **сообщение в чат бота** через `sendMessage` API с inline-кнопкой
3. Мини-апп **закрывается** → юзер в боте → видит кнопку оплаты

> **Почему не openLink?** `openLink` открывает встроенный браузер Telegram, который нельзя закрыть программно. Юзер застрянет на пустой странице.

### Код в API оплаты
```typescript
// После создания PaymentRequest:
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const paymentUrl = process.env.LIDTECH_PAYMENT_URL || 'https://app.leadteh.ru/w/XXXX';

fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: telegramId.toString(),
    text: `💳 Заявка оформлена!\n\n📅 ${title}\n💰 ${price} ₽\n\n👇 Нажмите для оплаты:`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '💳 Перейти к оплате', url: paymentUrl }]],
    },
  }),
});
```

### Код во фронтенде мини-аппа
```typescript
if (data.success) {
  // Бот уже отправил ссылку в чат — просто закрываем
  window.Telegram?.WebApp?.close?.();
}
```

---

## 7. Уведомления через Telegram Bot API

### Файл: `src/lib/notify.ts`

Все уведомления отправляются напрямую через `fetch` к Bot API, **не через вебхук**:

```typescript
async function sendMessage(chatId: string | bigint, text: string, extra?: object) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId.toString(), text, parse_mode: 'HTML', ...extra }),
  });
}
```

### Типы уведомлений:
- `notifyRegistrationApproved()` — юзеру при одобрении заявки
- `notifyRegistrationRejected()` — юзеру при отклонении
- `notifyAdminNewRegistration()` — админам о новой заявке (с фото + inline кнопки одобрить/отклонить)
- `broadcastEventPush()` — массовая рассылка о мероприятии (rate limit: 50ms между сообщениями)

### Callback query (кнопки Одобрить/Отклонить в чате бота)
Обрабатываются в `bot.ts` → `bot.on('callback_query', ...)`:
- `reg:approve:ID` → обновляет статус в БД + уведомляет юзера
- `reg:reject:ID` → обновляет статус + уведомляет юзера

---

## 8. Миграции БД

### Эндпоинт: `POST /api/admin/migrate?key=SECRET`
Выполняет SQL-миграции через `prisma.$executeRawUnsafe()`. Проверяет существование таблиц/колонок и создаёт только недостающие.

> Вызывать после каждого деплоя если были изменения в схеме.

---

## 9. Setup Webhook

### Эндпоинт: `GET /api/admin/setup-webhook?key=SECRET`

| Параметр | Действие |
|---|---|
| (без action) | Устанавливает наш вебхук |
| `&action=info` | Показывает текущий вебхук |
| `&action=remove` | Удаляет вебхук (чтобы ЛидТех мог установить свой) |

### Порядок настройки при первом деплое:
1. Деплой → вызвать `setup-webhook` (установит наш)
2. В ЛидТех подключить бота по токену → ЛидТех перебьёт вебхук
3. Вызвать `setup-webhook?action=info` → скопировать URL ЛидТеха
4. Сохранить URL в `LIDTECH_BOT_WEBHOOK_URL`
5. Вызвать `setup-webhook` (вернёт наш вебхук) → теперь прокси работает

---

## 10. Структура файлов

```
src/
├── app/
│   ├── page.tsx                          # Mini App (публичная часть)
│   ├── admin/
│   │   ├── page.tsx                      # Страница логина
│   │   └── AdminClient.tsx               # Панель управления
│   └── api/
│       ├── me/route.ts                   # GET — данные юзера для мини-аппа
│       ├── register/route.ts             # POST — регистрация на мероприятие
│       ├── events/route.ts               # GET — публичный список мероприятий
│       ├── auth/
│       │   ├── start-login/route.ts      # POST — генерация токена + ссылки
│       │   ├── check-token/route.ts      # GET — polling статуса токена
│       │   ├── me/route.ts               # GET — текущая сессия
│       │   └── telegram/route.ts         # DELETE — logout
│       ├── admin/
│       │   ├── events/route.ts           # CRUD мероприятий
│       │   ├── registrations/route.ts    # Список заявок
│       │   ├── migrate/route.ts          # Миграции БД
│       │   └── setup-webhook/route.ts    # Управление вебхуком
│       ├── payment/
│       │   ├── webhook/route.ts          # POST — заявка на оплату + GET — polling ЛидТех
│       │   └── debug/route.ts            # Отладка заявок
│       └── webhook/
│           └── telegram/route.ts         # Вебхук-прокси (наш + ЛидТех)
├── lib/
│   ├── bot.ts                            # Telegraf бот (start, callback_query)
│   ├── prisma.ts                         # Prisma клиент
│   ├── twa.ts                            # Валидация Telegram WebApp initData
│   ├── auth-tokens.ts                    # In-memory токены авторизации
│   ├── admin-session.ts                  # Cookie-сессии (HMAC-подписанные)
│   └── notify.ts                         # Уведомления через Bot API
└── components/
    ├── TelegramProvider.tsx              # Инжектит Telegram WebApp SDK
    └── ...
```

---

## 11. Чеклист для нового проекта

- [ ] Создать бота в @BotFather
- [ ] Настроить PostgreSQL (Railway)
- [ ] Задать переменные окружения
- [ ] Деплой → вызвать `/api/admin/migrate`
- [ ] В ЛидТех подключить бота → скопировать вебхук URL
- [ ] Задать `LIDTECH_BOT_WEBHOOK_URL` → вызвать `/api/admin/setup-webhook`
- [ ] Проверить авторизацию через бота
- [ ] Проверить мини-апп
- [ ] Проверить оплату (кнопка в чате, не встроенный браузер)
- [ ] Проверить кнопки Одобрить/Отклонить в чате бота
