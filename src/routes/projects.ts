import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { forbidden, HttpError, notFound } from '../errors'
import { can } from '../permissions'

const projectSelect = { id: true, key: true, name: true, color: true } as const

const idParams = z.object({ id: z.coerce.number().int() })
const projectFields = {
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #rrggbb'),
}

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/projects', async () => app.prisma.project.findMany({ select: projectSelect, orderBy: { id: 'asc' } }))

  app.post('/projects', async (request, reply) => {
    if (!can.manageProjects(request.currentUser)) throw forbidden('Проекты создают ADMIN и MANAGER')
    const body = z
      .object({
        key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Ключ: 2–10 латинских букв и цифр'),
        name: projectFields.name,
        color: projectFields.color.optional(),
      })
      .parse(request.body)
    const project = await app.prisma.project.create({ data: body, select: projectSelect })
    return reply.code(201).send(project)
  })

  // Ключ не меняем: из него собраны номера задач (PJ1-12)
  app.patch('/projects/:id', async (request) => {
    if (!can.manageProjects(request.currentUser)) throw forbidden('Проекты меняют ADMIN и MANAGER')
    const { id } = idParams.parse(request.params)
    const body = z.object(projectFields).partial().parse(request.body)
    const exists = await app.prisma.project.findUnique({ where: { id } })
    if (!exists) throw notFound('Проект не найден')
    return app.prisma.project.update({ where: { id }, data: body, select: projectSelect })
  })

  app.delete('/projects/:id', async (request, reply) => {
    if (!can.manageProjects(request.currentUser)) throw forbidden('Проекты удаляют ADMIN и MANAGER')
    const { id } = idParams.parse(request.params)
    const project = await app.prisma.project.findUnique({ where: { id }, include: { _count: { select: { tasks: true } } } })
    if (!project) throw notFound('Проект не найден')
    if (project._count.tasks > 0) throw new HttpError(409, 'В проекте есть задачи. Сначала удалите их')
    await app.prisma.project.delete({ where: { id } })
    return reply.code(204).send()
  })
}
