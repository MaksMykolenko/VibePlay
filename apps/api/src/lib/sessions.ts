import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiEnv } from '@vibeplay/config';
import type { PrismaClient, Session, User } from '@vibeplay/database';
import { generateToken, hashIp, hashToken } from './crypto.js';

export const SESSION_COOKIE = 'vp_session';
export const CSRF_COOKIE = 'vp_csrf';

export function cookiesAreSecure(env: ApiEnv): boolean {
  return env.API_ORIGIN.startsWith('https://') || env.NODE_ENV === 'production';
}

export interface CreatedSession {
  session: Session;
  token: string;
  csrfToken: string;
}

export async function createSession(
  prisma: PrismaClient,
  env: ApiEnv,
  user: User,
  req: FastifyRequest,
): Promise<CreatedSession> {
  const token = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token, env.SESSION_SECRET),
      csrfHash: hashToken(csrfToken, env.SESSION_SECRET),
      ipHash: hashIp(req.ip, env.SESSION_SECRET),
      userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
      expiresAt,
    },
  });

  return { session, token, csrfToken };
}

export function setSessionCookies(
  reply: FastifyReply,
  env: ApiEnv,
  token: string,
  csrfToken: string,
  expiresAt: Date,
): void {
  const secure = cookiesAreSecure(env);
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  // Double-submit CSRF cookie: readable by JS, sent back via x-csrf-token header.
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookies(reply: FastifyReply, env: ApiEnv): void {
  const secure = cookiesAreSecure(env);
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure, sameSite: 'lax' });
  reply.clearCookie(CSRF_COOKIE, { path: '/', secure, sameSite: 'lax' });
}

/** Resolve the current session+user from the session cookie (no throw). */
export async function resolveSession(
  prisma: PrismaClient,
  env: ApiEnv,
  req: FastifyRequest,
): Promise<{ session: Session; user: User } | null> {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(raw, env.SESSION_SECRET) },
    include: { user: { include: { subscription: true } } },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.status === 'DELETED') return null;

  const { user, ...rest } = session;
  return { session: rest as Session, user };
}

export async function revokeSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(prisma: PrismaClient, userId: string): Promise<number> {
  const res = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}
