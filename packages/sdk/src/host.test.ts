import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnvelope, type SaveResultPayload } from '@vibeplay/shared/sdk-protocol';
import { GameBridge, type HostSaveAdapter } from './host.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

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

  // --- cloud saves ----------------------------------------------------------

  function makeAdapter(): HostSaveAdapter {
    return {
      get: vi.fn(
        async (): Promise<SaveResultPayload> => ({
          code: 'ok',
          data: { level: 3 },
          schemaVersion: 2,
        }),
      ),
      set: vi.fn(async (): Promise<SaveResultPayload> => ({ code: 'ok' })),
      delete: vi.fn(async (): Promise<SaveResultPayload> => ({ code: 'ok' })),
      status: vi.fn(
        async (): Promise<SaveResultPayload> => ({
          code: 'ok',
          status: { available: true, loggedIn: true, hasSave: true },
        }),
      ),
    };
  }

  it('delegates save operations to the injected adapter and replies with saveResult', async () => {
    const saveAdapter = makeAdapter();
    const bridge = new GameBridge({
      iframe,
      gameOrigin: 'https://games.example.com',
      playerSummary: null,
      saveAdapter,
    });
    send('https://games.example.com', makeEnvelope('ready'));
    await flush();

    send(
      'https://games.example.com',
      makeEnvelope('saveSet', { data: { level: 3 }, schemaVersion: 2, important: true }, 'r1'),
    );
    await flush();

    expect(saveAdapter.set).toHaveBeenCalledWith({ level: 3 }, 2, true);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'saveResult', requestId: 'r1', payload: { code: 'ok' } }),
      'https://games.example.com',
    );
    bridge.destroy();
  });

  it('returns auth_required and fires the CTA hook for a guest save (no adapter)', async () => {
    const onGuestSaveAttempt = vi.fn();
    const bridge = new GameBridge({
      iframe,
      gameOrigin: 'https://games.example.com',
      playerSummary: null,
      events: { onGuestSaveAttempt },
    });
    send('https://games.example.com', makeEnvelope('ready'));
    await flush();

    send('https://games.example.com', makeEnvelope('saveSet', { data: { level: 1 } }, 'r2'));
    await flush();

    expect(onGuestSaveAttempt).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'saveResult',
        requestId: 'r2',
        payload: { code: 'auth_required' },
      }),
      'https://games.example.com',
    );
    bridge.destroy();
  });

  it('ignores save messages from an unexpected origin', async () => {
    const saveAdapter = makeAdapter();
    const bridge = new GameBridge({
      iframe,
      gameOrigin: 'https://games.example.com',
      playerSummary: null,
      saveAdapter,
    });
    send('https://games.example.com', makeEnvelope('ready'));
    await flush();
    postMessage.mockClear();

    send('https://evil.example', makeEnvelope('saveSet', { data: { hacked: true } }, 'r3'));
    await flush();

    expect(saveAdapter.set).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    bridge.destroy();
  });

  it('round-trips a local-save request (guest-save transfer)', async () => {
    const onLocalSaveAvailable = vi.fn();
    const bridge = new GameBridge({
      iframe,
      gameOrigin: 'https://games.example.com',
      playerSummary: null,
      events: { onLocalSaveAvailable },
    });
    send('https://games.example.com', makeEnvelope('ready'));
    await flush();

    send(
      'https://games.example.com',
      makeEnvelope('localSaveAvailable', { has: true, schemaVersion: 2 }),
    );
    await flush();
    expect(onLocalSaveAvailable).toHaveBeenCalledWith({ has: true, schemaVersion: 2 });

    const promise = bridge.requestLocalSave(1000);
    const call = postMessage.mock.calls.find(
      ([m]) => (m as { type?: string }).type === 'requestLocalSave',
    );
    expect(call).toBeTruthy();
    const requestId = (call![0] as { requestId: string }).requestId;

    send(
      'https://games.example.com',
      makeEnvelope('localSaveProvided', { data: { level: 9 }, schemaVersion: 2 }, requestId),
    );
    const result = await promise;
    expect(result).toEqual({ data: { level: 9 }, schemaVersion: 2 });
    bridge.destroy();
  });
});
