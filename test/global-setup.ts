import { execSync } from 'node:child_process'
import { testDatabaseUrl } from './test-db-url'

// Перед тестами применяем миграции к тестовой базе. Данные чистит каждый тест сам (test/helpers.ts)
export default function setup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'ignore',
  })
}
