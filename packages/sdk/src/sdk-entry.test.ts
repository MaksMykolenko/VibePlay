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
