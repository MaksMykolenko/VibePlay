import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import type { ApiEnv } from '@vibeplay/config';
import type { Mailer } from '../lib/mailer.js';
import { createMailer } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/crypto.js';
import {
  TEST_PASSWORD,
  authed,
  buildTestApp,
  captureCookies,
  createUser,
  loginAs,
  resetDb,
  testEnv,
} from '../test/helpers.js';
import { buildApp } from '../app.js';

let app: FastifyInstance;
let prisma: PrismaClient;
let env: ApiEnv;
let mailer: Mailer;

beforeAll(async () => {
  env = testEnv();
  mailer = createMailer({ ...env, EMAIL_DRIVER: 'memory' });
  const ctx = await buildTestApp();
  prisma = ctx.prisma;
  app = await buildApp({ env, prisma, mailer });
  await app.ready();
  await ctx.app.close();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb(prisma);
  mailer.outbox.length = 0;
});

describe('registration', () => {
  it('registers a user, stores an argon2id hash and auto-logs-in via HttpOnly cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'NewUser@Example.com',
        username: 'new_user',
        displayName: 'New User',
        password: 'a-long-secure-pass-1',
        acceptTerms: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe('newuser@example.com'); // normalized
    expect(body.user.emailVerified).toBe(false);

    const dbUser = await prisma.user.findUnique({ where: { email: 'newuser@example.com' } });
    expect(dbUser?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(dbUser?.role).toBe('PLAYER');

    const sessionCookie = res.cookies.find((c) => c.name === 'vp_session');
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite?.toLowerCase()).toBe('lax');

    // verification email sent
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]!.to).toBe('newuser@example.com');
    expect(mailer.outbox[0]!.text).toContain('/verify-email?token=');
  });

  it('rejects duplicate email and username with stable codes', async () => {
    await createUser(prisma, env, { email: 'dup@example.com', username: 'dup_user' });
    const emailDup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'dup@example.com',
        username: 'other_user',
        displayName: 'X',
        password: 'a-long-secure-pass-1',
        acceptTerms: true,
      },
    });
    expect(emailDup.statusCode).toBe(409);
    expect(emailDup.json().error.code).toBe('EMAIL_TAKEN');

    const nameDup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'fresh@example.com',
        username: 'dup_user',
        displayName: 'X',
        password: 'a-long-secure-pass-1',
        acceptTerms: true,
      },
    });
    expect(nameDup.statusCode).toBe(409);
    expect(nameDup.json().error.code).toBe('USERNAME_TAKEN');
  });

  it('cannot set role through the register payload (mass assignment blocked)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'sneaky@example.com',
        username: 'sneaky',
        displayName: 'Sneaky',
        password: 'a-long-secure-pass-1',
        acceptTerms: true,
        role: 'ADMIN',
      },
    });
    // strict schema → validation error, role never reaches the model
    expect(res.statusCode).toBe(422);
  });
});

describe('auth config', () => {
  it('GET /api/auth/config reports open registration (inviteOnly=false)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ inviteOnly: false });
  });

  it('reports invite-only registration when INVITE_ONLY=true', async () => {
    const inviteApp = await buildApp({ env: testEnv({ INVITE_ONLY: 'true' }), prisma });
    await inviteApp.ready();
    try {
      const res = await inviteApp.inject({ method: 'GET', url: '/api/auth/config' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ inviteOnly: true });
    } finally {
      await inviteApp.close();
    }
  });
});

describe('invite-only mode', () => {
  it('requires a valid invite and binds bound-email invites', async () => {
    const inviteApp = await buildApp({ env: testEnv({ INVITE_ONLY: 'true' }), prisma });
    await inviteApp.ready();
    try {
      const noInvite = await inviteApp.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'a@example.com',
          username: 'invitee_a',
          displayName: 'A',
          password: 'a-long-secure-pass-1',
          acceptTerms: true,
        },
      });
      expect(noInvite.statusCode).toBe(403);
      expect(noInvite.json().error.code).toBe('INVITE_REQUIRED');

      const code = generateToken();
      await prisma.invite.create({
        data: {
          codeHash: hashToken(code, env.SESSION_SECRET),
          role: 'CREATOR',
          expiresAt: new Date(Date.now() + 86400_000),
        },
      });

      const ok = await inviteApp.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'a@example.com',
          username: 'invitee_a',
          displayName: 'A',
          password: 'a-long-secure-pass-1',
          acceptTerms: true,
          inviteCode: code,
        },
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json().user.role).toBe('CREATOR'); // role comes from the invite

      // single use
      const reuse = await inviteApp.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'b@example.com',
          username: 'invitee_b',
          displayName: 'B',
          password: 'a-long-secure-pass-1',
          acceptTerms: true,
          inviteCode: code,
        },
      });
      expect(reuse.statusCode).toBe(403);
      expect(reuse.json().error.code).toBe('INVITE_INVALID');
    } finally {
      await inviteApp.close();
    }
  });
});

