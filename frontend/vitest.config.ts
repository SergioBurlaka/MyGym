import { defineConfig } from 'vitest/config';

// Unit tests for plain modules (date utils...). The time zone is fixed so
// "local today" tests mean the same on any machine and in CI.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: { TZ: 'Europe/Kyiv' },
  },
});
