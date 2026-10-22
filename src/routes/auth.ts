import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { HttpError } from '../errors'
import { userSelect } from '../serialize'

export async function authRoutes(app: FastifyInstance, opts: { allowDevLogin: boolean }) {
  // Вход выбором пользователя без пароля. Только для мока, потом заменим на Google
  app.post('/auth/dev-login', async (request) => {
    if (!opts.allowDevLogin) throw new HttpError(404, 'Вход без пароля выключен')
    const { userId } = z.object({ userId: z.number().int() }).parse(request.body)
    const user = await app.prisma.user.findUnique({ where: { id: userId }, select: userSelect })
    if (!user) throw new HttpError(404, 'Пользователь не найден')
    return { token: app.jwt.sign({ sub: user.id }), user }
  })

  app.get('/me', { onRequest: app.authenticate }, async (request) => {
    const { id, name, email, role } = request.currentUser
    return { id, name, email, role }
  })
}