describe('login & sessions', () => {
  it('logs in with the correct password and rejects a wrong one', async () => {
    await createUser(prisma, env, { email: 'u@example.com', username: 'login_user' });

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'u@example.com', password: 'definitely-wrong-password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');

    const right = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'u@example.com', password: TEST_PASSWORD },
    });
    expect(right.statusCode).toBe(200);

    const agent = captureCookies(right);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: agent.cookies });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe('login_user');
  });

  it('stores only a token hash in the database', async () => {
    await createUser(prisma, env, { email: 'h@example.com', username: 'hash_user' });
    const agent = await loginAs(app, 'h@example.com');
    const raw = agent.cookies['vp_session']!;
    const session = await prisma.session.findFirst({ where: { user: { email: 'h@example.com' } } });
    expect(session?.tokenHash).not.toBe(raw);
    expect(session?.tokenHash).toBe(hashToken(raw, env.SESSION_SECRET));
  });

  it('suspended users cannot log in; banned users cannot log in', async () => {
    await createUser(prisma, env, {
      email: 's@example.com',
      username: 'susp_user',
      status: 'SUSPENDED',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 's@example.com', password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ACCOUNT_SUSPENDED');

    await createUser(prisma, env, {
      email: 'b@example.com',
      username: 'ban_user',
      status: 'BANNED',
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'b@example.com', password: TEST_PASSWORD },
    });
    expect(res2.statusCode).toBe(403);
    expect(res2.json().error.code).toBe('ACCOUNT_BANNED');
  });

  it('suspending a user blocks their existing session for protected mutations', async () => {
    const user = await createUser(prisma, env, {
      email: 'live@example.com',
      username: 'live_user',
    });
    const agent = await loginAs(app, 'live@example.com');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      ...authed(agent),
      payload: { bio: 'should fail' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('logout revokes the session; logout-all revokes every session', async () => {
    await createUser(prisma, env, { email: 'lo@example.com', username: 'lo_user' });
    const a1 = await loginAs(app, 'lo@example.com');
    const a2 = await loginAs(app, 'lo@example.com');

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', ...authed(a1) });
    expect(out.statusCode).toBe(200);
    const meAfter = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: a1.cookies });
    expect(meAfter.statusCode).toBe(401);

    // second session still alive, then logout-all kills it
    const me2 = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: a2.cookies });
    expect(me2.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/api/auth/logout-all', ...authed(a2) });
    const me3 = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: a2.cookies });
    expect(me3.statusCode).toBe(401);
  });

  it('expired sessions are rejected', async () => {
    const user = await createUser(prisma, env, { email: 'ex@example.com', username: 'ex_user' });
    const agent = await loginAs(app, 'ex@example.com');
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: agent.cookies });
    expect(me.statusCode).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('rejects authenticated mutations without the CSRF header', async () => {
    await createUser(prisma, env, { email: 'c@example.com', username: 'csrf_user' });
    const agent = await loginAs(app, 'c@example.com');

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      cookies: agent.cookies, // no x-csrf-token header
      payload: { bio: 'x' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');

    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      ...authed(agent),
      payload: { bio: 'x' },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe('email verification', () => {
  it('verifies via the emailed one-time token', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'v@example.com',
        username: 'verify_user',
        displayName: 'V',
        password: 'a-long-secure-pass-1',
        acceptTerms: true,
      },
    });
    const mail = mailer.outbox[0]!;
    const token = new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token },
    });
    expect(res.statusCode).toBe(200);

    const user = await prisma.user.findUnique({ where: { email: 'v@example.com' } });
    expect(user?.emailVerifiedAt).not.toBeNull();

    // one-time use
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token },
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('TOKEN_INVALID');
  });
});

describe('password reset', () => {
  it('full forgot → reset flow revokes sessions and changes the password', async () => {
    await createUser(prisma, env, { email: 'r@example.com', username: 'reset_user' });
    const agent = await loginAs(app, 'r@example.com');

    const forgot = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'r@example.com' },
    });
    expect(forgot.statusCode).toBe(200);

    // generic response also for unknown email
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'nobody@example.com' },
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toEqual(forgot.json());

    const mail = mailer.outbox.find((m) => m.to === 'r@example.com')!;
    const token = new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'brand-new-password-2' },
    });
    expect(reset.statusCode).toBe(200);

    // old session revoked
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: agent.cookies });
    expect(me.statusCode).toBe(401);

    // old password dead, new password works
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'r@example.com', password: TEST_PASSWORD },
    });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'r@example.com', password: 'brand-new-password-2' },
    });
    expect(newLogin.statusCode).toBe(200);

    // token single-use
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'another-new-password-3' },
    });
    expect(reuse.statusCode).toBe(400);
  });
});

describe('profiles', () => {
  it('serves public profiles and 404s unknown/suspended ones', async () => {
    await createUser(prisma, env, { email: 'p@example.com', username: 'profile_user' });
    const ok = await app.inject({ method: 'GET', url: '/api/profiles/profile_user' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().profile.username).toBe('profile_user');

    const missing = await app.inject({ method: 'GET', url: '/api/profiles/nobody_here' });
    expect(missing.statusCode).toBe(404);

    await prisma.user.update({
      where: { username: 'profile_user' },
      data: { status: 'SUSPENDED' },
    });
    const susp = await app.inject({ method: 'GET', url: '/api/profiles/profile_user' });
    expect(susp.statusCode).toBe(404);
  });

  it('profile update rejects role escalation attempts', async () => {
    await createUser(prisma, env, { email: 'pr@example.com', username: 'patch_user' });
    const agent = await loginAs(app, 'pr@example.com');

    const evil = await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      ...authed(agent),
      payload: { role: 'ADMIN' },
    });
    expect(evil.statusCode).toBe(422);

    const user = await prisma.user.findUnique({ where: { email: 'pr@example.com' } });
    expect(user?.role).toBe('PLAYER');
  });
});
