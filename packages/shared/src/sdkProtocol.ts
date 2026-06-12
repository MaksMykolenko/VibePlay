/**
 * VibePlay ↔ game postMessage protocol (spec §28).
 *
 * Only these message types exist. Every message carries a protocol version and
 * is validated on both sides; unknown/invalid messages are dropped silently.
 * The game NEVER receives private data (no email, no tokens, no raw user object).
 */

export const SDK_PROTOCOL_VERSION = 1;

export type GameToHostType =
  | 'ready'
  | 'requestPlayerSummary'
  | 'playStarted'
  | 'playEnded'
  | 'requestFullscreen'
  | 'reportError';

export type HostToGameType = 'init' | 'playerSummary' | 'fullscreenResult';

export interface SdkEnvelope<TType extends string = string, TPayload = unknown> {
  vibeplay: true;
  v: number;
  type: TType;
  requestId?: string;
  payload?: TPayload;
}

export interface PlayerSummaryPayload {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ReportErrorPayload {
  message: string;
  stack?: string;
}

const MAX_STRING = 5000;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isShortString(v: unknown, max = MAX_STRING): v is string {
  return typeof v === 'string' && v.length <= max;
}

const GAME_TO_HOST_TYPES: ReadonlySet<string> = new Set([
  'ready',
  'requestPlayerSummary',
  'playStarted',
  'playEnded',
  'requestFullscreen',
  'reportError',
]);

const HOST_TO_GAME_TYPES: ReadonlySet<string> = new Set([
  'init',
  'playerSummary',
  'fullscreenResult',
]);

/** Validate a raw postMessage payload coming FROM a game iframe. */
export function parseGameMessage(data: unknown): SdkEnvelope<GameToHostType> | null {
  if (!isPlainObject(data)) return null;
  if (data.vibeplay !== true) return null;
  if (data.v !== SDK_PROTOCOL_VERSION) return null;
  if (!isShortString(data.type, 64) || !GAME_TO_HOST_TYPES.has(data.type)) return null;
  if (data.requestId !== undefined && !isShortString(data.requestId, 64)) return null;
  if (data.type === 'reportError') {
    const p = data.payload;
    if (!isPlainObject(p) || !isShortString(p.message, 1000)) return null;
    if (p.stack !== undefined && !isShortString(p.stack, MAX_STRING)) return null;
  }
  return data as unknown as SdkEnvelope<GameToHostType>;
}

/** Validate a raw postMessage payload coming FROM the host page (used by the SDK in the game). */
export function parseHostMessage(data: unknown): SdkEnvelope<HostToGameType> | null {
  if (!isPlainObject(data)) return null;
  if (data.vibeplay !== true) return null;
  if (data.v !== SDK_PROTOCOL_VERSION) return null;
  if (!isShortString(data.type, 64) || !HOST_TO_GAME_TYPES.has(data.type)) return null;
  if (data.type === 'playerSummary' && data.payload !== null && data.payload !== undefined) {
    const p = data.payload;
    if (!isPlainObject(p)) return null;
    if (!isShortString(p.id, 64) || !isShortString(p.username, 64)) return null;
    if (!isShortString(p.displayName, 100)) return null;
    if (p.avatarUrl !== null && !isShortString(p.avatarUrl, 2000)) return null;
  }
  return data as unknown as SdkEnvelope<HostToGameType>;
}

export function makeEnvelope<TType extends string, TPayload>(
  type: TType,
  payload?: TPayload,
  requestId?: string,
): SdkEnvelope<TType, TPayload> {
  return { vibeplay: true, v: SDK_PROTOCOL_VERSION, type, payload, requestId };
}
