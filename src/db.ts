import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from './generated/prisma/client'

export type { PrismaClient }

export function createPrisma(url = process.env.DATABASE_URL ?? 'file:./dev.db') {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })
}
