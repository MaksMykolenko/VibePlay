import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

/** Opaque high-entropy token (256 bits, base64url). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Short human-typable invite code. */
export function generateInviteCode(): string {
  return randomBytes(12).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Hash used for storing session/verification/reset tokens — never store the raw token. */
export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function hashIp(ip: string | undefined, secret: string): string | null {
  if (!ip) return null;
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}

const ARGON_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB (OWASP minimum recommendation for argon2id)
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string, pepper: string): Promise<string> {
  return argon2.hash(password + pepper, ARGON_OPTS);
}

export async function verifyPassword(
  hash: string,
  password: string,
  pepper: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password + pepper);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison for CSRF tokens etc.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** HMAC-signed short-lived value, e.g. admin preview access for the game host. */
export function signExpiringValue(value: string, expiresAtMs: number, secret: string): string {
  const payload = `${value}.${expiresAtMs}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${expiresAtMs}.${sig}`;
}

export function verifyExpiringValue(
  value: string,
  token: string,
  secret: string,
  now = Date.now(),
): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiresAtMs = Number(expStr);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < now) return false;
  const expected = createHmac('sha256', secret)
    .update(`${value}.${expiresAtMs}`)
    .digest('base64url');
  return safeEqual(sig, expected);
}
