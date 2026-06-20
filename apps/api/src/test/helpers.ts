import type { FastifyInstance } from 'fastify';
import { apiEnvSchema, type ApiEnv } from '@vibeplay/config';
import { createPrismaClient, type PrismaClient } from '@vibeplay/database';
import { buildApp } from '../app.js';
import { hashPassword } from '../lib/crypto.js';
import type { InlineProcessor } from '../lib/queue.js';
import type { StripeGateway } from '../lib/stripe.js';

export function testEnv(overrides: Partial<Record<string, string>> = {}): ApiEnv {
  return apiEnvSchema.parse({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    WEB_ORIGIN: 'http://localhost:5173',
    API_ORIGIN: 'http://localhost:3000',
    GAME_ORIGIN: 'http://games.localhost:8080',
    DATABASE_URL: process.env.DATABASE_URL!,
    REDIS_URL: 'redis://unused-in-tests:6379',
    SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789abcdef',
    PASSWORD_PEPPER: 'test-pepper-0123456789abcdef',
    PREVIEW_URL_SECRET: 'test-preview-secret-0123456789abcdef0123456789ab',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback',
    STRIPE_SECRET_KEY: 'sk_test_vibeplay',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_vibeplay',
    STRIPE_CREATOR_PLUS_PRICE_ID: 'price_creator_plus_test',
    PUBLIC_APP_URL: 'http://localhost:5173',
    STORAGE_DRIVER: 'fs',
    FS_STORAGE_ROOT: process.env.VIBEPLAY_TEST_STORAGE ?? '.data/test-storage',
    SCAN_DRIVER: 'off',
    EMAIL_DRIVER: 'memory',
    QUEUE_DRIVER: 'inline',
    INVITE_ONLY: 'false',
    ...overrides,
  });
}

let sharedPrisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  sharedPrisma ??= createPrismaClient({ databaseUrl: process.env.DATABASE_URL! });
  return sharedPrisma;
}

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  env: ApiEnv;
}

export async function buildTestApp(
  envOverrides: Partial<Record<string, string>> = {},
  inlineProcessor?: InlineProcessor,
  options: { stripe?: StripeGateway } = {},
): Promise<TestContext> {
  const env = testEnv(envOverrides);
  const prisma = getTestPrisma();
  const app = await buildApp({
    env,
    prisma,
    inlineProcessor,
    ...(options.stripe ? { stripe: options.stripe } : {}),
  });
  await app.ready();
  return { app, prisma, env };
}

/** Wipe data between suites (order respects FK constraints via cascade). */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.feedback.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.report.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.playSession.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.like.deleteMany(),
    prisma.moderationDecision.deleteMany(),
    prisma.stripeWebhookEvent.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.upload.deleteMany(),
    prisma.gameScreenshot.deleteMany(),
    prisma.game.updateMany({ data: { publishedVersionId: null } }),
    prisma.gameVersion.deleteMany(),
    prisma.game.deleteMany(),
    prisma.invite.deleteMany(),
    prisma.oAuthAccount.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export const TEST_PASSWORD = 'correct-horse-battery-1';

export async function createUser(
  prisma: PrismaClient,
  env: ApiEnv,
  opts: {
    email: string;
    username: string;
    role?: 'PLAYER' | 'CREATOR' | 'ADMIN' | 'OWNER';
    status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';
    verified?: boolean;
  },
) {
  return prisma.user.create({
    data: {
      email: opts.email,
      username: opts.username,
      displayName: opts.username,
      passwordHash: await hashPassword(TEST_PASSWORD, env.PASSWORD_PEPPER),
      role: opts.role ?? 'PLAYER',
      status: opts.status ?? 'ACTIVE',
      emailVerifiedAt: opts.verified === false ? null : new Date(),
    },
  });
}

export interface AuthedAgent {
  cookies: Record<string, string>;
  csrf: string;
}

export function captureCookies(res: { cookies: { name: string; value: string }[] }): AuthedAgent {
  const cookies: Record<string, string> = {};
  for (const c of res.cookies) cookies[c.name] = c.value;
  return { cookies, csrf: cookies['vp_csrf'] ?? '' };
}

export async function loginAs(
  app: FastifyInstance,
  email: string,
  password = TEST_PASSWORD,
): Promise<AuthedAgent> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`loginAs failed: ${res.statusCode} ${res.body}`);
  }
  return captureCookies(res);
}

export function authed(agent: AuthedAgent): {
  cookies: Record<string, string>;
  headers: Record<string, string>;
} {
  return {
    cookies: agent.cookies,
    headers: { 'x-csrf-token': agent.csrf },
  };
}
