import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { forbidden, notFound } from '../errors'
import { Role } from '../generated/prisma/enums'
import { can } from '../permissions'
import { userSelect } from '../serialize'

export async function userRoutes(app: FastifyInstance, opts: { allowDevLogin: boolean }) {
  // Список для входа в режиме мока доступен без токена, иначе только после входа
  app.get('/users', { onRequest: opts.allowDevLogin ? [] : app.authenticate }, async () =>
    app.prisma.user.findMany({ select: userSelect, orderBy: { id: 'asc' } }),
  )

  app.patch('/users/:id', { onRequest: app.authenticate }, async (request) => {
    if (!can.manageUsers(request.currentUser)) throw forbidden('Роли меняет только ADMIN')
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params)
    const body = z.object({ role: z.enum(Role), name: z.string().trim().min(1).optional() }).partial().parse(request.body)
    const exists = await app.prisma.user.findUnique({ where: { id } })
    if (!exists) throw notFound('Пользователь не найден')
    return app.prisma.user.update({ where: { id }, data: body, select: userSelect })
  })
}
