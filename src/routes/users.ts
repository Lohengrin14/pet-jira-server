import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { forbidden, HttpError, notFound } from '../errors'
import { Role } from '../generated/prisma/enums'
import { type Actor, can } from '../permissions'
import { userSelect } from '../serialize'

const idParams = z.object({ id: z.coerce.number().int() })

const userFields = {
  name: z.string().trim().min(1, 'Имя не может быть пустым').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('Неверный email')),
  role: z.enum(Role),
}

export async function userRoutes(app: FastifyInstance, opts: { allowDevLogin: boolean }) {
  // Список для входа в режиме мока доступен без токена, иначе только после входа
  app.get('/users', { onRequest: opts.allowDevLogin ? [] : app.authenticate }, async () =>
    app.prisma.user.findMany({ select: userSelect, orderBy: { id: 'asc' } }),
  )

  // Остальное только для ADMIN
  function assertAdmin(actor: Actor) {
    if (!can.manageUsers(actor)) throw forbidden('Пользователями управляет только ADMIN')
  }

  app.post('/users', { onRequest: app.authenticate }, async (request, reply) => {
    assertAdmin(request.currentUser)
    const body = z
      .object({ name: userFields.name, email: userFields.email, role: userFields.role.optional() })
      .parse(request.body)
    const user = await app.prisma.user.create({ data: body, select: userSelect })
    return reply.code(201).send(user)
  })

  app.patch('/users/:id', { onRequest: app.authenticate }, async (request) => {
    assertAdmin(request.currentUser)
    const { id } = idParams.parse(request.params)
    const body = z.object(userFields).partial().parse(request.body)
    const exists = await app.prisma.user.findUnique({ where: { id } })
    if (!exists) throw notFound('Пользователь не найден')
    // Иначе админ может случайно лишить себя доступа к админке
    if (id === request.currentUser.id && body.role && body.role !== 'ADMIN') {
      throw new HttpError(400, 'Нельзя снять роль ADMIN с самого себя')
    }
    return app.prisma.user.update({ where: { id }, data: body, select: userSelect })
  })

  app.delete('/users/:id', { onRequest: app.authenticate }, async (request, reply) => {
    assertAdmin(request.currentUser)
    const { id } = idParams.parse(request.params)
    if (id === request.currentUser.id) throw new HttpError(400, 'Нельзя удалить самого себя')
    const user = await app.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { authoredTasks: true, comments: true } } },
    })
    if (!user) throw notFound('Пользователь не найден')
    // Задачи и комментарии хранят автора, поэтому такого пользователя не удаляем
    if (user._count.authoredTasks > 0 || user._count.comments > 0) {
      throw new HttpError(409, 'У пользователя есть задачи или комментарии. Вместо удаления поменяйте ему роль на VIEWER')
    }
    // С задач, где он исполнитель, просто снимаем назначение
    await app.prisma.$transaction([
      app.prisma.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }),
      app.prisma.user.delete({ where: { id } }),
    ])
    return reply.code(204).send()
  })
}
