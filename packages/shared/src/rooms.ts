import { z } from 'zod';
import {
  GAME_ROOM_PLAYER_STATUSES,
  GAME_ROOM_STATUSES,
  GAME_ROOM_VISIBILITIES,
  MULTIPLAYER_TRANSPORTS,
  type GameRoomStatus,
  type GameRoomVisibility,
  type MultiplayerTransport,
} from './enums.js';

/**
 * Shared multiplayer-room contracts (spec Phases 2-5): room-code rules, request
 * schemas, public DTOs, the SDK room context, and game multiplayer-metadata
 * validation. Pure and browser-safe — used by the API, the web app, and the SDK.
 */

// --- Room codes -------------------------------------------------------------

/** Unambiguous alphabet (no I/O/0/1/L) for human-typable, read-aloud codes. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_MIN_LENGTH = 4;
export const ROOM_CODE_MAX_LENGTH = 6;

const ROOM_CODE_CHARSET = new Set(ROOM_CODE_ALPHABET.split(''));

/** Uppercase + strip spacing/dashes so "abc-123" and "ABC123" are the same code. */
export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidRoomCode(value: string): boolean {
  const code = normalizeRoomCode(value);
  if (code.length < ROOM_CODE_MIN_LENGTH || code.length > ROOM_CODE_MAX_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_CHARSET.has(ch)) return false;
  return true;
}

// Web Crypto + URL are globals in Node 22 and browsers, but the shared package
// compiles with a minimal (no-DOM/Node) lib, so reference them via globalThis.
const webCrypto = (
  globalThis as unknown as {
    crypto: { getRandomValues<T extends Uint8Array>(array: T): T };
  }
).crypto;

/**
 * Generate a fresh room code using a CSPRNG (Web Crypto — available in Node 22 and
 * browsers). Uniqueness against existing rooms is enforced at the DB layer with a
 * retry; this just provides high-entropy candidates.
 */
export function generateRoomCode(length: number = ROOM_CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  webCrypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ROOM_CODE_ALPHABET.charAt((bytes[i] ?? 0) % ROOM_CODE_ALPHABET.length);
  }
  return out;
}

/** Route-param schema: accepts any casing/spacing, normalizes, validates. */
export const roomCodeParamSchema = z
  .string()
  .transform(normalizeRoomCode)
  .refine(isValidRoomCode, { message: 'Invalid room code' });

// --- Player display names ---------------------------------------------------

export const ROOM_DISPLAY_NAME_MAX = 40;

/** Trim + bound a player-chosen display name; returns undefined when empty. */
export function sanitizeRoomDisplayName(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Drop control characters (newlines, zero-width, DEL) without a control-char
  // regex, then collapse whitespace, trim, and bound — keeps lobby lists clean.
  let stripped = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    stripped += ch;
  }
  const cleaned = stripped.replace(/\s+/g, ' ').trim().slice(0, ROOM_DISPLAY_NAME_MAX);
  return cleaned.length > 0 ? cleaned : undefined;
}

// --- Room sizing / lifetime -------------------------------------------------

export const ROOM_DEFAULT_MAX_PLAYERS = 8;
/** Hard safety cap regardless of what a client requests. */
export const ROOM_MAX_PLAYERS_CAP = 16;
export const ROOM_MIN_MAX_PLAYERS = 2;
export const ROOM_DEFAULT_TTL_MINUTES = 120;

// --- Request schemas --------------------------------------------------------

