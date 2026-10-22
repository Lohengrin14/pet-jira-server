// Тесты ходят в отдельную базу Postgres. Свою можно задать через TEST_DATABASE_URL
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/petjira_test'
