import 'dotenv/config'
import { buildApp } from './app'
import { createPrisma } from './db'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) throw new Error('Не задан JWT_SECRET (см. .env.example)')

const app = await buildApp({
  prisma: createPrisma(),
  jwtSecret,
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === 'true',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  logger: true,
})

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
