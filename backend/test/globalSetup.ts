import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

// Runs once before the whole suite: apply the real migrations to the test
// database, so tests exercise the same schema production runs on.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://mygym:mygym@localhost:5432/mygym_test';
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes('test')) {
    throw new Error(`Refusing to run tests against "${dbName}": the database name must contain "test"`);
  }

  const pool = new pg.Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './migrations' });
  } finally {
    await pool.end();
  }
}
