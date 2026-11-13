# UI design artifacts

## Текущий прод: UI v2 (упрощённый)

- Mini App: `src/app/page.tsx`
- Админка: `src/app/admin/AdminClient.tsx`
- Макет-референс: `design/concept-simple-ui.html`
- Стили: классы `cs-*` в `src/app/globals.css`

## Откат на UI v1

1. Скопировать файлы из `design/legacy/ui-v1/` поверх текущих:
   - `page.tsx` → `src/app/page.tsx`
   - `AdminClient.tsx` → `src/app/admin/AdminClient.tsx`
2. Закоммитить и задеплоить (push в `main` → Northflank).

Снимок v1 сделан: **2026-03-13** (до внедрения v2).
