import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ApiEnv } from '@vibeplay/config';
import type { PrismaClient, User } from '@vibeplay/database';
import { audit } from '../lib/audit.js';
import { sanitizeReturnTo } from '@vibeplay/shared';
import { generateToken, hashPassword, safeEqual, sha256 } from '../lib/crypto.js';
import { cookiesAreSecure, createSession, setSessionCookies } from '../lib/sessions.js';

export const GOOGLE_OAUTH_STATE_COOKIE = 'vp_google_oauth_state';
export const GOOGLE_OAUTH_RETURN_TO_COOKIE = 'vp_google_oauth_return_to';
const GOOGLE_PROVIDER = 'google';
const STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_COOKIE_PATH = '/api/auth/google';

type OAuthErrorCode =
  | 'invalid_state'
  | 'provider_error'
  | 'unverified_email'
  | 'account_suspended'
  | 'account_banned'
  | 'oauth_failed';

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

interface StartQuery {
  returnTo?: string;
}

function redirectToLogin(
  reply: FastifyReply,
  env: ApiEnv,
  error: OAuthErrorCode,
  returnTo = '/',
): FastifyReply {
  const url = new URL('/login', env.WEB_ORIGIN);
  url.searchParams.set('oauth_error', error);
  if (returnTo !== '/') url.searchParams.set('returnTo', returnTo);
  return reply.redirect(url.toString());
}

async function chooseUsername(prisma: PrismaClient, email: string, sub: string): Promise<string> {
  const localPart = email.split('@')[0] ?? 'user';
  const base =
    localPart
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'user';

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = sha256(`${sub}:${attempt}`).slice(0, 6);
    const candidate = `${base.slice(0, 13)}_${suffix}`;
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Could not allocate a username for Google account');
}

async function findOrCreateGoogleUser(
  prisma: PrismaClient,
  env: ApiEnv,
  identity: { sub: string; email: string; name?: string; picture?: string },
): Promise<User> {
  const email = identity.email.trim().toLowerCase();
  const connected = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: GOOGLE_PROVIDER,
        providerAccountId: identity.sub,
      },
    },
    include: { user: true },
  });
  if (connected) return connected.user;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status !== 'ACTIVE') return existing;

    return prisma.$transaction(async (tx) => {
      const racedConnection = await tx.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: GOOGLE_PROVIDER,
            providerAccountId: identity.sub,
          },
        },
        include: { user: true },
      });
      if (racedConnection) return racedConnection.user;

      const current = await tx.user.findUnique({ where: { email } });
      if (!current) throw new Error('Email-matched account disappeared during Google login');
      if (current.status !== 'ACTIVE') return current;

      await tx.oAuthAccount.create({
        data: {
          provider: GOOGLE_PROVIDER,
          providerAccountId: identity.sub,
          userId: current.id,
        },
      });
      return tx.user.update({
        where: { id: current.id },
        data: { emailVerifiedAt: current.emailVerifiedAt ?? new Date() },
      });
    });
  }

  const username = await chooseUsername(prisma, email, identity.sub);
  const passwordHash = await hashPassword(generateToken(), env.PASSWORD_PEPPER);

  return prisma.$transaction(async (tx) => {
    const racedConnection = await tx.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: GOOGLE_PROVIDER,
          providerAccountId: identity.sub,
        },
      },
      include: { user: true },
    });
    if (racedConnection) return racedConnection.user;

    const racedUser = await tx.user.findUnique({ where: { email } });
    if (racedUser) {
      if (racedUser.status !== 'ACTIVE') return racedUser;
      await tx.oAuthAccount.create({
        data: {
          provider: GOOGLE_PROVIDER,
          providerAccountId: identity.sub,
          userId: racedUser.id,
        },
      });
      return tx.user.update({
        where: { id: racedUser.id },
        data: { emailVerifiedAt: racedUser.emailVerifiedAt ?? new Date() },
      });
    }

    return tx.user.create({
      data: {
        email,
        username,
        displayName: (identity.name?.trim() || email.split('@')[0] || username).slice(0, 50),
        passwordHash,
        avatarUrl: identity.picture ?? null,
        emailVerifiedAt: new Date(),
        oauthAccounts: {
          create: {
            provider: GOOGLE_PROVIDER,
            providerAccountId: identity.sub,
          },
        },
      },
    });
  });
}

export async function registerGoogleOAuthRoutes(app: FastifyInstance): Promise<void> {
  const { env, prisma, googleOAuth } = app;

  app.get<{ Querystring: StartQuery }>('/google/start', async (req, reply) => {
    const state = generateToken();
    const returnTo = sanitizeReturnTo(req.query.returnTo);
    reply.setCookie(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: cookiesAreSecure(env),
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
      expires: new Date(Date.now() + STATE_TTL_MS),
    });
    reply.setCookie(GOOGLE_OAUTH_RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      secure: cookiesAreSecure(env),
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
      expires: new Date(Date.now() + STATE_TTL_MS),
    });
    return reply.redirect(googleOAuth.authorizationUrl(state));
  });

  app.get<{ Querystring: CallbackQuery }>('/google/callback', async (req, reply) => {
    const cookieState = req.cookies[GOOGLE_OAUTH_STATE_COOKIE];
    const returnTo = sanitizeReturnTo(req.cookies[GOOGLE_OAUTH_RETURN_TO_COOKIE]);
    reply.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, {
      httpOnly: true,
      secure: cookiesAreSecure(env),
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
    });
    reply.clearCookie(GOOGLE_OAUTH_RETURN_TO_COOKIE, {
      httpOnly: true,
      secure: cookiesAreSecure(env),
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
    });

    if (!cookieState || !req.query.state || !safeEqual(cookieState, req.query.state)) {
      return redirectToLogin(reply, env, 'invalid_state', returnTo);
    }
    if (req.query.error || !req.query.code) {
      return redirectToLogin(reply, env, 'provider_error', returnTo);
    }

    try {
      const identity = await googleOAuth.authenticate(req.query.code);
      if (!identity.emailVerified) return redirectToLogin(reply, env, 'unverified_email', returnTo);

      const user = await findOrCreateGoogleUser(prisma, env, identity);
      if (user.status === 'SUSPENDED')
        return redirectToLogin(reply, env, 'account_suspended', returnTo);
      if (user.status === 'BANNED') return redirectToLogin(reply, env, 'account_banned', returnTo);
      if (user.status === 'DELETED') return redirectToLogin(reply, env, 'oauth_failed', returnTo);

      const { token, csrfToken, session } = await createSession(prisma, env, user, req);
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await audit(prisma, {
        actorId: user.id,
        action: 'auth.google_login',
        targetType: 'USER',
        targetId: user.id,
        req,
        secret: env.SESSION_SECRET,
      });
      setSessionCookies(reply, env, token, csrfToken, session.expiresAt);
      return reply.redirect(new URL(returnTo, env.WEB_ORIGIN).toString());
    } catch (err) {
      req.log.error({ err }, 'Google OAuth callback failed');
      return redirectToLogin(reply, env, 'oauth_failed', returnTo);
    }
  });
}
