import { defineConfig, devices } from '@playwright/test';

/**
 * VibePlay private-beta E2E suite (spec §31–§32).
 *
 * Runs against an isolated, fully real test stack (no mocks in the product
 * code path): embedded PostgreSQL + real Fastify API + real validation
 * pipeline (inline worker) + real game-host with per-version origins +
 * the REAL production web build (VITE_APP_MODE=real).
 *
 * The same suite runs against the Docker stack by exporting
 * E2E_EXTERNAL_STACK=true with E2E_WEB_URL / E2E_API_URL / E2E_GAME_ORIGIN.
 */
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:8088';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_EXTERNAL_STACK
    ? undefined
    : {
        command: 'npx tsx tests/e2e/stack/bootstrap.ts',
        url: `${WEB_URL}/__e2e_ready`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
