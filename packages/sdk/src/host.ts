/**
 * Host-side bridge (runs in the VibePlay web app, NOT inside the game).
 *
 * Security invariants:
 * - only accepts messages whose source is the managed iframe's contentWindow;
 * - only accepts messages from the expected game origin;
 * - validates every envelope (version + type + payload shape);
 * - replies only with whitelisted payloads (player summary is public data;
 *   save results carry game state the player already owns — never tokens/cookies).
 *
 * Cloud saves: the bridge NEVER holds auth tokens. It delegates the actual
 * authenticated API calls to an injected `saveAdapter` (provided by the Play
 * Page, which has the session cookie). When no adapter is present (guest), save
 * writes resolve as `auth_required` so the game can react gracefully.
 */
import {
  makeEnvelope,
  parseGameMessage,
  type LocalSaveAvailablePayload,
  type LocalSaveProvidedPayload,
  type AnalyticsCustomEventPayload,
  type AnalyticsErrorPayload,
  type PlayerSummaryPayload,
  type SaveResultPayload,
  type SaveSetPayload,
} from '@vibeplay/shared/sdk-protocol';

/**
 * Performs the privileged, authenticated save operations on behalf of the game.
 * Implemented by the Play Page against the platform API. Each method MUST return
 * a typed `SaveResultPayload` and must never throw sensitive detail to the game.
 */
export interface HostSaveAdapter {
  get(): Promise<SaveResultPayload>;
  set(
    data: unknown,
    schemaVersion: number | undefined,
    important: boolean,
  ): Promise<SaveResultPayload>;
  delete(): Promise<SaveResultPayload>;
  status(): Promise<SaveResultPayload>;
}

export interface GameBridgeEvents {
  onReady?: () => void;
  onPlayStarted?: () => void;
  onPlayEnded?: () => void;
  onFullscreenRequest?: () => boolean | Promise<boolean>;
  onGameError?: (message: string, stack?: string) => void;
  /** Meaningful progress (level up / achievement / quest) — used to time the CTA. */
  onProgress?: (kind: string | undefined, label: string | undefined) => void;
  /** A guest attempted to SAVE — surface the soft "create account" CTA. */
  onGuestSaveAttempt?: () => void;
  /** The game announced a local (device) save exists (Phase 4 sync prompt). */
  onLocalSaveAvailable?: (meta: LocalSaveAvailablePayload) => void;
  onAnalyticsReady?: () => void;
  onAnalyticsError?: (event: AnalyticsErrorPayload) => void;
  onAnalyticsCustomEvent?: (event: AnalyticsCustomEventPayload) => void;
}

export interface GameBridgeOptions {
  iframe: HTMLIFrameElement;
  /** Exact expected origin of the game content, e.g. https://games.example.com */
  gameOrigin: string;
  /** Public player summary, or null for guests. Never include private fields. */
  playerSummary: PlayerSummaryPayload | null;
  events?: GameBridgeEvents;
  /**
   * Authenticated save backend. Provide when the player is logged in. When null/
   * undefined, the bridge treats the player as a guest: reads/writes resolve as
   * `auth_required` (and a save attempt fires `onGuestSaveAttempt`).
   */
  saveAdapter?: HostSaveAdapter | null;
}

