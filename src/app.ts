import cors from '@fastify/cors'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { authPlugin } from './auth'
import type { PrismaClient } from './db'
import { HttpError } from './errors'
import { Prisma } from './generated/prisma/client'
import { authRoutes } from './routes/auth'
import { commentRoutes } from './routes/comments'
import { projectRoutes } from './routes/projects'
import { taskRoutes } from './routes/tasks'
import { userRoutes } from './routes/users'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export type AppOptions = {
  prisma: PrismaClient
  jwtSecret: string
  allowDevLogin: boolean
  corsOrigins: string[]
  logger?: boolean
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false })

  app.decorate('prisma', opts.prisma)
  await app.register(cors, { origin: opts.corsOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE'] })
  await app.register(authPlugin, { secret: opts.jwtSecret })

  // Единый формат ошибок: { error: "текст", details?: [...] }
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Неверные данные',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.code(409).send({ error: 'Такая запись уже есть' })
    }
    const status = (error as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: (error as Error).message })
    request.log.error(error)
    return reply.code(500).send({ error: 'Внутренняя ошибка сервера' })
  })

  app.get('/health', async () => ({ ok: true }))
  await app.register(authRoutes, { allowDevLogin: opts.allowDevLogin })
  await app.register(userRoutes, { allowDevLogin: opts.allowDevLogin })
  await app.register(projectRoutes)
  await app.register(taskRoutes)
  await app.register(commentRoutes)

  return app
}
