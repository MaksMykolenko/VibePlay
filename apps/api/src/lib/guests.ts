import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiEnv } from '@vibeplay/config';
import type { Guest, PrismaClient } from '@vibeplay/database';
import { generateToken, hashToken } from './crypto.js';
import { cookiesAreSecure } from './sessions.js';

/**
 * Anonymous guest identity (spec Phase 2). Lets a not-logged-in player create,
 * host, and rejoin multiplayer rooms without an account.
 *
 * Mirrors the Session model's security posture:
 * - the cookie carries a high-entropy opaque token; only its HMAC hash is stored,
 *   so a database read never reveals a usable credential;
 * - httpOnly + sameSite=lax + secure-in-prod, so JS can't read it and it is not
 *   sent on cross-site POSTs (no ambient authority for CSRF);
 * - scoped narrowly: a guest can only ever act as a room player/host, never as a
 *   VibePlay user. Logged-in users never receive a guest identity.
 */

export const GUEST_COOKIE = 'vp_guest';
const GUEST_COOKIE_TTL_DAYS = 30;
const GUEST_DISPLAY_NAME_MAX = 40;

function guestCookieExpiry(nowMs = Date.now()): Date {
  return new Date(nowMs + GUEST_COOKIE_TTL_DAYS * 24 * 3600 * 1000);
}

function setGuestCookie(reply: FastifyReply, env: ApiEnv, token: string): void {
  reply.setCookie(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: cookiesAreSecure(env),
    sameSite: 'lax',
    path: '/',
    expires: guestCookieExpiry(),
  });
}

function cleanGuestName(name: string | undefined): string | undefined {
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim().slice(0, GUEST_DISPLAY_NAME_MAX);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Resolve the current guest from the cookie (no creation, no throw). */
export async function resolveGuest(
  prisma: PrismaClient,
  env: ApiEnv,
  req: FastifyRequest,
): Promise<Guest | null> {
  const raw = req.cookies[GUEST_COOKIE];
  if (!raw) return null;
  return prisma.guest.findUnique({ where: { tokenHash: hashToken(raw, env.SESSION_SECRET) } });
}

/**
 * Return the current guest, creating one (and setting the cookie) if absent.
 * Use ONLY for unauthenticated callers — never mix with a logged-in user.
 * Optionally records the display name the guest most recently chose.
 */
export async function getOrCreateGuest(
  prisma: PrismaClient,
  env: ApiEnv,
  req: FastifyRequest,
  reply: FastifyReply,
  displayName?: string,
): Promise<Guest> {
  const existing = await resolveGuest(prisma, env, req);
  const cleanName = cleanGuestName(displayName);
  if (existing) {
    // Refresh the rolling cookie + last-seen; keep the latest chosen name.
    setGuestCookie(reply, env, req.cookies[GUEST_COOKIE]!);
    return prisma.guest.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date(), ...(cleanName ? { displayName: cleanName } : {}) },
    });
  }
  const token = generateToken();
  const guest = await prisma.guest.create({
    data: { tokenHash: hashToken(token, env.SESSION_SECRET), displayName: cleanName ?? null },
  });
  setGuestCookie(reply, env, token);
  return guest;
}
