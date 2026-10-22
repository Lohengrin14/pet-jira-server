import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

// Перед тестами создаём чистую базу test.db по миграциям
export default function setup() {
  rmSync('test.db', { force: true })
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'ignore',
  })
}