type HostPending = {
  resolve: (v: LocalSaveProvidedPayload | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class GameBridge {
  private readonly iframe: HTMLIFrameElement;
  private readonly gameOrigin: string;
  private readonly playerSummary: PlayerSummaryPayload | null;
  private readonly events: GameBridgeEvents;
  private readonly saveAdapter: HostSaveAdapter | null;
  private readonly listener: (e: MessageEvent) => void;
  private readonly hostPending = new Map<string, HostPending>();
  private counter = 0;
  private handshaken = false;
  private destroyed = false;

  constructor(opts: GameBridgeOptions) {
    this.iframe = opts.iframe;
    this.gameOrigin = new URL(opts.gameOrigin).origin;
    this.playerSummary = opts.playerSummary;
    this.events = opts.events ?? {};
    this.saveAdapter = opts.saveAdapter ?? null;
    this.listener = (e) => this.onMessage(e);
    window.addEventListener('message', this.listener);
  }

  get isHandshaken(): boolean {
    return this.handshaken;
  }

  destroy(): void {
    this.destroyed = true;
    for (const p of this.hostPending.values()) clearTimeout(p.timer);
    this.hostPending.clear();
    window.removeEventListener('message', this.listener);
  }

  /**
   * Ask the game to hand over its local (device) save so the platform can sync it
   * to the cloud after login (Phase 4). Resolves null if the game doesn't respond.
   */
  requestLocalSave(timeoutMs = 8000): Promise<LocalSaveProvidedPayload | null> {
    if (!this.handshaken || this.destroyed) return Promise.resolve(null);
    const requestId = `h${++this.counter}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.hostPending.delete(requestId);
        resolve(null);
      }, timeoutMs);
      this.hostPending.set(requestId, { resolve, timer });
      this.post('requestLocalSave', undefined, requestId);
    });
  }

  private post(type: string, payload?: unknown, requestId?: string): void {
    const win = this.iframe.contentWindow;
    if (!win) return;
    win.postMessage(makeEnvelope(type, payload, requestId), this.gameOrigin);
  }

  private async onMessage(event: MessageEvent): Promise<void> {
    if (this.destroyed) return;
    // Source window must be OUR iframe.
    if (event.source !== this.iframe.contentWindow) return;
    // Origin must be the expected game origin.
    if (event.origin !== this.gameOrigin) return;

    const msg = parseGameMessage(event.data);
    if (!msg) return;

    switch (msg.type) {
      case 'ready': {
        this.handshaken = true;
        this.post('init');
        this.events.onReady?.();
        break;
      }
      case 'requestPlayerSummary': {
        this.post('playerSummary', this.playerSummary, msg.requestId);
        break;
      }
      case 'playStarted': {
        this.events.onPlayStarted?.();
        break;
      }
      case 'playEnded': {
        this.events.onPlayEnded?.();
        break;
      }
      case 'progress': {
        const p = (msg.payload ?? {}) as { kind?: string; label?: string };
        this.events.onProgress?.(p.kind, p.label);
        break;
      }
      case 'requestFullscreen': {
        let granted: boolean;
        try {
          granted = (await this.events.onFullscreenRequest?.()) ?? false;
        } catch {
          granted = false;
        }
        this.post('fullscreenResult', granted, msg.requestId);
        break;
      }
      case 'reportError': {
        const p = msg.payload as { message: string; stack?: string };
        this.events.onGameError?.(p.message, p.stack);
        break;
      }
      case 'saveGet': {
        await this.handleSave('get', msg.requestId);
        break;
      }
      case 'saveSet': {
        await this.handleSave('set', msg.requestId, msg.payload as SaveSetPayload);
        break;
      }
      case 'saveDelete': {
        await this.handleSave('delete', msg.requestId);
        break;
      }
      case 'saveStatus': {
        await this.handleSave('status', msg.requestId);
        break;
      }
      case 'localSaveAvailable': {
        this.events.onLocalSaveAvailable?.(msg.payload as LocalSaveAvailablePayload);
        break;
      }
      case 'localSaveProvided': {
        const id = msg.requestId;
        if (id && this.hostPending.has(id)) {
          const entry = this.hostPending.get(id)!;
          clearTimeout(entry.timer);
          this.hostPending.delete(id);
          entry.resolve((msg.payload as LocalSaveProvidedPayload) ?? null);
        }
        break;
      }
      case 'analyticsReady': {
        this.events.onAnalyticsReady?.();
        break;
      }
      case 'analyticsError': {
        this.events.onAnalyticsError?.(msg.payload as AnalyticsErrorPayload);
        break;
      }
      case 'analyticsCustomEvent': {
        this.events.onAnalyticsCustomEvent?.(msg.payload as AnalyticsCustomEventPayload);
        break;
      }
    }
  }

  private async handleSave(
    op: 'get' | 'set' | 'delete' | 'status',
    requestId: string | undefined,
    payload?: SaveSetPayload,
  ): Promise<void> {
    const adapter = this.saveAdapter;
    if (!adapter) {
      // Guest. Status is informational; reads/writes require an account.
      if (op === 'status') {
        this.post(
          'saveResult',
          { code: 'ok', status: { available: true, loggedIn: false, hasSave: false } },
          requestId,
        );
        return;
      }
      if (op === 'set') this.events.onGuestSaveAttempt?.();
      this.post('saveResult', { code: 'auth_required' } satisfies SaveResultPayload, requestId);
      return;
    }
    let result: SaveResultPayload;
    try {
      if (op === 'get') result = await adapter.get();
      else if (op === 'delete') result = await adapter.delete();
      else if (op === 'status') result = await adapter.status();
      else
        result = await adapter.set(
          payload?.data,
          payload?.schemaVersion,
          payload?.important ?? false,
        );
    } catch {
      result = { code: 'error' };
    }
    this.post('saveResult', result, requestId);
  }
}
