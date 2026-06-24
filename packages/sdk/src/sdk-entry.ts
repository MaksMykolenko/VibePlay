/**
 * VibePlay game-side SDK (runs INSIDE the sandboxed game iframe).
 *
 * Design rules (spec §28 + cloud saves):
 * - the game receives no private data (no email, no tokens, no cookies);
 * - every message is validated and versioned;
 * - the SDK only talks to the embedding host window with an explicit targetOrigin;
 * - no arbitrary command execution;
 * - the game NEVER performs authenticated API calls itself — it asks the parent
 *   Play Page over postMessage, and the parent does the privileged work.
 *
 * Games include the built file:  <script src="https://.../vibeplay-sdk.js"></script>
 * (exposes window.VibePlay) or bundle `@vibeplay/sdk`.
 *
 * ── Cloud saves ────────────────────────────────────────────────────────────
 *   // Is cloud saving usable right now (running in VibePlay, bridge ready)?
 *   if (VibePlay.save.isAvailable()) { ... }
 *
 *   // Write progress. The SDK debounces writes to at most once / 10s; pass
 *   // { important: true } on key moments (level up, quest complete) to flush now.
 *   const res = await VibePlay.save.set(
 *     { level: 4, coins: 120, xp: 450, inventory: ['burger', 'cola'], position: { x: 10, y: 0, z: 25 } },
 *     { important: true },
 *   );
 *   if (res.code === 'auth_required') { /* show your own "log in to save" hint *\/ }
 *
 *   // Read it back (e.g. on boot).
 *   const got = await VibePlay.save.get();
 *   if (got.code === 'ok') loadState(got.data);
 *
 *   // Status without fetching the blob.
 *   const { status } = await VibePlay.save.getStatus();
 *   // status = { available, loggedIn, hasSave, sizeBytes?, schemaVersion?, updatedAt? }
 *
 *   // Remove the cloud save.
 *   await VibePlay.save.delete();
 *
 * ── Guest-save transfer (Phase 4) ──────────────────────────────────────────
 *   // Tell the platform a local (device) save exists so it can offer to sync
 *   // after the player logs in.
 *   VibePlay.save.reportLocalSave({ has: true, schemaVersion: 2 });
 *
 *   // Hand the local save to the platform when it asks (after login).
 *   VibePlay.save.onLocalSaveRequested(() => ({ data: readLocalSave(), schemaVersion: 2 }));
 *
 * ── Conversion triggers (Phase 3) ──────────────────────────────────────────
 *   VibePlay.reportProgress('level_up');   // helps time the soft "create account" CTA
 */
import {
  makeEnvelope,
  parseHostMessage,
  type LocalSaveProvidedPayload,
  type AnalyticsCustomEventPayload,
  type PlayerSummaryPayload,
  type RoomContextPayload,
  type RoomTokenPayload,
  type SaveResultPayload,
  type SaveStatusInfo,
} from '@vibeplay/shared/sdk-protocol';

