import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnvelope } from '@vibeplay/shared/sdk-protocol';
import { VibePlayGameSdk } from './sdk-entry.js';

describe('VibePlayGameSdk analytics', () => {
  let gameWindow: EventTarget & { parent: { postMessage: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    const target = new EventTarget() as typeof gameWindow;
    target.parent = { postMessage: vi.fn() };
    gameWindow = target;
    vi.stubGlobal('window', gameWindow);
  });

  afterEach(() => vi.unstubAllGlobals());

  function initialize(sdk: VibePlayGameSdk): void {
    const event = new Event('message');
    Object.defineProperties(event, {
      origin: { value: 'https://vibeplay.example' },
      source: { value: gameWindow.parent },
      data: { value: makeEnvelope('init') },
    });
    gameWindow.dispatchEvent(event);
    expect(sdk.save.isAvailable()).toBe(true);
  }

  it('posts valid custom events to the locked parent origin', () => {
    const sdk = new VibePlayGameSdk();
    initialize(sdk);
    expect(
      sdk.analytics.trackCustomEvent({ name: 'level_started', value: 1, label: 'level_1' }),
    ).toBe(true);
    expect(gameWindow.parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'analyticsCustomEvent',
        payload: { name: 'level_started', value: 1, label: 'level_1' },
      }),
      'https://vibeplay.example',
    );
  });

  it('rejects arbitrary, nested, long, and private-looking custom metadata', () => {
    const sdk = new VibePlayGameSdk();
    initialize(sdk);
    gameWindow.parent.postMessage.mockClear();
    expect(
      sdk.analytics.trackCustomEvent({
        name: 'level_started',
        email: 'private@example.com',
      } as never),
    ).toBe(false);
    expect(sdk.analytics.trackCustomEvent({ name: 'level_started', label: 'x'.repeat(81) })).toBe(
      false,
    );
    expect(gameWindow.parent.postMessage).not.toHaveBeenCalled();
  });
});

describe('VibePlayGameSdk rooms', () => {
  let gameWindow: EventTarget & { parent: { postMessage: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    const target = new EventTarget() as typeof gameWindow;
    target.parent = { postMessage: vi.fn() };
    gameWindow = target;
    vi.stubGlobal('window', gameWindow);
  });

  afterEach(() => vi.unstubAllGlobals());

  const roomContext = {
    roomId: 'room-1',
    roomCode: 'ABC123',
    gameId: 'game-1',
    versionId: 'ver-1',
    playerId: 'player-1',
    playerName: 'Maks',
    playerAvatarUrl: null,
    isHost: true,
    maxPlayers: 8,
    mode: 'free_for_all',
    transport: 'external_ws',
    wsUrl: 'wss://boxy.example.com',
    token: 'signed.room.token',
    expiresAt: '2030-01-01T00:00:00.000Z',
  };

  function dispatch(data: unknown, origin = 'https://vibeplay.example'): void {
    const event = new Event('message');
    Object.defineProperties(event, {
      origin: { value: origin },
      source: { value: gameWindow.parent },
      data: { value: data },
    });
    gameWindow.dispatchEvent(event);
  }

  it('caches a pushed room context and notifies onContext listeners', async () => {
    const sdk = new VibePlayGameSdk();
    const seen: unknown[] = [];
    sdk.rooms.onContext((ctx) => seen.push(ctx));

    dispatch(makeEnvelope('init'));
    dispatch(makeEnvelope('roomContext', roomContext));

    expect(sdk.rooms.isAvailable()).toBe(true);
    expect(seen).toEqual([roomContext]);
    // getContext resolves from cache without another round-trip.
    await expect(sdk.rooms.getContext()).resolves.toEqual(roomContext);
  });

  it('onContext fires immediately when context already received', () => {
    const sdk = new VibePlayGameSdk();
    dispatch(makeEnvelope('init'));
    dispatch(makeEnvelope('roomContext', roomContext));
    const seen: unknown[] = [];
    sdk.rooms.onContext((ctx) => seen.push(ctx));
    expect(seen).toEqual([roomContext]);
  });

  it('requests a fresh token and resolves the correlated roomTokenResult', async () => {
    const sdk = new VibePlayGameSdk();
    dispatch(makeEnvelope('init'));

    const promise = sdk.rooms.getToken();
    const call = gameWindow.parent.postMessage.mock.calls.find(
      ([m]) => (m as { type?: string }).type === 'requestRoomToken',
    );
    expect(call).toBeTruthy();
    const requestId = (call![0] as { requestId: string }).requestId;
    const fresh = {
      token: 'fresh.token',
      expiresAt: '2030-01-01T00:02:00.000Z',
      wsUrl: 'wss://boxy.example.com',
      transport: 'external_ws',
    };
    dispatch(makeEnvelope('roomTokenResult', fresh, requestId));
    await expect(promise).resolves.toEqual(fresh);
  });

  it('isAvailable is false and getContext resolves null before any context', async () => {
    const sdk = new VibePlayGameSdk();
    dispatch(makeEnvelope('init'));
    dispatch(makeEnvelope('roomContext', null));
    expect(sdk.rooms.isAvailable()).toBe(false);
    await expect(sdk.rooms.getContext()).resolves.toBeNull();
  });
});
