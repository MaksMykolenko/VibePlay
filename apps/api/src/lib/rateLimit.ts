import { Redis } from 'ioredis';
import type { FastifyRequest } from 'fastify';
import type { ApiEnv } from '@vibeplay/config';

/**
 * Rate-limit policies (spec §33). Persisted in Redis so that:
 * - API restarts do not reset abuse counters;
 * - multiple API replicas share one consistent view;
 * - sensitive endpoints get strict, endpoint-specific budgets.
 *
 * Keys are `vibeplay:rl:<route>:<subject>` where subject is the user id when
 * authenticated and the client IP otherwise.
 */

export interface RateLimitPolicy {
  max: number;
  timeWindow: string;
}

export const RATE_LIMIT_POLICIES = {
  /** Global safety net for everything without a dedicated policy. */
  global: { max: 300, timeWindow: '1 minute' },
  login: { max: 10, timeWindow: '15 minutes' },
  register: { max: 5, timeWindow: '1 hour' },
  forgotPassword: { max: 5, timeWindow: '1 hour' },
  resetPassword: { max: 10, timeWindow: '1 hour' },
  resendVerification: { max: 3, timeWindow: '1 hour' },
  changePassword: { max: 10, timeWindow: '1 hour' },
  comments: { max: 20, timeWindow: '5 minutes' },
  reports: { max: 10, timeWindow: '15 minutes' },
  uploadIntent: { max: 12, timeWindow: '1 hour' },
  uploadComplete: { max: 30, timeWindow: '1 hour' },
  gameLaunch: { max: 60, timeWindow: '5 minutes' },
  adminAction: { max: 120, timeWindow: '1 minute' },
  accountDeletion: { max: 3, timeWindow: '24 hours' },
  dataExport: { max: 3, timeWindow: '24 hours' },
  feedback: { max: 10, timeWindow: '1 hour' },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

/** Authenticated requests are limited per user; anonymous ones per IP. */
export function rateLimitSubject(req: FastifyRequest): string {
  return req.currentUser ? `u:${req.currentUser.id}` : `ip:${req.ip}`;
}

/** Route-level config helper: `config: { rateLimit: rlPolicy('login') }`. */
export function rlPolicy(name: RateLimitPolicyName): RateLimitPolicy & {
  keyGenerator: (req: FastifyRequest) => string;
} {
  const policy = RATE_LIMIT_POLICIES[name];
  return {
    max: policy.max,
    timeWindow: policy.timeWindow,
    keyGenerator: (req) => `${name}:${rateLimitSubject(req)}`,
  };
}

/**
 * Dedicated Redis connection for the rate-limit store. Returns null when the
 * process should fall back to the in-memory store (unit/integration tests
 * without Redis). Production always uses Redis — the API refuses to start
 * without REDIS_URL (env validation) and logs the active store at boot.
 */
export function createRateLimitRedis(env: ApiEnv): Redis | null {
  const testMode = env.NODE_ENV === 'test' && process.env.RATE_LIMIT_TESTS !== 'true';
  if (testMode || !env.REDIS_URL || env.REDIS_URL.includes('unused-in-tests')) {
    return null;
  }
  return new Redis(env.REDIS_URL, {
    // Required by @fastify/rate-limit: fail fast instead of queueing forever.
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    keyPrefix: 'vibeplay:rl:',
  });
}
