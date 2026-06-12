/**
 * Host-side bridge (runs in the VibePlay web app, NOT inside the game).
 *
 * Security invariants:
 * - only accepts messages whose source is the managed iframe's contentWindow;
 * - only accepts messages from the expected game origin;
 * - validates every envelope (version + type + payload shape);
 * - replies only with the whitelisted payloads (player summary is public data).
 */
import {
  makeEnvelope,
  parseGameMessage,
  type PlayerSummaryPayload,
} from '@vibeplay/shared/sdk-protocol';

export interface GameBridgeEvents {
  onReady?: () => void;
  onPlayStarted?: () => void;
  onPlayEnded?: () => void;
  onFullscreenRequest?: () => boolean | Promise<boolean>;
  onGameError?: (message: string, stack?: string) => void;
}

export interface GameBridgeOptions {
  iframe: HTMLIFrameElement;
  /** Exact expected origin of the game content, e.g. https://games.example.com */
  gameOrigin: string;
  /** Public player summary, or null for guests. Never include private fields. */
  playerSummary: PlayerSummaryPayload | null;
  events?: GameBridgeEvents;
}

export class GameBridge {
  private readonly iframe: HTMLIFrameElement;
  private readonly gameOrigin: string;
  private readonly playerSummary: PlayerSummaryPayload | null;
  private readonly events: GameBridgeEvents;
  private readonly listener: (e: MessageEvent) => void;
  private handshaken = false;
  private destroyed = false;

  constructor(opts: GameBridgeOptions) {
    this.iframe = opts.iframe;
    this.gameOrigin = new URL(opts.gameOrigin).origin;
    this.playerSummary = opts.playerSummary;
    this.events = opts.events ?? {};
    this.listener = (e) => this.onMessage(e);
    window.addEventListener('message', this.listener);
  }

  get isHandshaken(): boolean {
    return this.handshaken;
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('message', this.listener);
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
    }
  }
}
