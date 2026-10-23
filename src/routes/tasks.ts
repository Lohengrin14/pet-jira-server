import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { forbidden, HttpError, notFound } from '../errors'
import { Priority, TaskStatus } from '../generated/prisma/enums'
import { can } from '../permissions'
import { serializeTask, taskInclude } from '../serialize'

const idParams = z.object({ id: z.coerce.number().int() })

const taskFields = {
  title: z.string().trim().min(1, 'Название не может быть пустым').max(200),
  description: z.string().max(10_000),
  status: z.enum(TaskStatus),
  priority: z.enum(Priority),
  assigneeId: z.number().int().nullable(),
}

export async function taskRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  async function findTask(id: number) {
    const task = await app.prisma.task.findUnique({ where: { id }, include: taskInclude })
    if (!task) throw notFound('Задача не найдена')
    return task
  }

  async function assertUserExists(userId: number | null | undefined) {
    if (userId == null) return
    const user = await app.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new HttpError(400, 'Исполнитель не найден')
  }

  app.get('/tasks', async (request) => {
    const query = z
      .object({
        projectId: z.coerce.number().int(),
        status: z.enum(TaskStatus),
        assigneeId: z.coerce.number().int(),
      })
      .partial()
      .parse(request.query)
    const tasks = await app.prisma.task.findMany({
      where: query,
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    })
    return tasks.map(serializeTask)
  })

  app.get('/tasks/:id', async (request) => {
    const { id } = idParams.parse(request.params)
    return serializeTask(await findTask(id))
  })

  app.post('/tasks', async (request, reply) => {
    const actor = request.currentUser
    if (!can.createTask(actor)) throw forbidden('VIEWER не может создавать задачи')
    const body = z
      .object({
        projectId: z.number().int(),
        title: taskFields.title,
        description: taskFields.description.optional(),
        priority: taskFields.priority.optional(),
        assigneeId: taskFields.assigneeId.optional(),
      })
      .parse(request.body)
    await assertUserExists(body.assigneeId)

    // Номер задачи берём из счётчика проекта в той же транзакции, чтобы номера не повторялись
    const task = await app.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: body.projectId },
        data: { taskCount: { increment: 1 } },
      }).catch(() => {
        throw new HttpError(400, 'Проект не найден')
      })
      return tx.task.create({
        data: { ...body, number: project.taskCount, authorId: actor.id },
        include: taskInclude,
      })
    })
    return reply.code(201).send(serializeTask(task))
  })

  app.patch('/tasks/:id', async (request) => {
    const { id } = idParams.parse(request.params)
    const body = z.object(taskFields).partial().parse(request.body)
    const task = await findTask(id)
    if (!can.editTask(request.currentUser, task)) {
      throw forbidden(
        request.currentUser.role === 'VIEWER'
          ? 'VIEWER не может менять задачи'
          : 'MEMBER может менять только свои задачи (где он автор или исполнитель)',
      )
    }
    await assertUserExists(body.assigneeId)
    const updated = await app.prisma.task.update({ where: { id }, data: body, include: taskInclude })
    return serializeTask(updated)
  })

  app.delete('/tasks/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params)
    await findTask(id)
    if (!can.deleteTask(request.currentUser)) throw forbidden('Удалять задачи могут только ADMIN и MANAGER')
    await app.prisma.task.delete({ where: { id } })
    return reply.code(204).send()
  })
}
