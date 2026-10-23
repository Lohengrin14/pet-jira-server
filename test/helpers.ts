import { buildApp } from '../src/app'
import { createPrisma } from '../src/db'
import { HttpError } from '../src/errors'
import type { GoogleVerifier } from '../src/google'
import type { Role } from '../src/generated/prisma/enums'

export async function setupTestApp() {
  const prisma = createPrisma()
  const app = await buildApp({
    prisma,
    jwtSecret: 'test-secret',
    allowDevLogin: true,
    corsOrigins: [],
    googleClientId: 'test-client-id',
    verifyGoogle: fakeGoogle,
    adminEmails: ['Boss@Gmail.com'],
  })

  await prisma.comment.deleteMany()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()

  const mkUser = (name: string, role: Role) =>
    prisma.user.create({ data: { name, role, email: `${name}@test.local` } })
  const users = {
    admin: await mkUser('admin', 'ADMIN'),
    manager: await mkUser('manager', 'MANAGER'),
    member: await mkUser('member', 'MEMBER'),
    other: await mkUser('other', 'MEMBER'),
    viewer: await mkUser('viewer', 'VIEWER'),
  }
  const project = await prisma.project.create({ data: { key: 'PJ1', name: 'Проект 1' } })

  const tokens = Object.fromEntries(
    Object.entries(users).map(([k, u]) => [k, app.jwt.sign({ sub: u.id })]),
  ) as Record<keyof typeof users, string>

  // Короткий помощник для запросов от имени пользователя
  const as = (who: keyof typeof users) => ({
    request: (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url, payload, headers: { authorization: `Bearer ${tokens[who]}` } }),
  })

  return { app, prisma, users, project, as }
}

// Вместо настоящего Google: токен вида "google:<id>:<email>:<имя>", всё остальное отклоняем
const fakeGoogle: GoogleVerifier = async (credential) => {
  const [prefix, googleId, email, name] = credential.split(':')
  if (prefix !== 'google') throw new HttpError(401, 'Google не подтвердил вход, попробуйте ещё раз')
  return { googleId, email, name }
}
