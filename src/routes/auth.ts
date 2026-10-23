import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { forbidden, HttpError, notFound } from '../errors'
import type { GoogleVerifier } from '../google'
import { userSelect } from '../serialize'

export type AuthOptions = {
  allowDevLogin: boolean
  googleClientId?: string
  verifyGoogle?: GoogleVerifier
  adminEmails: string[]
}

// Тестовый вход разрешён только в тестовые аккаунты: без Google и не ADMIN.
// Иначе любой мог бы войти админом или под чужим настоящим аккаунтом
const devLoginWhere = { googleId: null, role: { not: 'ADMIN' } } as const

export async function authRoutes(app: FastifyInstance, opts: AuthOptions) {
  // Какие способы входа включены. Доска по этому решает, что показать
  app.get('/auth/options', async () => ({
    googleClientId: opts.googleClientId ?? null,
    devLogin: opts.allowDevLogin,
  }))

  app.post('/auth/google', async (request) => {
    if (!opts.verifyGoogle) throw notFound('Вход через Google не настроен на сервере')
    const { credential } = z.object({ credential: z.string().min(1) }).parse(request.body)
    const profile = await opts.verifyGoogle(credential)
    const isAdminEmail = opts.adminEmails.includes(profile.email)

    // Ищем по Google ID, потом по email (например, админ заранее завёл пользователя)
    const existing =
      (await app.prisma.user.findUnique({ where: { googleId: profile.googleId } })) ??
      (await app.prisma.user.findUnique({ where: { email: profile.email } }))

    // Новые пользователи приходят наблюдателями, роль потом выдаёт ADMIN
    const user = existing
      ? await app.prisma.user.update({
          where: { id: existing.id },
          data: { googleId: profile.googleId, email: profile.email, ...(isAdminEmail && { role: 'ADMIN' }) },
          select: userSelect,
        })
      : await app.prisma.user.create({
          data: { ...profile, role: isAdminEmail ? 'ADMIN' : 'VIEWER' },
          select: userSelect,
        })
    return { token: app.jwt.sign({ sub: user.id }), user }
  })

  // Вход выбором тестового пользователя без пароля. Только для мока
  app.get('/auth/dev-users', async () => {
    if (!opts.allowDevLogin) throw notFound('Тестовый вход выключен')
    return app.prisma.user.findMany({ where: devLoginWhere, select: userSelect, orderBy: { id: 'asc' } })
  })

  app.post('/auth/dev-login', async (request) => {
    if (!opts.allowDevLogin) throw notFound('Тестовый вход выключен')
    const { userId } = z.object({ userId: z.number().int() }).parse(request.body)
    const user = await app.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new HttpError(404, 'Пользователь не найден')
    if (user.googleId || user.role === 'ADMIN') {
      throw forbidden('Тестовый вход доступен только для тестовых пользователей (не ADMIN и без Google)')
    }
    const { id, name, email, role } = user
    return { token: app.jwt.sign({ sub: id }), user: { id, name, email, role } }
  })

  app.get('/me', { onRequest: app.authenticate }, async (request) => {
    const { id, name, email, role } = request.currentUser
    return { id, name, email, role }
  })
}
