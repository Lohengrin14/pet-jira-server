import fastifyJwt from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { User } from './generated/prisma/client'
import { HttpError } from './errors'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number }
    user: { sub: number }
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: User
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>
  }
}

// Проверяет токен из заголовка Authorization и кладёт пользователя в request.currentUser
export const authPlugin = fp(async (app: FastifyInstance, opts: { secret: string }) => {
  await app.register(fastifyJwt, { secret: opts.secret, sign: { expiresIn: '7d' } })

  app.decorateRequest('currentUser', null as unknown as User)
  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify()
    } catch {
      throw new HttpError(401, 'Нужен вход: передайте токен в заголовке Authorization')
    }
    const user = await app.prisma.user.findUnique({ where: { id: request.user.sub } })
    if (!user) throw new HttpError(401, 'Пользователь не найден')
    request.currentUser = user
  })
})
