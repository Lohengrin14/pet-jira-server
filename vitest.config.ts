import { defineConfig } from 'vitest/config'
import { testDatabaseUrl } from './test/test-db-url'

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    env: { DATABASE_URL: testDatabaseUrl },
    fileParallelism: false,
  },
})
