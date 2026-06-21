/**
 * VibePlay ↔ game postMessage protocol (spec §28).
 *
 * Only these message types exist. Every message carries a protocol version and
 * is validated on both sides; unknown/invalid messages are dropped silently.
 * The game NEVER receives private data (no email, no tokens, no raw user object).
 */

// Protocol version stays 1: the cloud-save additions are purely additive new
// message TYPES. Existing v1 games keep working unchanged (they simply never
// send/receive the new types), so guest play and shipped games are never broken.
export const SDK_PROTOCOL_VERSION = 1;

export type GameToHostType =
  | 'ready'
  | 'requestPlayerSummary'
  | 'playStarted'
  | 'playEnded'
  | 'requestFullscreen'
  | 'reportError'
  // Cloud saves (Phase 2) and conversion triggers (Phase 3):
  | 'progress'
  | 'saveGet'
  | 'saveSet'
  | 'saveDelete'
  | 'saveStatus'
  // Guest-save transfer (Phase 4):
  | 'localSaveAvailable'
  | 'localSaveProvided';

export type HostToGameType =
  | 'init'
  | 'playerSummary'
  | 'fullscreenResult'
  // Correlated response to any save* request:
  | 'saveResult'
  // Host asks the game to hand over its local (device) save for syncing:
  | 'requestLocalSave';

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

/**
 * Typed save outcome codes (never leak HTTP/internal detail to the game):
 * - ok: success
 * - auth_required: the player is a guest (not logged in)
 * - too_large: payload exceeded the size cap
 * - invalid: payload failed JSON/shape validation
 * - rate_limited: too many writes
 * - not_found: no save exists (get/delete)
 * - unavailable: not running inside VibePlay / bridge not ready
 * - error: any other failure
 */
export type SaveResultCode =
  | 'ok'
  | 'auth_required'
  | 'too_large'
  | 'invalid'
  | 'rate_limited'
  | 'not_found'
  | 'unavailable'
  | 'error';

/** Lightweight status the game can poll before deciding to save. */
export interface SaveStatusInfo {
  /** Cloud saving is reachable (running in VibePlay and bridge ready). */
  available: boolean;
  /** The player has an authenticated account. */
  loggedIn: boolean;
  /** A cloud save already exists for this game + player. */
  hasSave: boolean;
  sizeBytes?: number;
  schemaVersion?: number;
  updatedAt?: string;
}

/** Payload the game sends with `saveSet`. */
export interface SaveSetPayload {
  data: unknown;
  schemaVersion?: number;
  /** Important events (level up, quest complete) may bypass throttle on the game side. */
  important?: boolean;
}

/** Host → game correlated response to a save* request. */
export interface SaveResultPayload {
  code: SaveResultCode;
  /** Present for a successful `saveGet`. */
  data?: unknown;
  schemaVersion?: number;
  /** Present for `saveStatus`. */
  status?: SaveStatusInfo;
  /** Optional human-readable detail (never sensitive). */
  message?: string;
}

/** Game → host announcement that a local (device) save exists, for sync prompts. */
export interface LocalSaveAvailablePayload {
  has: boolean;
  schemaVersion?: number;
  sizeBytes?: number;
}

/** Game → host response handing over the local save when the host asks for it. */
export interface LocalSaveProvidedPayload {
  data: unknown;
  schemaVersion?: number;
}

/** Game → host progress signal used to time the soft conversion CTA. */
export interface ProgressPayload {
  /** e.g. 'level_up' | 'achievement' | 'quest_complete' | 'checkpoint'. */
  kind?: string;
  label?: string;
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
  'progress',
  'saveGet',
  'saveSet',
  'saveDelete',
  'saveStatus',
  'localSaveAvailable',
  'localSaveProvided',
]);

const HOST_TO_GAME_TYPES: ReadonlySet<string> = new Set([
  'init',
  'playerSummary',
  'fullscreenResult',
  'saveResult',
  'requestLocalSave',
]);

const SAVE_RESULT_CODES: ReadonlySet<string> = new Set([
  'ok',
  'auth_required',
  'too_large',
  'invalid',
  'rate_limited',
  'not_found',
  'unavailable',
  'error',
]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

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
  // Save payloads may legitimately carry large `data` (up to the API's KB cap),
  // so we validate only the wrapper fields here — never the serialized size.
  if (data.type === 'saveSet') {
    const p = data.payload;
    if (!isPlainObject(p) || !('data' in p)) return null;
    if (p.schemaVersion !== undefined && !isFiniteNumber(p.schemaVersion)) return null;
    if (p.important !== undefined && typeof p.important !== 'boolean') return null;
  }
  if (data.type === 'progress' && data.payload !== undefined) {
    const p = data.payload;
    if (!isPlainObject(p)) return null;
    if (p.kind !== undefined && !isShortString(p.kind, 64)) return null;
    if (p.label !== undefined && !isShortString(p.label, 200)) return null;
  }
  if (data.type === 'localSaveAvailable') {
    const p = data.payload;
    if (!isPlainObject(p) || typeof p.has !== 'boolean') return null;
    if (p.schemaVersion !== undefined && !isFiniteNumber(p.schemaVersion)) return null;
    if (p.sizeBytes !== undefined && !isFiniteNumber(p.sizeBytes)) return null;
  }
  if (data.type === 'localSaveProvided') {
    const p = data.payload;
    if (!isPlainObject(p) || !('data' in p)) return null;
    if (p.schemaVersion !== undefined && !isFiniteNumber(p.schemaVersion)) return null;
  }
  return data as unknown as SdkEnvelope<GameToHostType>;
}

/** Validate a raw postMessage payload coming FROM the host page (used by the SDK in the game). */
export function parseHostMessage(data: unknown): SdkEnvelope<HostToGameType> | null {
  if (!isPlainObject(data)) return null;
  if (data.vibeplay !== true) return null;
  if (data.v !== SDK_PROTOCOL_VERSION) return null;
  if (!isShortString(data.type, 64) || !HOST_TO_GAME_TYPES.has(data.type)) return null;
  if (data.requestId !== undefined && !isShortString(data.requestId, 64)) return null;
  if (data.type === 'playerSummary' && data.payload !== null && data.payload !== undefined) {
    const p = data.payload;
    if (!isPlainObject(p)) return null;
    if (!isShortString(p.id, 64) || !isShortString(p.username, 64)) return null;
    if (!isShortString(p.displayName, 100)) return null;
    if (p.avatarUrl !== null && !isShortString(p.avatarUrl, 2000)) return null;
  }
  if (data.type === 'saveResult') {
    const p = data.payload;
    if (!isPlainObject(p)) return null;
    if (!isShortString(p.code, 32) || !SAVE_RESULT_CODES.has(p.code)) return null;
    if (p.message !== undefined && !isShortString(p.message, 500)) return null;
    if (p.schemaVersion !== undefined && !isFiniteNumber(p.schemaVersion)) return null;
    if (p.status !== undefined) {
      const s = p.status;
      if (!isPlainObject(s)) return null;
      if (
        typeof s.available !== 'boolean' ||
        typeof s.loggedIn !== 'boolean' ||
        typeof s.hasSave !== 'boolean'
      ) {
        return null;
      }
    }
    // `p.data` (a successful saveGet payload) may be any JSON of any size — the
    // protocol layer never inspects or size-limits it.
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
