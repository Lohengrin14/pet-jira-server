# Pet Jira Server

Серверная часть моковой доски [Pet Jira](https://github.com/Lohengrin14/pet-jira) для проверки работы агентов.

Node.js + TypeScript, Fastify, Prisma (SQLite локально). Пользователи с ролями
(ADMIN, MANAGER, MEMBER, VIEWER), проекты, задачи с приоритетом и комментарии.

## Быстрый старт

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

Подробно про структуру, API, роли и правила для изменений — в [AGENTS.md](AGENTS.md).
