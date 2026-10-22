import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { forbidden, notFound } from '../errors'
import { can } from '../permissions'
import { userSelect } from '../serialize'

const commentInclude = { author: { select: userSelect } } as const

export async function commentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  async function assertTaskExists(taskId: number) {
    const task = await app.prisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw notFound('Задача не найдена')
  }

  app.get('/tasks/:id/comments', async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params)
    await assertTaskExists(id)
    return app.prisma.comment.findMany({
      where: { taskId: id },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    })
  })

  app.post('/tasks/:id/comments', async (request, reply) => {
    if (!can.comment(request.currentUser)) throw forbidden('VIEWER не может комментировать')
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params)
    const { text } = z
      .object({ text: z.string().trim().min(1, 'Комментарий не может быть пустым').max(5_000) })
      .parse(request.body)
    await assertTaskExists(id)
    const comment = await app.prisma.comment.create({
      data: { text, taskId: id, authorId: request.currentUser.id },
      include: commentInclude,
    })
    return reply.code(201).send(comment)
  })

  app.delete('/comments/:id', async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params)
    const comment = await app.prisma.comment.findUnique({ where: { id } })
    if (!comment) throw notFound('Комментарий не найден')
    if (!can.deleteComment(request.currentUser, comment)) {
      throw forbidden('Удалить комментарий может автор, ADMIN или MANAGER')
    }
    await app.prisma.comment.delete({ where: { id } })
    return reply.code(204).send()
  })
}
