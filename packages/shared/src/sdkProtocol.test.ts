import { describe, expect, it } from 'vitest';
import { SDK_PROTOCOL_VERSION, makeEnvelope, parseGameMessage, parseHostMessage } from './index.js';

describe('SDK protocol', () => {
  it('accepts a valid game message and rejects unknown or oversized payloads', () => {
    expect(parseGameMessage(makeEnvelope('playStarted'))?.type).toBe('playStarted');
    expect(parseGameMessage(makeEnvelope('executeArbitraryCode'))).toBeNull();
    expect(parseGameMessage(makeEnvelope('reportError', { message: 'x'.repeat(1001) }))).toBeNull();
  });

  it('rejects malformed envelopes and protocol downgrades', () => {
    expect(parseGameMessage(null)).toBeNull();
    expect(
      parseGameMessage({ vibeplay: true, v: SDK_PROTOCOL_VERSION - 1, type: 'ready' }),
    ).toBeNull();
    expect(parseHostMessage({ vibeplay: false, v: SDK_PROTOCOL_VERSION, type: 'init' })).toBeNull();
  });

  it('only accepts public player summary fields with bounded strings', () => {
    const message = makeEnvelope('playerSummary', {
      id: 'user-1',
      username: 'player',
      displayName: 'Player',
      avatarUrl: null,
    });
    expect(parseHostMessage(message)?.type).toBe('playerSummary');
    expect(
      parseHostMessage(
        makeEnvelope('playerSummary', {
          id: 'user-1',
          username: 'player',
          displayName: 'x'.repeat(101),
          avatarUrl: null,
        }),
      ),
    ).toBeNull();
  });
});
