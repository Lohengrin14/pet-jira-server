import 'dotenv/config'
import { buildApp } from './app'
import { createPrisma } from './db'
import { createGoogleVerifier } from './google'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) throw new Error('Не задан JWT_SECRET (см. .env.example)')

const list = (value?: string) => (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const googleClientId = process.env.GOOGLE_CLIENT_ID || undefined

const app = await buildApp({
  prisma: createPrisma(),
  jwtSecret,
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === 'true',
  googleClientId,
  verifyGoogle: googleClientId ? createGoogleVerifier(googleClientId) : undefined,
  adminEmails: list(process.env.ADMIN_EMAILS),
  corsOrigins: list(process.env.CORS_ORIGINS ?? 'http://localhost:5173'),
  logger: true,
})

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
