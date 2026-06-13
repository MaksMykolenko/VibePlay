import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { buildTestApp, getTestPrisma, resetDb } from '../test/helpers.js';

/**
 * Redis-backed rate limiting (spec §33). REQUIRES a real Redis:
 * CI provides a service container; local runs use the docker compose redis
 * (REDIS_URL=redis://localhost:6379). This suite intentionally FAILS (never
 * silently skips) when Redis is missing — rate limiting is a beta gate.
 *
 * Verified properties:
 * - endpoint-specific budgets (login) trigger 429 with retry-after;
 * - two app instances (replicas) SHARE counters through Redis;
 * - an app restart does NOT reset counters (state lives in Redis).
 */
const REDIS_URL = process.env.RATE_LIMIT_REDIS_URL ?? process.env.REDIS_URL ?? '';

describe('redis rate limiting', () => {
  let appA: FastifyInstance;
  let appB: FastifyInstance;
  let redis: Redis;

  const env = { REDIS_URL };

  async function clearRateLimitKeys() {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'vibeplay:rl:*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) await redis.unlink(...keys);
    } while (cursor !== '0');
  }

  beforeAll(async () => {
    if (!REDIS_URL || REDIS_URL.includes('unused-in-tests')) {
      throw new Error(
        'redis rate limiting tests need a real Redis: set REDIS_URL (e.g. redis://localhost:6379 from docker compose)',
      );
    }
    process.env.RATE_LIMIT_TESTS = 'true';
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
    await redis.ping();
    await clearRateLimitKeys();
    await resetDb(getTestPrisma());
    ({ app: appA } = await buildTestApp(env));
    ({ app: appB } = await buildTestApp(env));
  });

  afterAll(async () => {
    delete process.env.RATE_LIMIT_TESTS;
    await appA?.close();
    await appB?.close();
    await clearRateLimitKeys();
    await redis?.quit();
  });

  const attemptLogin = (app: FastifyInstance, ip: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: ip,
      payload: { email: 'nobody@example.com', password: 'wrong-password-123' },
    });

  it('enforces the login policy with 429 + retry-after, shared across replicas and restarts', async () => {
    const ip = '10.99.0.1';

    // Login policy: max 10 / 15 min. Alternate replicas to prove shared state.
    for (let i = 0; i < 10; i++) {
      const app = i % 2 === 0 ? appA : appB;
      const res = await attemptLogin(app, ip);
      expect(res.statusCode, `attempt ${i + 1}`).toBe(401);
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
    }

    // 11th attempt on EITHER replica is rate limited.
    const blockedOnB = await attemptLogin(appB, ip);
    expect(blockedOnB.statusCode).toBe(429);
    expect(blockedOnB.json().error.code).toBe('RATE_LIMITED');
    expect(Number(blockedOnB.headers['retry-after'])).toBeGreaterThan(0);

    const blockedOnA = await attemptLogin(appA, ip);
    expect(blockedOnA.statusCode).toBe(429);

    // "Restart": a brand-new app instance against the same Redis still blocks.
    const { app: restarted } = await buildTestApp(env);
    try {
      const blockedAfterRestart = await attemptLogin(restarted, ip);
      expect(blockedAfterRestart.statusCode).toBe(429);
    } finally {
      await restarted.close();
    }
  });

  it('keeps separate budgets per endpoint and per subject', async () => {
    // A different IP is not affected by the previous test's counter.
    const fresh = await attemptLogin(appA, '10.99.0.2');
    expect(fresh.statusCode).toBe(401);

    // The same (blocked) IP can still call other endpoints: per-route keys.
    const games = await appA.inject({
      method: 'GET',
      url: '/api/games',
      remoteAddress: '10.99.0.1',
    });
    expect(games.statusCode).toBe(200);
  });

  it('refuses to start when the Redis counter store is unavailable', async () => {
    await expect(buildTestApp({ REDIS_URL: 'redis://127.0.0.1:1' })).rejects.toThrow(
      'Redis-backed rate limiting is unavailable',
    );
  });
});
