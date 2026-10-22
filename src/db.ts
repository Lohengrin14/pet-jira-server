import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

export type { PrismaClient }

export function createPrisma(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('Не задан DATABASE_URL (см. .env.example)')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}
