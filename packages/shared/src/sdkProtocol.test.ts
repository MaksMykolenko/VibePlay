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

  // --- cloud-save message types --------------------------------------------

  it('accepts save request messages (get/set/delete/status)', () => {
    expect(parseGameMessage(makeEnvelope('saveGet', undefined, 'r1'))?.type).toBe('saveGet');
    expect(parseGameMessage(makeEnvelope('saveDelete', undefined, 'r2'))?.type).toBe('saveDelete');
    expect(parseGameMessage(makeEnvelope('saveStatus', undefined, 'r3'))?.type).toBe('saveStatus');
    expect(
      parseGameMessage(makeEnvelope('saveSet', { data: { level: 1 }, schemaVersion: 2 }, 'r4'))
        ?.type,
    ).toBe('saveSet');
  });

  it('does NOT size-limit saveSet data at the protocol layer (the API caps bytes)', () => {
    const big = { blob: 'x'.repeat(50_000) };
    expect(parseGameMessage(makeEnvelope('saveSet', { data: big }))?.type).toBe('saveSet');
    // but a malformed saveSet (no data) is rejected
    expect(parseGameMessage(makeEnvelope('saveSet', { schemaVersion: 1 }))).toBeNull();
  });

  it('validates saveResult code and status shape', () => {
    expect(
      parseHostMessage(makeEnvelope('saveResult', { code: 'ok', data: { a: 1 } }, 'r1'))?.type,
    ).toBe('saveResult');
    expect(
      parseHostMessage(
        makeEnvelope(
          'saveResult',
          { code: 'ok', status: { available: true, loggedIn: false, hasSave: false } },
          'r2',
        ),
      )?.type,
    ).toBe('saveResult');
    // unknown code rejected
    expect(parseHostMessage(makeEnvelope('saveResult', { code: 'kaboom' }, 'r3'))).toBeNull();
    // malformed status rejected
    expect(
      parseHostMessage(
        makeEnvelope('saveResult', { code: 'ok', status: { available: 'yes' } }, 'r4'),
      ),
    ).toBeNull();
  });

  it('validates guest-save transfer + progress messages', () => {
    expect(
      parseGameMessage(makeEnvelope('localSaveAvailable', { has: true, schemaVersion: 2 }))?.type,
    ).toBe('localSaveAvailable');
    expect(parseGameMessage(makeEnvelope('localSaveAvailable', { has: 'nope' }))).toBeNull();
    expect(
      parseGameMessage(
        makeEnvelope('localSaveProvided', { data: { x: 1 }, schemaVersion: 2 }, 'r1'),
      )?.type,
    ).toBe('localSaveProvided');
    expect(parseHostMessage(makeEnvelope('requestLocalSave', undefined, 'r2'))?.type).toBe(
      'requestLocalSave',
    );
    expect(parseGameMessage(makeEnvelope('progress', { kind: 'level_up' }))?.type).toBe('progress');
    expect(parseGameMessage(makeEnvelope('progress', { kind: 'x'.repeat(65) }))).toBeNull();
  });

  it('accepts only privacy-safe SDK analytics messages', () => {
    expect(parseGameMessage(makeEnvelope('analyticsReady'))?.type).toBe('analyticsReady');
    expect(
      parseGameMessage(makeEnvelope('analyticsError', { code: 'sdk_timeout', label: 'startup' }))
        ?.type,
    ).toBe('analyticsError');
    expect(
      parseGameMessage(
        makeEnvelope('analyticsCustomEvent', {
          name: 'level_started',
          value: 2,
          label: 'level_2',
        }),
      )?.type,
    ).toBe('analyticsCustomEvent');
    expect(
      parseGameMessage(
        makeEnvelope('analyticsCustomEvent', {
          name: 'level_started',
          nested: { email: 'private@example.com' },
        }),
      ),
    ).toBeNull();
    expect(
      parseGameMessage(makeEnvelope('analyticsError', { code: 'sdk_timeout', stack: 'raw stack' })),
    ).toBeNull();
  });

  // --- multiplayer room message types --------------------------------------

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

  it('accepts game→host room requests (context/token/leave)', () => {
    expect(parseGameMessage(makeEnvelope('requestRoomContext', undefined, 'r1'))?.type).toBe(
      'requestRoomContext',
    );
    expect(parseGameMessage(makeEnvelope('requestRoomToken', undefined, 'r2'))?.type).toBe(
      'requestRoomToken',
    );
    expect(parseGameMessage(makeEnvelope('roomLeave'))?.type).toBe('roomLeave');
  });

  it('validates host→game roomContext payload (and allows null = no room)', () => {
    expect(parseHostMessage(makeEnvelope('roomContext', roomContext))?.type).toBe('roomContext');
    expect(parseHostMessage(makeEnvelope('roomContext', null))?.type).toBe('roomContext');
    // Missing required fields / wrong types are rejected.
    expect(parseHostMessage(makeEnvelope('roomContext', { roomId: 'x' }))).toBeNull();
    expect(
      parseHostMessage(makeEnvelope('roomContext', { ...roomContext, isHost: 'yes' })),
    ).toBeNull();
    // Oversized token rejected.
    expect(
      parseHostMessage(makeEnvelope('roomContext', { ...roomContext, token: 'x'.repeat(9000) })),
    ).toBeNull();
  });

  it('validates host→game roomTokenResult payload', () => {
    const ok = { token: 't', expiresAt: '2030-01-01T00:00:00.000Z', wsUrl: null, transport: 'x' };
    expect(parseHostMessage(makeEnvelope('roomTokenResult', ok, 'r1'))?.type).toBe(
      'roomTokenResult',
    );
    expect(parseHostMessage(makeEnvelope('roomTokenResult', null, 'r2'))?.type).toBe(
      'roomTokenResult',
    );
    expect(parseHostMessage(makeEnvelope('roomTokenResult', { token: 123 }, 'r3'))).toBeNull();
  });
});
