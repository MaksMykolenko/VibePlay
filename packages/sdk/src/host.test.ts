import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnvelope } from '@vibeplay/shared/sdk-protocol';
import { GameBridge } from './host.js';

describe('GameBridge', () => {
  let browserWindow: EventTarget;
  let postMessage: ReturnType<typeof vi.fn>;
  let frameWindow: Window;
  let iframe: HTMLIFrameElement;

  beforeEach(() => {
    browserWindow = new EventTarget();
    vi.stubGlobal('window', browserWindow);
    postMessage = vi.fn();
    frameWindow = { postMessage } as unknown as Window;
    iframe = { contentWindow: frameWindow } as HTMLIFrameElement;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function send(
    origin: string,
    data: unknown,
    source: MessageEventSource | null = frameWindow,
  ): void {
    const event = new Event('message');
    Object.defineProperties(event, {
      origin: { value: origin },
      data: { value: data },
      source: { value: source },
    });
    browserWindow.dispatchEvent(event);
  }

  it('handshakes only with the managed iframe and exact origin', async () => {
    const onReady = vi.fn();
    const bridge = new GameBridge({
      iframe,
      gameOrigin: 'https://games.example.com/path',
      playerSummary: null,
      events: { onReady },
    });

    send('https://evil.example', makeEnvelope('ready'));
    send('https://games.example.com', makeEnvelope('ready'), {} as Window);
    await Promise.resolve();
    expect(bridge.isHandshaken).toBe(false);

    send('https://games.example.com', makeEnvelope('ready'));
    await Promise.resolve();
    expect(bridge.isHandshaken).toBe(true);
    expect(onReady).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init' }),
      'https://games.example.com',
    );
    bridge.destroy();
  });

  it('returns only the configured public player summary', async () => {
    const playerSummary = {
      id: 'user-1',
      username: 'player',
      displayName: 'Player',
      avatarUrl: null,
    };
    const bridge = new GameBridge({
      iframe,
      gameOrigin: 'https://games.example.com',
      playerSummary,
    });

    send('https://games.example.com', makeEnvelope('requestPlayerSummary', undefined, 'req-1'));
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'playerSummary',
        requestId: 'req-1',
        payload: playerSummary,
      }),
      'https://games.example.com',
    );
    bridge.destroy();
  });
});
