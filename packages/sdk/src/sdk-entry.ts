/**
 * VibePlay game-side SDK (runs INSIDE the sandboxed game iframe).
 *
 * Design rules (spec §28):
 * - the game receives no private data (no email, no tokens, no cookies);
 * - every message is validated and versioned;
 * - the SDK only talks to the embedding host window with an explicit targetOrigin;
 * - no arbitrary command execution.
 *
 * Games include the built file:  <script src="https://.../vibeplay-sdk.js"></script>
 * or bundle `@vibeplay/sdk`.
 */
import {
  makeEnvelope,
  parseHostMessage,
  type PlayerSummaryPayload,
} from '@vibeplay/shared/sdk-protocol';

type PendingResolver = {
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class VibePlayGameSdk {
  private hostOrigin: string | null = null;
  private readysent = false;
  private pending = new Map<string, PendingResolver>();
  private counter = 0;

  constructor() {
    window.addEventListener('message', (event: MessageEvent) => this.onMessage(event));
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

  private send(type: string, payload?: unknown, requestId?: string): void {
    if (!this.hostOrigin) return; // not initialized yet — drop (except ready())
    window.parent.postMessage(makeEnvelope(type, payload, requestId), this.hostOrigin);
  }

  private request<T>(type: string, timeoutMs: number, fallback: T): Promise<T> {
    if (!this.hostOrigin) return Promise.resolve(fallback);
    const requestId = `r${++this.counter}`;
    return new Promise<T>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(fallback);
      }, timeoutMs);
      this.pending.set(requestId, { resolve: (v) => resolve(v as T), timer });
      this.send(type, undefined, requestId);
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

    if (msg.requestId && this.pending.has(msg.requestId)) {
      const entry = this.pending.get(msg.requestId)!;
      clearTimeout(entry.timer);
      this.pending.delete(msg.requestId);
      entry.resolve(msg.payload ?? null);
    }
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
