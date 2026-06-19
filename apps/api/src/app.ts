import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { ApiEnv } from '@vibeplay/config';
import { createPrismaClient, type PrismaClient } from '@vibeplay/database';
import { ApiError, type ApiErrorBody, type ErrorCode } from '@vibeplay/shared';
import { createFsStorage, createS3Storage, type ObjectStorage } from '@vibeplay/storage';
import { createMailer, type Mailer } from './lib/mailer.js';
import { createValidationQueue, type InlineProcessor } from './lib/queue.js';
import { RATE_LIMIT_POLICIES, createRateLimitRedis, rateLimitSubject } from './lib/rateLimit.js';
import { CSRF_COOKIE, resolveSession } from './lib/sessions.js';
import { hashToken } from './lib/crypto.js';
import { safeEqual } from './lib/crypto.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDomainRoutes } from './routes/index.js';

export interface BuildAppOptions {
  env: ApiEnv;
  /** Injectable for tests. */
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  mailer?: Mailer;
  inlineProcessor?: InlineProcessor;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { env } = opts;

  const app = Fastify({
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024, // 1 MiB JSON bodies; game ZIPs go directly to object storage
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    logger: {
      level: env.LOG_LEVEL,
      base: { service: 'api' },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.token',
          '*.tokenHash',
        ],
        censor: '[redacted]',
      },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  // --- dependencies -------------------------------------------------------
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
  const mailer = opts.mailer ?? createMailer(env);
  const { queue, redisPing } = createValidationQueue(env, opts.inlineProcessor);

  app.decorate('env', env);
  app.decorate('prisma', prisma);
  app.decorate('storage', storage);
  app.decorate('mailer', mailer);
  app.decorate('validationQueue', queue);
  app.decorate('redisPing', redisPing);
  app.decorateRequest('currentUser', null);
  app.decorateRequest('currentSession', null);
  app.addContentTypeParser('application/zip', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });
  // Raw image bodies for same-origin avatar uploads (validated by magic bytes in
  // the route handler). MinIO is never exposed publicly — the API stores these.
  app.addContentTypeParser(
    ['image/png', 'image/jpeg', 'image/webp'],
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.addHook('onClose', async () => {
    await queue.close();
    if (!opts.prisma) await prisma.$disconnect();
  });

  // --- plugins --------------------------------------------------------------
  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow same-origin/no-origin (curl, server-side) and the configured web origin.
      if (!origin || origin === env.WEB_ORIGIN) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  // Rate limiting (spec §33): Redis-backed in real deployments so restarts do
  // not reset counters and replicas share state; per-endpoint policies are
  // attached on routes via `config: { rateLimit: rlPolicy(...) }`.
  const rateLimitRedis = createRateLimitRedis(env);
  if (rateLimitRedis) {
    rateLimitRedis.on('error', (err) => app.log.error({ err }, 'rate limit Redis error'));
    try {
      await rateLimitRedis.connect();
      await rateLimitRedis.ping();
    } catch (err) {
      rateLimitRedis.disconnect();
      throw new Error('Redis-backed rate limiting is unavailable', { cause: err });
    }
    app.log.info('rate limiting: redis store enabled');
    app.addHook('onClose', async () => {
      rateLimitRedis.disconnect();
    });
  } else if (env.NODE_ENV === 'production') {
    throw new Error('Redis-backed rate limiting is required in production');
  }
  await app.register(rateLimit, {
    global: true,
    // Session resolution runs in onRequest, so preHandler can key authenticated
    // traffic by user id while anonymous traffic still falls back to the IP.
    hook: 'preHandler',
    max: RATE_LIMIT_POLICIES.global.max,
    timeWindow: RATE_LIMIT_POLICIES.global.timeWindow,
    keyGenerator: (req) => `global:${rateLimitSubject(req)}`,
    ...(rateLimitRedis ? { redis: rateLimitRedis } : {}),
    // Runtime store errors fail closed instead of admitting unlimited traffic.
    skipOnError: false,
    allowList: () => env.NODE_ENV === 'test' && process.env.RATE_LIMIT_TESTS !== 'true',
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
    // statusCode is required so the global error handler maps this to the
    // unified RATE_LIMITED envelope with HTTP 429 (not a generic 500).
    errorResponseBuilder: (req) => ({
      statusCode: 429,
      error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down', requestId: req.id },
    }),
  });

  // --- request context ------------------------------------------------------
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    const resolved = await resolveSession(prisma, env, req);
    if (resolved) {
      req.currentUser = resolved.user;
      req.currentSession = resolved.session;
    }
  });

  // CSRF: double-submit cookie + session binding for every authenticated mutation.
  app.addHook('preHandler', async (req) => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    if (!req.currentSession) return; // unauthenticated mutations carry no ambient authority
    const header = req.headers['x-csrf-token'];
    const cookieVal = req.cookies[CSRF_COOKIE];
    if (
      typeof header !== 'string' ||
      !cookieVal ||
      !safeEqual(header, cookieVal) ||
      !safeEqual(req.currentSession.csrfHash, hashToken(header, env.SESSION_SECRET))
    ) {
      throw new ApiError(403, 'CSRF_FAILED', 'CSRF token missing or invalid');
    }
  });

  // --- error handling --------------------------------------------------------
  app.setErrorHandler((err, req, reply) => {
    const requestId = req.id;

    if (err instanceof ApiError) {
      const body: ApiErrorBody = {
        error: { code: err.code, message: err.message, requestId, details: err.details },
      };
      reply.status(err.statusCode).send(body);
      return;
    }

    if (err instanceof ZodError) {
      const body: ApiErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId,
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
      reply.status(422).send(body);
      return;
    }

    const fastifyErr = err as { statusCode?: number; code?: string };
    if (fastifyErr.statusCode === 429) {
      reply.status(429).send({
        error: {
          code: 'RATE_LIMITED' satisfies ErrorCode,
          message: 'Too many requests',
          requestId,
        },
      });
      return;
    }
    if (fastifyErr.statusCode === 413) {
      reply.status(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE' satisfies ErrorCode,
          message: 'Payload too large',
          requestId,
        },
      });
      return;
    }
    if (fastifyErr.statusCode && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
      // Fastify content-type / malformed JSON errors etc. Never leak internals.
      reply.status(fastifyErr.statusCode).send({
        error: { code: 'VALIDATION_ERROR' satisfies ErrorCode, message: 'Bad request', requestId },
      });
      return;
    }

    req.log.error({ err, requestId }, 'unhandled error');
    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR' satisfies ErrorCode,
        message: 'Internal server error',
        requestId,
      },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND' satisfies ErrorCode,
        message: 'Route not found',
        requestId: req.id,
      },
    });
  });

  // --- routes ----------------------------------------------------------------
  await app.register(registerHealthRoutes, { prefix: '/api/health' });
  await registerDomainRoutes(app);
  if (env.TEST_MAILBOX && env.NODE_ENV !== 'production') {
    const { registerTestSupportRoutes } = await import('./routes/testSupport.js');
    await app.register(registerTestSupportRoutes, { prefix: '/api/test' });
  }

  return app;
}
