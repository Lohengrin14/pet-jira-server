# Pet Jira Server

Серверная часть моковой доски [Pet Jira](https://github.com/Lohengrin14/pet-jira) для проверки работы агентов.

Node.js + TypeScript, Fastify, Prisma, PostgreSQL. Пользователи с ролями
(ADMIN, MANAGER, MEMBER, VIEWER), проекты, задачи с приоритетом и комментарии.

## Быстрый старт локально

Нужен Postgres. Проще всего через Docker:

```bash
docker run -d --name pet-jira-db -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16
docker exec pet-jira-db createdb -U postgres petjira
docker exec pet-jira-db createdb -U postgres petjira_test
```

Потом:

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev        # http://localhost:3000
```

Проверить, что работает:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/users
curl -X POST http://localhost:3000/auth/dev-login -H 'content-type: application/json' -d '{"userId":1}'
```

Тесты: `npm test`. Данные в базе можно посмотреть в браузере: `npm run db:studio`.

## Деплой (Render + Neon)

`render.yaml` описывает сервис: регион Frankfurt, бесплатный план. При каждом старте сервер
применяет миграции и, если база пустая, заливает тестовые данные. Секрет `JWT_SECRET` Render
генерирует сам, `DATABASE_URL` (строка подключения из Neon, без pooling) вставляется вручную.

Бесплатный сервер засыпает после 15 минут без запросов, первый запрос после этого идёт около минуты.

Подробно про структуру, API, роли и правила для изменений — в [AGENTS.md](AGENTS.md).
