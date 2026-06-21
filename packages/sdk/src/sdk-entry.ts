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
  type PlayerSummaryPayload,
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

  /** Cloud-save API namespace (see VibePlaySaveApi). */
  readonly save: VibePlaySaveApi;

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
