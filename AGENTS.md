# AGENTS.md — pet-jira-server

Инструкция для AI-агентов (Claude Code и других), которые работают в этом репозитории.
Людям тоже полезно: здесь собраны команды и правила проекта.

## Что это

Бэкенд моковой Jira-доски **Pet Jira**. Доска (React) живёт в соседнем репозитории
`Lohengrin14/pet-jira` и ходит сюда по REST API. Проект нужен, чтобы проверять работу агентов
на настоящих задачах, поэтому код должен оставаться простым и понятным.

## Стек

- Node.js 22, TypeScript (без сборки: запускаем через `tsx`, типы проверяет `tsc --noEmit`)
- Fastify 5: HTTP-сервер
- Prisma 7: схема и миграции в `prisma/`, клиент генерируется в `src/generated/prisma` (не коммитим)
- PostgreSQL 16: локально (Docker), в проде Neon
- zod: проверка входящих данных
- Vitest: тесты, отдельная база `petjira_test` (или `TEST_DATABASE_URL`)
- Деплой: Render (`render.yaml`), база Neon

## Команды

```bash
npm install            # зависимости + генерация Prisma-клиента
cp .env.example .env   # первый запуск; там же команда для Postgres в Docker
npm run db:migrate     # применить миграции (и создать новую после правки схемы)
npm run db:seed        # тестовые пользователи, проекты, задачи (стирает данные!)
npm run dev            # сервер на http://localhost:3000 с перезапуском при изменениях
npm run typecheck      # проверка типов
npm test               # тесты
npm run db:studio      # веб-админка базы
```

Перед тем как считать задачу готовой, **обязательно** прогоните `npm run typecheck` и `npm test`.

## Где что лежит

| Путь | Что там |
| --- | --- |
| `prisma/schema.prisma` | Таблицы: User, Project, Task, Comment и enum'ы ролей, статусов, приоритетов |
| `prisma/migrations/` | История миграций. Руками не правим, создаём через `npm run db:migrate -- --name <имя>` |
| `prisma/seed.ts` | Тестовые данные (`--if-empty` — только в пустую базу) |
| `render.yaml` | Настройка деплоя на Render: сборка, миграции и seed при старте |
| `src/app.ts` | Сборка приложения: плагины, роуты, единый обработчик ошибок |
| `src/server.ts` | Точка входа: читает `.env` и запускает сервер |
| `src/auth.ts` | JWT: проверка токена, `request.currentUser` |
| `src/google.ts` | Проверка ID-токена Google (`google-auth-library`) |
| `src/permissions.ts` | **Все правила доступа.** Роуты спрашивают `can.*`, а не проверяют роли сами |
| `src/routes/*.ts` | Эндпоинты: auth, users, projects, tasks, comments |
| `src/serialize.ts` | Формат задач в ответах (ключ `PJ1-12`, автор, исполнитель, число комментариев) |
| `test/` | Тесты: `permissions.test.ts` — правила, `api.test.ts` — эндпоинты через `app.inject` |

## Роли и права

| Действие | ADMIN | MANAGER | MEMBER | VIEWER |
| --- | --- | --- | --- | --- |
| Смотреть задачи, комментарии | ✓ | ✓ | ✓ | ✓ |
| Создавать задачи (и назначать на любого) | ✓ | ✓ | ✓ | – |
| Менять/двигать задачу | любую | любую | только свою* | – |
| Удалять задачи | ✓ | ✓ | – | – |
| Комментировать | ✓ | ✓ | ✓ | – |
| Удалять комментарий | любой | любой | только свой | – |
| Создавать, менять, удалять пустые проекты | ✓ | ✓ | – | – |
| Создавать, менять, удалять пользователей | ✓ | – | – | – |

\* «Своя» задача — где пользователь автор или исполнитель.

ADMIN не может снять роль ADMIN с себя и удалить себя. Пользователя, у которого есть задачи
или комментарии, не удаляем (409): вместо этого ему меняют роль на VIEWER.

Меняете правила — меняйте `src/permissions.ts`, таблицу выше и тесты в одном изменении.

## API

Все запросы, кроме `/health` и `/auth/*` (без `/me`), требуют заголовок `Authorization: Bearer <token>`.

- `GET /auth/options` → `{ googleClientId, devLogin }` — какие способы входа включены
- `POST /auth/google` `{ credential }` → `{ token, user }` — вход по ID-токену Google (`GOOGLE_CLIENT_ID`).
  Новый пользователь создаётся с ролью VIEWER, email из `ADMIN_EMAILS` получают ADMIN.
  Если пользователь с таким email уже есть (завёл админ), Google-аккаунт привязывается к нему.
- `GET /auth/dev-users`, `POST /auth/dev-login` `{ userId }` → `{ token, user }` — вход без пароля,
  только при `ALLOW_DEV_LOGIN=true` и только в тестовых пользователей (не ADMIN и без Google)
- `GET /me`
- `GET /users`
- `POST /users` `{ name, email, role? }`, `PATCH /users/:id` `{ name?, email?, role? }`, `DELETE /users/:id` (ADMIN)
- `GET /projects`, `POST /projects` `{ key, name, color? }`
- `PATCH /projects/:id` `{ name?, color? }` (ключ не меняется), `DELETE /projects/:id` (только без задач)
- `GET /tasks?projectId=&status=&assigneeId=`, `GET /tasks/:id`
- `POST /tasks` `{ projectId, title, description?, priority?, assigneeId? }`
- `PATCH /tasks/:id` `{ title?, description?, status?, priority?, assigneeId? }`
- `DELETE /tasks/:id`
- `GET /tasks/:id/comments`, `POST /tasks/:id/comments` `{ text }`, `DELETE /comments/:id`

Статусы: `TODO`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE` (совпадают с колонками доски).
Приоритеты: `LOW`, `MEDIUM` (по умолчанию), `HIGH`, `CRITICAL`.
Ошибки всегда в виде `{ "error": "текст", "details"?: [...] }`: 400 — неверные данные,
401 — нет входа, 403 — нет прав, 404 — не найдено, 409 — дубль.

## Правила для изменений

- Новое поле или таблица: правка `schema.prisma` → `npm run db:migrate -- --name <что_поменяли>` →
  миграция коммитится вместе с кодом.
- Входные данные проверяем через zod в роуте. Ошибки бросаем `HttpError`/`forbidden`/`notFound`
  из `src/errors.ts`, обработчик в `app.ts` сам отдаст правильный код.
- Каждый новый эндпоинт или правило доступа — с тестом в `test/api.test.ts`.
- Тексты ошибок и комментарии в коде — по-русски, имена в коде — по-английски.
- Сообщения коммитов, названия и описания Pull Request — на английском.
- Не коммитим `.env`, `src/generated/`.
- Миграции применяются на Render автоматически при каждом деплое (`prisma migrate deploy` в `startCommand`).
- Работаем в отдельной ветке и открываем Pull Request в `main`, напрямую в `main` не пушим.