type PendingResolver = {
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Options for VibePlay.save.set(). */
export interface SaveSetOptions {
  /** Game-defined save format version. */
  schemaVersion?: number;
  /** Bypass the client-side throttle for key moments (level up, quest complete). */
  important?: boolean;
}

/** What a game returns when the platform asks for its local save. */
export interface LocalSaveProvider {
  (): LocalSaveProvidedPayload | null | Promise<LocalSaveProvidedPayload | null>;
}

/** The `VibePlay.save` namespace surface. */
export interface VibePlaySaveApi {
  /** True when cloud saving is reachable (in VibePlay + bridge handshaken). */
  isAvailable(): boolean;
  /** Fetch the cloud save. `code: 'ok'` → `data` is the saved state. */
  get(): Promise<SaveResultPayload>;
  /** Upsert the cloud save (debounced; `{ important: true }` flushes immediately). */
  set(data: unknown, options?: SaveSetOptions): Promise<SaveResultPayload>;
  /** Delete the cloud save. */
  delete(): Promise<SaveResultPayload>;
  /** Cheap status (available / loggedIn / hasSave) without downloading the blob. */
  getStatus(): Promise<SaveResultPayload>;
  /** Announce that a local (device) save exists, for post-login sync prompts. */
  reportLocalSave(meta: { has: boolean; schemaVersion?: number; sizeBytes?: number }): void;
  /** Register a provider the platform calls to read the local save for syncing. */
  onLocalSaveRequested(provider: LocalSaveProvider): void;
}

/**
 * Multiplayer room surface (Phase 4). The game receives room context (room code,
 * signed room token, ws url, player identity) from the VibePlay parent over
 * postMessage and NEVER calls VibePlay auth/APIs itself.
 */
export interface VibePlayRoomsApi {
  /** True when running in VibePlay AND a room context has been received. */
  isAvailable(): boolean;
  /** Current room context (resolves null when not in a multiplayer room). */
  getContext(): Promise<RoomContextPayload | null>;
  /**
   * Subscribe to room-context updates (initial + refreshes). Fires immediately
   * with the current context if one was already received. Returns an unsubscribe.
   */
  onContext(callback: (ctx: RoomContextPayload | null) => void): () => void;
  /** Ask the parent for a FRESH short-lived room token (tokens expire fast). */
  getToken(): Promise<RoomTokenPayload | null>;
  /** Ask the parent (which owns the session) to leave the room. */
  leave(): void;
}

/** Privacy-safe analytics surface. All calls use postMessage; no API credentials are exposed. */
export interface VibePlayAnalyticsApi {
  /** Signal that the game's analytics integration is ready. */
  ready(): void;
  /** Report a bounded safe error code, never a stack or free-form message. */
  error(code: string, label?: string): boolean;
  /** Track a creator-defined event with only name/value/label metadata. */
  trackCustomEvent(event: AnalyticsCustomEventPayload): boolean;
}

/** Don't write more often than this unless the caller marks the event important. */
const SAVE_MIN_INTERVAL_MS = 10_000;
const SAVE_REQUEST_TIMEOUT_MS = 15_000;

export class VibePlayGameSdk {
  private hostOrigin: string | null = null;
  private readysent = false;
  private pending = new Map<string, PendingResolver>();
  private counter = 0;

  // Save throttle state.
  private saveLastFlushAt = 0;
  private savePending: { data: unknown; schemaVersion?: number; important: boolean } | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<SaveResultPayload> | null = null;
  private savePromiseResolve: ((r: SaveResultPayload) => void) | null = null;
  private localSaveProvider: LocalSaveProvider | null = null;

  // Room context state (Phase 4).
  private roomContext: RoomContextPayload | null = null;
  private roomContextReceived = false;
  private roomContextListeners = new Set<(ctx: RoomContextPayload | null) => void>();

  /** Cloud-save API namespace (see VibePlaySaveApi). */
  readonly save: VibePlaySaveApi;
  readonly analytics: VibePlayAnalyticsApi;
  /** Multiplayer room namespace (see VibePlayRoomsApi). */
  readonly rooms: VibePlayRoomsApi;

  constructor() {
    window.addEventListener('message', (event: MessageEvent) => this.onMessage(event));
    this.save = {
      isAvailable: () => this.hostOrigin !== null,
      get: () => this.saveGet(),
      set: (data, options) => this.saveSet(data, options),
      delete: () => this.saveDelete(),
      getStatus: () => this.saveGetStatus(),
      reportLocalSave: (meta) => this.send('localSaveAvailable', meta),
      onLocalSaveRequested: (provider) => {
        this.localSaveProvider = provider;
      },
    };
    this.rooms = {
      isAvailable: () =>
        this.hostOrigin !== null && this.roomContextReceived && this.roomContext !== null,
      getContext: () => this.roomGetContext(),
      onContext: (callback) => {
        this.roomContextListeners.add(callback);
        // Fire immediately if a context was already received (common case).
        if (this.roomContextReceived) {
          try {
            callback(this.roomContext);
          } catch {
            /* listener errors never break the SDK */
          }
        }
        return () => this.roomContextListeners.delete(callback);
      },
      getToken: () => this.roomGetToken(),
      leave: () => this.send('roomLeave'),
    };
    this.analytics = {
      ready: () => this.send('analyticsReady'),
      error: (code, label) => {
        if (!isSafeAnalyticsSlug(code) || !isSafeLabel(label)) return false;
        this.send('analyticsError', { code, ...(label ? { label } : {}) });
        return true;
      },
      trackCustomEvent: (event) => {
        if (!isValidCustomEvent(event)) return false;
        this.send('analyticsCustomEvent', event);
        return true;
      },
    };
  }

  /**
   * Announce the game is ready. The host replies with `init` which locks the
   * host origin for all subsequent communication.
   */
  ready(): void {
    if (this.readysent) return;
    this.readysent = true;
    // We do not know the host origin yet (sandboxed iframe has an opaque origin
    // story for itself, not for parent). '*' is acceptable ONLY for this first
    // ready beacon because it carries no data; everything after `init` uses the
    // locked origin.
    window.parent.postMessage(makeEnvelope('ready'), '*');
  }

  /** Public, non-private player info (or null when playing as guest). */
  requestPlayerSummary(): Promise<PlayerSummaryPayload | null> {
    return this.request<PlayerSummaryPayload | null>('requestPlayerSummary', 5000, null);
  }

  playStarted(): void {
    this.send('playStarted');
  }

  playEnded(): void {
    this.send('playEnded');
  }

  /**
   * Signal meaningful progress (level up, achievement, quest complete). The host
   * uses this to time the soft "create a free account" CTA — it carries no state.
   */
  reportProgress(kind?: string, label?: string): void {
    this.send('progress', { kind, label });
  }

  /** Ask the host to toggle fullscreen. Must be called from a user gesture. */
  requestFullscreen(): Promise<boolean> {
    return this.request<boolean>('requestFullscreen', 5000, false);
  }

  reportError(message: string, stack?: string): void {
    this.send('reportError', {
      message: String(message).slice(0, 1000),
      stack: stack?.slice(0, 5000),
    });
  }

  // --- cloud saves ----------------------------------------------------------

  private saveGet(): Promise<SaveResultPayload> {
    if (this.hostOrigin === null) return Promise.resolve({ code: 'unavailable' });
    return this.request<SaveResultPayload>('saveGet', SAVE_REQUEST_TIMEOUT_MS, { code: 'error' });
  }

  private saveDelete(): Promise<SaveResultPayload> {
    if (this.hostOrigin === null) return Promise.resolve({ code: 'unavailable' });
    return this.request<SaveResultPayload>('saveDelete', SAVE_REQUEST_TIMEOUT_MS, {
      code: 'error',
    });
  }

  private saveGetStatus(): Promise<SaveResultPayload> {
    if (this.hostOrigin === null) {
      const status: SaveStatusInfo = { available: false, loggedIn: false, hasSave: false };
      return Promise.resolve({ code: 'unavailable', status });
    }
    return this.request<SaveResultPayload>('saveStatus', SAVE_REQUEST_TIMEOUT_MS, {
      code: 'error',
    });
  }

  /**
   * Debounced/throttled cloud write. Multiple calls within the throttle window
   * are coalesced into a single write of the LAST value; they all resolve with
   * that write's result. `important` flushes immediately (still coalescing any
   * calls in the same tick) so games can persist key moments without waiting.
   */
  private saveSet(data: unknown, options?: SaveSetOptions): Promise<SaveResultPayload> {
    if (this.hostOrigin === null) return Promise.resolve({ code: 'unavailable' });
    const important = options?.important ?? false;
    this.savePending = { data, schemaVersion: options?.schemaVersion, important };
    if (!this.savePromise) {
      this.savePromise = new Promise<SaveResultPayload>((res) => {
        this.savePromiseResolve = res;
      });
    }
    const elapsed = Date.now() - this.saveLastFlushAt;
    if (important || elapsed >= SAVE_MIN_INTERVAL_MS) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      this.scheduleSaveFlush(0);
    } else {
      this.scheduleSaveFlush(SAVE_MIN_INTERVAL_MS - elapsed);
    }
    return this.savePromise;
  }

  private scheduleSaveFlush(delayMs: number): void {
    if (this.saveTimer) return; // a flush is already queued
    this.saveTimer = setTimeout(
      () => {
        this.saveTimer = null;
        void this.flushSave();
      },
      Math.max(0, delayMs),
    );
  }

  private async flushSave(): Promise<void> {
    const pending = this.savePending;
    const resolve = this.savePromiseResolve;
    this.savePending = null;
    this.savePromise = null;
    this.savePromiseResolve = null;
    if (!pending) {
      resolve?.({ code: 'ok' });
      return;
    }
    this.saveLastFlushAt = Date.now();
    const result = await this.request<SaveResultPayload>(
      'saveSet',
      SAVE_REQUEST_TIMEOUT_MS,
      { code: 'error' },
      { data: pending.data, schemaVersion: pending.schemaVersion, important: pending.important },
    );
    resolve?.(result);
  }

  // --- multiplayer rooms ----------------------------------------------------

  private roomGetContext(): Promise<RoomContextPayload | null> {
    if (this.hostOrigin === null) return Promise.resolve(null);
    // Resolve from cache once the parent has pushed context (it does so on init).
    if (this.roomContextReceived) return Promise.resolve(this.roomContext);
    return this.request<RoomContextPayload | null>('requestRoomContext', 5000, null);
  }

  private roomGetToken(): Promise<RoomTokenPayload | null> {
    if (this.hostOrigin === null) return Promise.resolve(null);
    return this.request<RoomTokenPayload | null>('requestRoomToken', SAVE_REQUEST_TIMEOUT_MS, null);
  }

  // --- transport ------------------------------------------------------------

  private send(type: string, payload?: unknown, requestId?: string): void {
    if (!this.hostOrigin) return; // not initialized yet — drop (except ready())
    window.parent.postMessage(makeEnvelope(type, payload, requestId), this.hostOrigin);
  }

  private request<T>(type: string, timeoutMs: number, fallback: T, payload?: unknown): Promise<T> {
    if (!this.hostOrigin) return Promise.resolve(fallback);
    const requestId = `r${++this.counter}`;
    return new Promise<T>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(fallback);
      }, timeoutMs);
      this.pending.set(requestId, { resolve: (v) => resolve(v as T), timer });
      this.send(type, payload, requestId);
    });
  }

  private onMessage(event: MessageEvent): void {
    const msg = parseHostMessage(event.data);
    if (!msg) return;
    if (event.source !== window.parent) return;

    if (msg.type === 'init') {
      // Lock host origin from the first valid init message.
      if (!this.hostOrigin) this.hostOrigin = event.origin;
      return;
    }

    // After init, only accept messages from the locked origin.
    if (this.hostOrigin !== event.origin) return;

    // Room context: handle BOTH the proactive push (no requestId) and the
    // correlated response to getContext(). Cache it, notify onContext listeners,
    // and resolve any awaiting getContext() promise.
    if (msg.type === 'roomContext') {
      const ctx = (msg.payload as RoomContextPayload | null) ?? null;
      this.roomContext = ctx;
      this.roomContextReceived = true;
      for (const cb of this.roomContextListeners) {
        try {
          cb(ctx);
        } catch {
          /* listener errors never break the SDK */
        }
      }
      if (msg.requestId && this.pending.has(msg.requestId)) {
        const entry = this.pending.get(msg.requestId)!;
        clearTimeout(entry.timer);
        this.pending.delete(msg.requestId);
        entry.resolve(ctx);
      }
      return;
    }

    // Correlated responses (playerSummary, fullscreenResult, saveResult, ...).
    if (msg.requestId && this.pending.has(msg.requestId)) {
      const entry = this.pending.get(msg.requestId)!;
      clearTimeout(entry.timer);
      this.pending.delete(msg.requestId);
      entry.resolve(msg.payload ?? null);
      return;
    }

    // Host-initiated request: hand over the local save for syncing (Phase 4).
    if (msg.type === 'requestLocalSave') {
      void this.provideLocalSave(msg.requestId);
    }
  }

  private async provideLocalSave(requestId?: string): Promise<void> {
    if (!requestId) return;
    let payload: LocalSaveProvidedPayload = { data: null };
    try {
      const provided = await this.localSaveProvider?.();
      if (provided && typeof provided === 'object') {
        payload = { data: provided.data ?? null, schemaVersion: provided.schemaVersion };
      }
    } catch {
      payload = { data: null };
    }
    this.send('localSaveProvided', payload, requestId);
  }
}

function isSafeAnalyticsSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_.-]{1,40}$/.test(value);
}

function isSafeLabel(value: unknown): value is string | undefined {
  return (
    value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= 80)
  );
}

function isValidCustomEvent(value: unknown): value is AnalyticsCustomEventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!Object.keys(record).every((key) => ['name', 'value', 'label'].includes(key))) return false;
  if (!isSafeAnalyticsSlug(record.name) || !isSafeLabel(record.label)) return false;
  return (
    record.value === undefined ||
    (typeof record.value === 'number' &&
      Number.isFinite(record.value) &&
      Math.abs(record.value) <= 1_000_000)
  );
}

let singleton: VibePlayGameSdk | null = null;

export function initVibePlaySdk(): VibePlayGameSdk {
  if (!singleton) {
    singleton = new VibePlayGameSdk();
    singleton.ready();
  }
  return singleton;
}

// IIFE bundle convenience: window.VibePlay
declare global {
  interface Window {
    VibePlay?: VibePlayGameSdk;
  }
}

if (typeof window !== 'undefined' && window.parent !== window) {
  window.VibePlay = initVibePlaySdk();
}
