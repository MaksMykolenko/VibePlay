/**
 * VibePlay game host — the ONLY reader of published game files (spec §25–27, §30).
 *
 * Security model:
 * - runs on a separate origin (separate registrable domain in production);
 * - never sees or sets main-app auth cookies;
 * - on every request validates against the database that the requested version
 *   is the currently published version of a PUBLISHED game (short TTL cache,
 *   invalidated via Redis pub/sub) → hiding a game kills new loads within
 *   ACCESS_CACHE_TTL_SECONDS;
 * - admin preview of READY_FOR_REVIEW builds requires a short-lived HMAC token;
 * - strict CSP: WebGL/WASM-friendly but no external network, no frames, no forms.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import type { GameHostEnv } from '@vibeplay/config';
import { createPrismaClient, type PrismaClient } from '@vibeplay/database';
import { MIME_TYPES, checkArchivePath, fileExtension, storageKeys } from '@vibeplay/shared';
import { createFsStorage, createS3Storage, type ObjectStorage } from '@vibeplay/storage';

export interface GameHostOptions {
  env: GameHostEnv;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
}

interface AccessEntry {
  allowed: boolean;
  expiresAt: number;
}

export const INVALIDATION_CHANNEL = 'vibeplay:game-host:invalidate';

export function buildGameCsp(webOrigin: string): string {
  return [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${webOrigin}`,
  ].join('; ');
}

export async function buildGameHost(opts: GameHostOptions): Promise<FastifyInstance> {
  const { env } = opts;
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
    disableRequestLogging: env.NODE_ENV !== 'development',
  });

  const prisma = opts.prisma ?? createPrismaClient({ databaseUrl: env.DATABASE_URL });
  const storage =
    opts.storage ??
    (env.STORAGE_DRIVER === 's3'
      ? createS3Storage({
          endpoint: env.S3_ENDPOINT!,
          region: env.S3_REGION,
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        })
      : createFsStorage(env.FS_STORAGE_ROOT));

  const accessCache = new Map<string, AccessEntry>();
  const csp = buildGameCsp(new URL(env.WEB_ORIGIN).origin);

  // Redis invalidation (optional — without Redis we rely on the short TTL).
  let sub: Redis | null = null;
  if (env.REDIS_URL) {
    sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    try {
      await sub.connect();
      await sub.subscribe(INVALIDATION_CHANNEL);
      sub.on('message', (_ch, gameId) => {
        for (const key of accessCache.keys()) {
          if (key.startsWith(`${gameId}:`)) accessCache.delete(key);
        }
      });
    } catch (err) {
      app.log.warn({ err }, 'game-host: redis unavailable, relying on cache TTL');
      sub = null;
    }
  }

  app.addHook('onClose', async () => {
    sub?.disconnect();
    if (!opts.prisma) await prisma.$disconnect();
  });

  function setSecurityHeaders(reply: FastifyReply, immutable: boolean): void {
    reply.header('content-security-policy', csp);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=(), payment=(), midi=(), usb=(), serial=(), bluetooth=(), display-capture=()',
    );
    reply.header('cross-origin-resource-policy', 'cross-origin');
    reply.header('x-frame-options', undefined as unknown as string); // frame-ancestors in CSP governs framing
    reply.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-store');
  }

  async function isServablePublished(gameId: string, versionId: string): Promise<boolean> {
    const key = `${gameId}:${versionId}`;
    const cached = accessCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.allowed;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { status: true, publishedVersionId: true },
    });
    const allowed = !!game && game.status === 'PUBLISHED' && game.publishedVersionId === versionId;
    accessCache.set(key, {
      allowed,
      expiresAt: Date.now() + env.ACCESS_CACHE_TTL_SECONDS * 1000,
    });
    return allowed;
  }

  async function streamFile(
    reply: FastifyReply,
    prefix: string,
    relPath: string,
    immutable: boolean,
  ): Promise<void> {
    const pathCheck = checkArchivePath(relPath);
    if (!pathCheck.ok) {
      await reply.status(400).send({ error: 'bad path' });
      return;
    }
    const ext = fileExtension(pathCheck.normalized!);
    const mime = MIME_TYPES[ext];
    if (!mime) {
      await reply.status(404).send({ error: 'not found' });
      return;
    }
    try {
      const stream = await storage.getObjectStream(
        env.S3_PUBLISHED_BUCKET,
        `${prefix}${pathCheck.normalized}`,
      );
      setSecurityHeaders(reply, immutable);
      reply.header('content-type', mime);
      await reply.send(stream);
    } catch {
      setSecurityHeaders(reply, false);
      await reply.status(404).send({ error: 'not found' });
    }
  }

  // --- published game content ----------------------------------------------
  app.get<{ Params: { gameId: string; versionId: string; '*': string } }>(
    '/g/:gameId/:versionId/*',
    async (req, reply) => {
      const { gameId, versionId } = req.params;
      const rel = req.params['*'] || 'index.html';
      if (!(await isServablePublished(gameId, versionId))) {
        setSecurityHeaders(reply, false);
        await reply.status(404).send({ error: 'not found' });
        return;
      }
      await streamFile(reply, storageKeys.publishedPrefix(gameId, versionId), rel, true);
    },
  );

  // --- admin preview (short-lived HMAC token, no cookies on this origin) ----
  app.get<{
    Params: { versionId: string; '*': string };
    Querystring: { t?: string };
  }>('/preview/:versionId/*', async (req, reply) => {
    const { versionId } = req.params;
    const rel = req.params['*'] || 'index.html';
    const token = req.query.t ?? '';
    if (!verifyPreviewToken(versionId, token, env.PREVIEW_URL_SECRET)) {
      setSecurityHeaders(reply, false);
      await reply.status(403).send({ error: 'invalid or expired preview token' });
      return;
    }
    const version = await prisma.gameVersion.findUnique({
      where: { id: versionId },
      select: { gameId: true, status: true, publishedObjectPrefix: true },
    });
    if (!version || !version.publishedObjectPrefix) {
      setSecurityHeaders(reply, false);
      await reply.status(404).send({ error: 'not found' });
      return;
    }
    await streamFile(reply, version.publishedObjectPrefix, rel, false);
  });

  // --- SDK file served from the game origin (CSP 'self' compatible) ---------
  let sdkSource: string | null = null;
  try {
    const require = createRequire(import.meta.url);
    const sdkPath = require.resolve('@vibeplay/sdk/vibeplay-sdk.js');
    sdkSource = readFileSync(sdkPath, 'utf8');
  } catch {
    app.log.warn('vibeplay-sdk.js not found — /sdk/vibeplay-sdk.js disabled');
  }
  app.get('/sdk/vibeplay-sdk.js', async (_req, reply) => {
    if (!sdkSource) {
      await reply.status(404).send({ error: 'sdk not built' });
      return;
    }
    setSecurityHeaders(reply, false);
    reply.header('content-type', 'text/javascript; charset=utf-8');
    reply.header('cache-control', 'public, max-age=3600');
    await reply.send(sdkSource);
  });

  // --- health ----------------------------------------------------------------
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await storage.healthCheck(env.S3_PUBLISHED_BUCKET);
      return { status: 'ok' };
    } catch (err) {
      reply.status(503);
      return { status: 'degraded', detail: (err as Error).message };
    }
  });

  app.setNotFoundHandler(async (_req, reply) => {
    setSecurityHeaders(reply, false);
    await reply.status(404).send({ error: 'not found' });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Preview token: `${expiresMs}.${hmac(versionId + '.' + expiresMs)}`
// ---------------------------------------------------------------------------

export function makePreviewToken(versionId: string, secret: string, ttlMs = 5 * 60_000): string {
  const expires = Date.now() + ttlMs;
  const sig = createHmac('sha256', secret).update(`${versionId}.${expires}`).digest('base64url');
  return `${expires}.${sig}`;
}

export function verifyPreviewToken(versionId: string, token: string, secret: string): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expires = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = createHmac('sha256', secret)
    .update(`${versionId}.${expires}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
