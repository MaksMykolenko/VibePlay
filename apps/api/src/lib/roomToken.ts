import { createHmac } from 'node:crypto';
import { safeEqual } from './crypto.js';

/**
 * Short-lived, signed multiplayer room token (spec Phase 2 / Phase 7).
 *
 * The parent VibePlay Play Page mints this and hands it to the game iframe via the
 * SDK room context. The game forwards it to its external realtime server (e.g. the
 * Boxy Tanks WebSocket server), which verifies it with the SAME secret
 * (MULTIPLAYER_ROOM_TOKEN_SECRET ⇄ VIBEPLAY_ROOM_TOKEN_SECRET).
 *
 * Format: a compact JWS (`base64url(header).base64url(payload).base64url(sig)`,
 * HS256) so any standard JWT library on the game-server side can verify it. The
 * token is the ONLY trust the game server needs — it never calls VibePlay auth.
 *
 * Security:
 * - never log the token value (the API logger redacts `*.token`);
 * - keep TTL short (minutes) — it only needs to survive the WS handshake;
 * - the game CANNOT choose its own identity/host/score: those are claims, signed.
 */

export interface RoomTokenClaims {
  /** VibePlay room id. */
  roomId: string;
  /** Short human-typable join code; doubles as the realtime server's room key. */
  roomCode: string;
  gameId: string;
  /** Published version id, or null when the room is not version-pinned. */
  versionId: string | null;
  /** GameRoomPlayer id — the player's identity within THIS room. */
  playerId: string;
  /** Set for logged-in players (mutually exclusive with guestId). */
  userId: string | null;
  /** Set for guest players (mutually exclusive with userId). */
  guestId: string | null;
  /** Public display name (never an email or private field). */
  displayName: string;
  /** True for the room host. */
  isHost: boolean;
  /** Realtime transport hint, mirrors the room (e.g. "external_ws"). */
  transport: string;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
}

/** Input claims (everything except the timestamps, which signRoomToken derives). */
export type RoomTokenInput = Omit<RoomTokenClaims, 'iat' | 'exp'>;

export type RoomTokenFailure = 'malformed' | 'bad_signature' | 'expired' | 'invalid_claims';

export type RoomTokenVerifyResult =
  | { ok: true; claims: RoomTokenClaims }
  | { ok: false; reason: RoomTokenFailure };

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;
const HEADER_B64 = base64urlJson(HEADER);

/** Default token lifetime — long enough to open a socket, short enough to be safe. */
export const ROOM_TOKEN_TTL_SECONDS = 120;

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function hmac(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

/** Sign a room token. `nowMs` is injectable for deterministic tests. */
export function signRoomToken(
  input: RoomTokenInput,
  secret: string,
  ttlSeconds: number = ROOM_TOKEN_TTL_SECONDS,
  nowMs: number = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const claims: RoomTokenClaims = { ...input, iat, exp: iat + ttlSeconds };
  const payloadB64 = base64urlJson(claims);
  const signingInput = `${HEADER_B64}.${payloadB64}`;
  return `${signingInput}.${hmac(signingInput, secret)}`;
}

function isRoomTokenClaims(value: unknown): value is RoomTokenClaims {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string' && v.length > 0;
  const strOrNull = (v: unknown) => v === null || typeof v === 'string';
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return (
    str(c.roomId) &&
    str(c.roomCode) &&
    str(c.gameId) &&
    strOrNull(c.versionId) &&
    str(c.playerId) &&
    strOrNull(c.userId) &&
    strOrNull(c.guestId) &&
    typeof c.displayName === 'string' &&
    typeof c.isHost === 'boolean' &&
    typeof c.transport === 'string' &&
    num(c.iat) &&
    num(c.exp)
  );
}

/**
 * Verify a room token's signature, structure, and expiry. Optionally pin the
 * expected game id (a game server should reject tokens minted for OTHER games).
 * `clockSkewSeconds` tolerates minor clock drift between VibePlay and the server.
 */
export function verifyRoomToken(
  token: string,
  secret: string,
  opts: { expectedGameId?: string; nowMs?: number; clockSkewSeconds?: number } = {},
): RoomTokenVerifyResult {
  const nowMs = opts.nowMs ?? Date.now();
  const skew = opts.clockSkewSeconds ?? 5;
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerB64, payloadB64, sigB64] = parts;
  if (headerB64 === undefined || payloadB64 === undefined || sigB64 === undefined) {
    return { ok: false, reason: 'malformed' };
  }
  if (headerB64 !== HEADER_B64) return { ok: false, reason: 'malformed' };

  const expectedSig = hmac(`${headerB64}.${payloadB64}`, secret);
  // Constant-time compare; safeEqual returns false on length mismatch.
  if (!safeEqual(sigB64, expectedSig)) return { ok: false, reason: 'bad_signature' };

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!isRoomTokenClaims(claims)) return { ok: false, reason: 'invalid_claims' };

  const nowSec = Math.floor(nowMs / 1000);
  if (claims.exp + skew < nowSec) return { ok: false, reason: 'expired' };
  if (opts.expectedGameId && claims.gameId !== opts.expectedGameId) {
    return { ok: false, reason: 'invalid_claims' };
  }
  return { ok: true, claims };
}
