/**
 * Decision logic for the soft "create a free account" CTA on the Play Page.
 *
 * Rules (spec Phase 3):
 * - never blocks gameplay; it's a dismissible card;
 * - only shown to guests, and only after meaningful engagement:
 *     · a few minutes of play, OR
 *     · the game reports a progress/level-up/achievement event, OR
 *     · the guest attempts a save;
 * - "Continue as guest" dismisses it for the session AND sets a cooldown so it
 *   doesn't nag on the next visit.
 *
 * The storage is injectable so this is unit-testable without a DOM.
 */
export const CTA_PLAY_THRESHOLD_MS = 180_000; // 3 minutes of play
export const CTA_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

const SESSION_KEY = 'vp_cloudsave_cta_dismissed';
const COOLDOWN_KEY = 'vp_cloudsave_cta_cooldown_until';

export interface CtaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CtaStorages {
  session?: CtaStorage | null;
  local?: CtaStorage | null;
  now?: number;
}

function safeStorage(kind: 'session' | 'local'): CtaStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null; // storage blocked (private mode / sandbox) — fail open to "not suppressed"
  }
}

/** True when the CTA should stay hidden (dismissed this session or within cooldown). */
export function isCtaSuppressed(opts: CtaStorages = {}): boolean {
  const now = opts.now ?? Date.now();
  const session = opts.session === undefined ? safeStorage('session') : opts.session;
  const local = opts.local === undefined ? safeStorage('local') : opts.local;
  if (session?.getItem(SESSION_KEY) === '1') return true;
  const until = Number(local?.getItem(COOLDOWN_KEY) ?? '0');
  return Number.isFinite(until) && until > now;
}

/** Record a dismissal: hide for the session and set a cooldown window. */
export function suppressCta(opts: CtaStorages & { cooldownMs?: number } = {}): void {
  const now = opts.now ?? Date.now();
  const cooldownMs = opts.cooldownMs ?? CTA_COOLDOWN_MS;
  const session = opts.session === undefined ? safeStorage('session') : opts.session;
  const local = opts.local === undefined ? safeStorage('local') : opts.local;
  session?.setItem(SESSION_KEY, '1');
  local?.setItem(COOLDOWN_KEY, String(now + cooldownMs));
}

/**
 * Whether the CTA may be shown right now given the player and suppression state.
 * The actual trigger (timer / progress / guest-save) is decided by the caller;
 * this just gates on "is a guest" + "not suppressed".
 */
export function canShowCta(isGuest: boolean, opts: CtaStorages = {}): boolean {
  if (!isGuest) return false;
  return !isCtaSuppressed(opts);
}

/** Sync is relevant only for an authenticated player with actual local progress. */
export function canOfferCloudSaveSync(
  isLoggedIn: boolean,
  gameId: string | null | undefined,
  localData: unknown,
): boolean {
  return Boolean(isLoggedIn && gameId && localData !== null && localData !== undefined);
}

// --- signup-return intent --------------------------------------------------
// When a guest clicks "Create account" from the CTA we record which game they
// came from. After they register and return to that play page, we detect it to
// offer to sync any local progress to their new account (Phase 4).
const SIGNUP_INTENT_KEY = 'vp_cloudsave_signup_intent';

export type GameAuthIntent = 'registration' | 'login';

export function markGameAuthIntent(
  gameId: string,
  intent: GameAuthIntent,
  storage?: CtaStorage | null,
): void {
  const s = storage === undefined ? safeStorage('session') : storage;
  s?.setItem(SIGNUP_INTENT_KEY, JSON.stringify({ gameId, intent }));
}

export function consumeGameAuthIntent(
  gameId: string,
  storage?: CtaStorage | null,
): GameAuthIntent | null {
  const s = storage === undefined ? safeStorage('session') : storage;
  if (!s) return null;
  const value = s.getItem(SIGNUP_INTENT_KEY);
  let storedGameId = value;
  let intent: GameAuthIntent = 'registration';
  try {
    const parsed = JSON.parse(value ?? '') as { gameId?: unknown; intent?: unknown };
    if (typeof parsed.gameId === 'string') storedGameId = parsed.gameId;
    if (parsed.intent === 'login') intent = 'login';
  } catch {
    // Backward-compatible with the prior plain game-id value.
  }
  if (storedGameId !== gameId) return null;
  s.setItem(SIGNUP_INTENT_KEY, '');
  return intent;
}

export function markSignupIntent(gameId: string, storage?: CtaStorage | null): void {
  markGameAuthIntent(gameId, 'registration', storage);
}

/** Returns true (once) if the player just returned from signup for this game. */
export function consumeSignupIntent(gameId: string, storage?: CtaStorage | null): boolean {
  return consumeGameAuthIntent(gameId, storage) !== null;
}
