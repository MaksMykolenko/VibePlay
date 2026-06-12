/**
 * Integration test bootstrap.
 *
 * If DATABASE_URL is already provided (CI: postgres service container) it is
 * used as-is. Otherwise an embedded PostgreSQL instance is started locally so
 * the integration suite runs against a real database with the real migrations.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(os.tmpdir(), `vibeplay-test-pg-${process.pid}`);

export default async function globalSetup(): Promise<() => Promise<void>> {
  let stop: (() => Promise<void>) | null = null;

  if (!process.env.DATABASE_URL) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const pg = new EmbeddedPostgres({
      databaseDir: DB_DIR,
      user: 'vibeplay',
      password: 'vibeplay',
      port: 55433,
      persistent: false,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('vibeplay_test');
    process.env.DATABASE_URL = 'postgresql://vibeplay:vibeplay@localhost:55433/vibeplay_test';
    stop = async () => {
      await pg.stop();
      rmSync(DB_DIR, { recursive: true, force: true });
    };
  }

  // Apply the real migrations to the (possibly fresh) database.
  const databasePkg = path.resolve(__dirname, '../../../../packages/database');
  execSync('npx prisma migrate deploy', {
    cwd: databasePkg,
    env: { ...process.env },
    stdio: 'pipe',
  });

  // Scratch dir for the fs storage driver.
  process.env.VIBEPLAY_TEST_STORAGE = mkdtempSync(path.join(os.tmpdir(), 'vibeplay-storage-'));

  return async () => {
    if (stop) await stop();
    rmSync(process.env.VIBEPLAY_TEST_STORAGE!, { recursive: true, force: true });
  };
}
