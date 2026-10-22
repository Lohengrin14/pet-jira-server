import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { forbidden } from '../errors'
import { can } from '../permissions'

const projectSelect = { id: true, key: true, name: true, color: true } as const

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/projects', async () => app.prisma.project.findMany({ select: projectSelect, orderBy: { id: 'asc' } }))

  app.post('/projects', async (request, reply) => {
    if (!can.manageProjects(request.currentUser)) throw forbidden('Проекты создают ADMIN и MANAGER')
    const body = z
      .object({
        key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Ключ: 2–10 латинских букв и цифр'),
        name: z.string().trim().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      })
      .parse(request.body)
    const project = await app.prisma.project.create({ data: body, select: projectSelect })
    return reply.code(201).send(project)
  })
}
