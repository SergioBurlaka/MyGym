import { defineConfig } from 'vitest/config';

// Integration tests talk to a real PostgreSQL. They TRUNCATE every table
// between tests, so they only ever run against a database whose name
// contains "test" (enforced in test/globalSetup.ts) - never the dev/prod DB.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://mygym:mygym@localhost:5432/mygym_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // All files share one database - run them one after another.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
      CORS_ORIGIN: 'http://localhost:5173',
    },
  },
});
