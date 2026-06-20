/**
 * E2E stack launcher (spec §31): a fully REAL, isolated VibePlay deployment.
 *
 *   embedded PostgreSQL ── real Prisma migrations
 *   Fastify API          ── real auth/CSRF/uploads, inline validation worker
 *   game-host            ── per-version Host-based origins
 *   static web server    ── REAL production bundle (dist-e2e, APP_MODE=real)
 *
 * No application code is mocked: the inline queue driver runs the actual
 * worker pipeline (ZIP validation, extraction, scan report) in-process, which
 * is the documented dev/test mode of the product itself.
 */
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { apiEnvSchema, gameHostEnvSchema } from '@vibeplay/config';
import { DEFAULT_UPLOAD_LIMITS } from '@vibeplay/shared';
import { createPrismaClient } from '@vibeplay/database';
import { createFsStorage } from '@vibeplay/storage';
import { buildApp } from '../../../apps/api/src/app.js';
import { hashPassword } from '../../../apps/api/src/lib/crypto.js';
import { buildGameHost } from '../../../apps/game-host/src/app.js';
import { createDisabledScanner } from '../../../apps/worker/src/pipeline/clamav.js';
import { processVersion } from '../../../apps/worker/src/pipeline/processVersion.js';
import { E2E } from './env.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const log = pino({ level: 'warn', base: { service: 'e2e-stack' } });

const storageRoot = mkdtempSync(path.join(os.tmpdir(), 'vibeplay-e2e-storage-'));
const pgDir = mkdtempSync(path.join(os.tmpdir(), 'vibeplay-e2e-pg-'));

async function main(): Promise<void> {
  // --- 1. embedded PostgreSQL ----------------------------------------------
  // E2E_PG_TEMPLATE: optional path to a pre-initialised data dir; copying it
  // is much faster than initdb (useful for tight local iteration loops).
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const template = process.env.E2E_PG_TEMPLATE;
  if (template && existsSync(path.join(template, 'PG_VERSION'))) {
    execSync(`cp -R ${JSON.stringify(template)}/. ${JSON.stringify(pgDir)}/`);
  }
  const pg = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: 'vibeplay',
    password: 'vibeplay',
    port: E2E.pgPort,
    persistent: false,
  });
  if (!existsSync(path.join(pgDir, 'PG_VERSION'))) {
    await pg.initialise();
  }
  await pg.start();
  // When using a PG template the database already exists — skip creation.
  const usingTemplate = !!(template && existsSync(path.join(template, 'PG_VERSION')));
  if (!usingTemplate) {
    await pg.createDatabase('vibeplay_e2e');
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.join(repoRoot, 'packages/database'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
  });

  // --- 2. seed the admin account -------------------------------------------
  const prisma = createPrismaClient({ databaseUrl: E2E.databaseUrl });
  await prisma.user.upsert({
    where: { email: E2E.adminEmail },
    update: {},
    create: {
      email: E2E.adminEmail,
      username: 'e2eadmin',
      displayName: 'E2E Admin',
      passwordHash: await hashPassword(E2E.adminPassword, E2E.passwordPepper),
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });

  // --- 3. API with the REAL inline validation pipeline ---------------------
  const apiEnv = apiEnvSchema.parse({
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    WEB_ORIGIN: E2E.webUrl,
    API_ORIGIN: E2E.apiUrl,
    GAME_ORIGIN: E2E.gameOrigin,
    DATABASE_URL: E2E.databaseUrl,
    REDIS_URL: 'redis://unused-in-tests:6379',
    SESSION_SECRET: E2E.sessionSecret,
    PASSWORD_PEPPER: E2E.passwordPepper,
    PREVIEW_URL_SECRET: E2E.previewSecret,
    GOOGLE_CLIENT_ID: 'e2e-google-client-id',
    GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret',
    GOOGLE_REDIRECT_URI: `${E2E.apiUrl}/api/auth/google/callback`,
    STRIPE_SECRET_KEY: 'sk_test_e2e',
    STRIPE_WEBHOOK_SECRET: 'whsec_e2e',
    STRIPE_CREATOR_PLUS_PRICE_ID: 'price_e2e_creator_plus',
    PUBLIC_APP_URL: E2E.webUrl,
    STORAGE_DRIVER: 'fs',
    FS_STORAGE_ROOT: storageRoot,
    SCAN_DRIVER: 'off',
    EMAIL_DRIVER: 'memory',
    QUEUE_DRIVER: 'inline',
    INVITE_ONLY: 'true',
    TEST_MAILBOX: 'true',
    API_PORT: String(E2E.apiPort),
  });

  const storage = createFsStorage(storageRoot);
  const scanner = createDisabledScanner();
  const api = await buildApp({
    env: apiEnv,
    storage,
    inlineProcessor: async (job) => {
      await processVersion(
        {
          prisma,
          storage,
          scanner,
          quarantineBucket: apiEnv.S3_QUARANTINE_BUCKET,
          publishedBucket: apiEnv.S3_PUBLISHED_BUCKET,
          limits: DEFAULT_UPLOAD_LIMITS,
          log,
        },
        job,
      );
    },
  });
  await api.listen({ host: '127.0.0.1', port: E2E.apiPort });

  // --- 4. game-host (per-version Host routing) ------------------------------
  const gameHostEnv = gameHostEnvSchema.parse({
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    DATABASE_URL: E2E.databaseUrl,
    STORAGE_DRIVER: 'fs',
    FS_STORAGE_ROOT: storageRoot,
    WEB_ORIGIN: E2E.webUrl,
    GAME_ORIGIN: E2E.gameOrigin,
    PREVIEW_URL_SECRET: E2E.previewSecret,
    REDIS_URL: '',
    GAME_HOST_PORT: String(E2E.gameHostPort),
  });
  const gameHost = await buildGameHost({ env: gameHostEnv });
  await gameHost.listen({ host: '127.0.0.1', port: E2E.gameHostPort });

  // --- 5. static web server for the real production bundle -----------------
  const distDir = path.join(repoRoot, 'apps/web/dist-e2e');
  if (!existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('dist-e2e missing — global-setup should have built it');
  }
  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
  };
  const web = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]!;
    if (url === '/__e2e_ready') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    let file = path.join(distDir, path.normalize(url).replace(/^([.][.][/\\])+/, ''));
    if (!file.startsWith(distDir)) file = path.join(distDir, 'index.html');
    try {
      if (!statSync(file).isFile()) throw new Error('dir');
    } catch {
      file = path.join(distDir, 'index.html'); // SPA fallback for direct routes
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => web.listen(E2E.webPort, '127.0.0.1', resolve));

  console.log(`[e2e-stack] ready: web=${E2E.webUrl} api=${E2E.apiUrl} games=${E2E.gameOrigin}`);

  const shutdown = async () => {
    await api.close().catch(() => {});
    await gameHost.close().catch(() => {});
    web.close();
    await prisma.$disconnect().catch(() => {});
    await pg.stop().catch(() => {});
    rmSync(storageRoot, { recursive: true, force: true });
    rmSync(pgDir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err: unknown) => {
  const detail =
    err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err ?? 'unknown');
  console.error(`[e2e-stack] failed to start: ${detail}`);
  process.exit(1);
});
