import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E } from './env.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Build everything the stack serves BEFORE the webServer boots:
 * - workspace packages (shared/config/database/storage/sdk);
 * - the REAL production web bundle (VITE_APP_MODE=real) into dist-e2e;
 * - ZIP fixtures (valid game, missing index, forbidden extension) plus the
 *   traversal/corrupt archives created by the harness itself.
 *
 * Skipped when targeting an external (Docker) stack.
 */
export default function globalSetup(): void {
  if (process.env.E2E_EXTERNAL_STACK) return;
  // Local fast path: skip rebuilds when nothing changed (CI never sets this).
  if (process.env.E2E_SKIP_BUILD === 'true') return;

  const run = (cmd: string, opts: { cwd?: string; env?: Record<string, string> } = {}) => {
    execSync(cmd, {
      cwd: opts.cwd ?? repoRoot,
      stdio: 'inherit',
      env: { ...process.env, ...opts.env },
    });
  };

  run('npm run db:generate');
  run('npm run build:packages');
  run('node fixtures/build-fixtures.mjs');

  const distE2e = path.join(repoRoot, 'apps/web/dist-e2e');
  if (!existsSync(distE2e) || process.env.E2E_FORCE_WEB_BUILD === 'true') {
    run('npx vite build --outDir dist-e2e --emptyOutDir', {
      cwd: path.join(repoRoot, 'apps/web'),
      env: {
        VITE_APP_MODE: 'real',
        VITE_API_URL: `${E2E.apiUrl}/api`,
        VITE_GAME_ORIGIN: E2E.gameOrigin,
      },
    });
  }
}
