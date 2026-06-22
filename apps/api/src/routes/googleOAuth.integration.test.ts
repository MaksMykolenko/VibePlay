import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ApiEnv } from '@vibeplay/config';
import type { PrismaClient } from '@vibeplay/database';
import { buildApp } from '../app.js';
import type { GoogleIdentity, GoogleOAuthService } from '../lib/googleOAuth.js';
import { GOOGLE_OAUTH_RETURN_TO_COOKIE, GOOGLE_OAUTH_STATE_COOKIE } from './googleOAuth.js';
import { createUser, getTestPrisma, resetDb, testEnv } from '../test/helpers.js';

class FakeGoogleOAuth implements GoogleOAuthService {
  identity: GoogleIdentity = {
    sub: 'google-sub-123',
    email: 'oauth@example.com',
    emailVerified: true,
    name: 'OAuth User',
    picture: 'https://example.com/avatar.png',
  };
  lastState = '';
  authenticateCalls = 0;

  authorizationUrl(state: string): string {
    this.lastState = state;
    return `https://accounts.google.test/oauth?state=${encodeURIComponent(state)}`;
  }

  async authenticate(_code: string): Promise<GoogleIdentity> {
    this.authenticateCalls += 1;
    return this.identity;
  }
}

let app: FastifyInstance;
let prisma: PrismaClient;
let env: ApiEnv;
let google: FakeGoogleOAuth;

beforeAll(async () => {
  env = testEnv();
  prisma = getTestPrisma();
  google = new FakeGoogleOAuth();
  app = await buildApp({ env, prisma, googleOAuth: google });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb(prisma);
  google.identity = {
    sub: 'google-sub-123',
    email: 'oauth@example.com',
    emailVerified: true,
    name: 'OAuth User',
    picture: 'https://example.com/avatar.png',
  };
  google.lastState = '';
  google.authenticateCalls = 0;
});

async function beginOAuth(returnTo?: string) {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  const response = await app.inject({ method: 'GET', url: `/api/auth/google/start${query}` });
  const stateCookie = response.cookies.find((cookie) => cookie.name === GOOGLE_OAUTH_STATE_COOKIE);
  const returnToCookie = response.cookies.find(
    (cookie) => cookie.name === GOOGLE_OAUTH_RETURN_TO_COOKIE,
  );
  if (!stateCookie) throw new Error('OAuth start did not set its state cookie');
  return { response, state: stateCookie.value, returnTo: returnToCookie?.value };
}

async function finishOAuth(state: string, returnTo?: string) {
  return app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`,
    cookies: {
      [GOOGLE_OAUTH_STATE_COOKIE]: state,
      ...(returnTo ? { [GOOGLE_OAUTH_RETURN_TO_COOKIE]: returnTo } : {}),
    },
  });
}

describe('Google OAuth', () => {
  it('start creates secure state and redirects to Google', async () => {
    const { response, state } = await beginOAuth();

    expect(response.statusCode).toBe(302);
    expect(state).toHaveLength(43);
    expect(google.lastState).toBe(state);
    expect(response.headers.location).toBe(
      `https://accounts.google.test/oauth?state=${encodeURIComponent(state)}`,
    );
    const cookie = response.cookies.find((item) => item.name === GOOGLE_OAUTH_STATE_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    expect(cookie?.path).toBe('/api/auth/google');
  });

  it('callback rejects an invalid state before contacting Google', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=test-code&state=wrong-state',
      cookies: { [GOOGLE_OAUTH_STATE_COOKIE]: 'expected-state' },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('http://localhost:5173/login?oauth_error=invalid_state');
    expect(google.authenticateCalls).toBe(0);
  });

  it('callback rejects a Google identity with an unverified email', async () => {
    google.identity = { ...google.identity, emailVerified: false };
    const { state } = await beginOAuth();
    const response = await finishOAuth(state);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      'http://localhost:5173/login?oauth_error=unverified_email',
    );
    expect(await prisma.user.count()).toBe(0);
  });

  it('callback creates a verified user and provider identity', async () => {
    google.identity = { ...google.identity, email: 'NewOAuth@Example.com' };
    const { state } = await beginOAuth();
    const response = await finishOAuth(state);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('http://localhost:5173/');
    const user = await prisma.user.findUnique({
      where: { email: 'newoauth@example.com' },
      include: { oauthAccounts: true },
    });
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.oauthAccounts).toMatchObject([
      { provider: 'google', providerAccountId: 'google-sub-123' },
    ]);
  });

  it('returns to a safe internal path and rejects external return targets', async () => {
    const safeStart = await beginOAuth('/play/safe-game?from=signup');
    const safeResponse = await finishOAuth(safeStart.state, safeStart.returnTo);
    expect(safeResponse.headers.location).toBe('http://localhost:5173/play/safe-game?from=signup');

    await resetDb(prisma);
    const unsafeStart = await beginOAuth('//evil.example/steal');
    const unsafeResponse = await finishOAuth(unsafeStart.state, unsafeStart.returnTo);
    expect(unsafeResponse.headers.location).toBe('http://localhost:5173/');
  });

  it('callback safely links a verified Google email to an existing user', async () => {
    const existing = await createUser(prisma, env, {
      email: 'oauth@example.com',
      username: 'existing_user',
      verified: false,
    });
    const { state } = await beginOAuth();
    await finishOAuth(state);

    expect(await prisma.user.count({ where: { email: 'oauth@example.com' } })).toBe(1);
    const account = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: 'google-sub-123',
        },
      },
    });
    expect(account?.userId).toBe(existing.id);
    expect(
      (await prisma.user.findUnique({ where: { id: existing.id } }))?.emailVerifiedAt,
    ).toBeInstanceOf(Date);
  });

  it('callback creates a normal VibePlay session cookie', async () => {
    const { state } = await beginOAuth();
    const response = await finishOAuth(state);
    const sessionCookie = response.cookies.find((cookie) => cookie.name === 'vp_session');
    const csrfCookie = response.cookies.find((cookie) => cookie.name === 'vp_csrf');

    expect(sessionCookie?.httpOnly).toBe(true);
    expect(csrfCookie?.httpOnly).not.toBe(true);
    expect(await prisma.session.count()).toBe(1);

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { vp_session: sessionCookie!.value, vp_csrf: csrfCookie!.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('oauth@example.com');
  });
});