export const createRoomSchema = z.object({
  maxPlayers: z.coerce
    .number()
    .int()
    .min(ROOM_MIN_MAX_PLAYERS)
    .max(ROOM_MAX_PLAYERS_CAP)
    .optional(),
  visibility: z.enum(GAME_ROOM_VISIBILITIES).optional(),
  mode: z.string().trim().min(1).max(40).optional(),
  /** Guest-chosen display name (logged-in users use their account name). */
  displayName: z.string().trim().min(1).max(ROOM_DISPLAY_NAME_MAX).optional(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(ROOM_DISPLAY_NAME_MAX).optional(),
});
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

// --- Game multiplayer metadata (Phase 5) ------------------------------------

export const MULTIPLAYER_MODES_MAX = 12;
export const MULTIPLAYER_MODE_MAX_LENGTH = 40;

/** Shape validation for creator/admin multiplayer settings (no env awareness). */
export const multiplayerSettingsSchema = z.object({
  multiplayerEnabled: z.boolean(),
  multiplayerMaxPlayers: z.coerce
    .number()
    .int()
    .min(ROOM_MIN_MAX_PLAYERS)
    .max(ROOM_MAX_PLAYERS_CAP),
  multiplayerTransport: z.enum(MULTIPLAYER_TRANSPORTS),
  multiplayerWsUrl: z.string().trim().max(2000).nullish(),
  multiplayerModes: z
    .array(z.string().trim().min(1).max(MULTIPLAYER_MODE_MAX_LENGTH))
    .max(MULTIPLAYER_MODES_MAX)
    .optional(),
});
export type MultiplayerSettingsInput = z.infer<typeof multiplayerSettingsSchema>;

export type WsUrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Validate an external realtime-server URL (spec Phase 5 security).
 * - must be a ws:// or wss:// URL with a host and no embedded credentials;
 * - in production it MUST be wss:// and MUST NOT target localhost / loopback /
 *   private address ranges (production origins must be restricted).
 */
export function validateMultiplayerWsUrl(
  raw: string,
  opts: { production: boolean },
): WsUrlValidationResult {
  const UrlCtor = (
    globalThis as unknown as {
      URL: new (input: string) => {
        protocol: string;
        username: string;
        password: string;
        hostname: string;
        toString(): string;
      };
    }
  ).URL;
  let url: { protocol: string; username: string; password: string; hostname: string; toString(): string };
  try {
    url = new UrlCtor(raw.trim());
  } catch {
    return { ok: false, reason: 'Must be a valid URL' };
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    return { ok: false, reason: 'Must be a ws:// or wss:// URL' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'URL must not contain credentials' };
  }
  if (!url.hostname) return { ok: false, reason: 'URL must include a host' };

  if (opts.production) {
    if (url.protocol !== 'wss:') {
      return { ok: false, reason: 'Production multiplayer servers must use wss://' };
    }
    if (isPrivateHostname(url.hostname)) {
      return { ok: false, reason: 'Production URL must not point at a private/local address' };
    }
  }
  return { ok: true, url: url.toString() };
}

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  // IPv4 private ranges: 10/8, 192.168/16, 172.16-31/12, link-local 169.254/16.
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

// --- DTOs -------------------------------------------------------------------

export interface RoomPlayerDto {
  /** GameRoomPlayer id — room-scoped, safe to expose (no user/guest id leak). */
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  isHost: boolean;
  /** True for the requesting viewer's own membership row. */
  isYou: boolean;
  /** Identity kind, without exposing the underlying user/guest id. */
  kind: 'user' | 'guest';
}

export interface RoomGameDto {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
}

export interface RoomDto {
  roomId: string;
  roomCode: string;
  status: GameRoomStatus;
  visibility: GameRoomVisibility;
  mode: string;
  maxPlayers: number;
  playerCount: number;
  game: RoomGameDto;
  host: { playerId: string; displayName: string; avatarUrl: string | null } | null;
  players: RoomPlayerDto[];
  /** Whether the viewing identity could join right now (status/capacity/expiry). */
  canJoin: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface CreateRoomResponseDto {
  roomId: string;
  roomCode: string;
  inviteUrl: string;
  playerId: string;
  isHost: boolean;
  room: RoomDto;
}

export interface JoinRoomResponseDto {
  playerId: string;
  isHost: boolean;
  room: RoomDto;
}

export interface StartRoomResponseDto {
  status: GameRoomStatus;
  playUrl: string;
  room: RoomDto;
}

export interface LeaveRoomResponseDto {
  ok: true;
  /** New host's playerId when host transferred, else null. */
  hostTransferredTo: string | null;
  roomStatus: GameRoomStatus;
}

export interface RoomTokenResponseDto {
  token: string;
  /** Token expiry (ISO) — short-lived; mint a fresh one as needed. */
  expiresAt: string;
  wsUrl: string | null;
  transport: string;
}

/**
 * The context the parent Play Page assembles and hands to the game iframe over
 * the SDK bridge. Contains NO auth cookies/secrets — only the signed room token.
 */
export interface RoomContextDto {
  roomId: string;
  roomCode: string;
  gameId: string;
  versionId: string | null;
  playerId: string;
  playerName: string;
  playerAvatarUrl: string | null;
  isHost: boolean;
  maxPlayers: number;
  mode: string;
  transport: string;
  wsUrl: string | null;
  token: string;
  expiresAt: string;
}

export interface GameMultiplayerDto {
  enabled: boolean;
  maxPlayers: number;
  transport: MultiplayerTransport;
  /** Only surfaced to the creator/admin; null otherwise (never leak to players). */
  wsUrl: string | null;
  modes: string[];
}

// Re-export status arrays callers commonly need alongside the schemas.
export { GAME_ROOM_STATUSES, GAME_ROOM_PLAYER_STATUSES };
