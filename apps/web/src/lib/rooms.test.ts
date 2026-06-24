import { describe, expect, it } from 'vitest';
import type {
  GameMultiplayerDto,
  RoomDto,
  RoomPlayerDto,
  RoomTokenResponseDto,
} from '@vibeplay/shared';
import { ApiClientError } from './api/errors';
import {
  buildRoomContext,
  deriveLobbyView,
  inviteUrlFor,
  multiplayerUi,
  roomErrorKey,
} from './rooms';

function player(over: Partial<RoomPlayerDto> = {}): RoomPlayerDto {
  return {
    playerId: 'p1',
    displayName: 'Maks',
    avatarUrl: null,
    isHost: false,
    isYou: false,
    kind: 'guest',
    ...over,
  };
}

function room(over: Partial<RoomDto> = {}): RoomDto {
  return {
    roomId: 'room-1',
    roomCode: 'ABC123',
    status: 'WAITING',
    visibility: 'PRIVATE',
    mode: 'free_for_all',
    maxPlayers: 8,
    playerCount: 1,
    game: { id: 'game-1', slug: 'boxy', title: 'Boxy', coverUrl: null },
    host: null,
    players: [player({ isHost: true, isYou: true })],
    canJoin: true,
    expiresAt: '2030-01-01T00:00:00.000Z',
    createdAt: '2030-01-01T00:00:00.000Z',
    ...over,
  };
}

const info = (over: Partial<GameMultiplayerDto> = {}): GameMultiplayerDto => ({
  enabled: true,
  maxPlayers: 8,
  transport: 'EXTERNAL_WS',
  wsUrl: 'wss://boxy.example.com',
  modes: [],
  ...over,
});

describe('multiplayerUi', () => {
  it('shows Play with Friends only when multiplayer is enabled and not in demo', () => {
    expect(
      multiplayerUi({ multiplayer: true, isDemo: false, isOwnerOrAdmin: false }).showPlayWithFriends,
    ).toBe(true);
    expect(
      multiplayerUi({ multiplayer: false, isDemo: false, isOwnerOrAdmin: false })
        .showPlayWithFriends,
    ).toBe(false);
    // Demo build has no backend — hidden even when the flag is on.
    expect(
      multiplayerUi({ multiplayer: true, isDemo: true, isOwnerOrAdmin: false }).showPlayWithFriends,
    ).toBe(false);
  });

  it('shows Quick Play only when a quick_play mode is declared', () => {
    expect(
      multiplayerUi({
        multiplayer: true,
        isDemo: false,
        isOwnerOrAdmin: false,
        info: info({ modes: ['quick_play'] }),
      }).showQuickPlay,
    ).toBe(true);
    expect(
      multiplayerUi({ multiplayer: true, isDemo: false, isOwnerOrAdmin: false, info: info() })
        .showQuickPlay,
    ).toBe(false);
  });

  it('warns owner/admin only when external multiplayer has no server URL', () => {
    expect(
      multiplayerUi({
        multiplayer: true,
        isDemo: false,
        isOwnerOrAdmin: true,
        info: info({ wsUrl: null }),
      }).ownerWsWarning,
    ).toBe(true);
    // Normal players never see the warning.
    expect(
      multiplayerUi({
        multiplayer: true,
        isDemo: false,
        isOwnerOrAdmin: false,
        info: info({ wsUrl: null }),
      }).ownerWsWarning,
    ).toBe(false);
    // No warning once a URL is configured.
    expect(
      multiplayerUi({ multiplayer: true, isDemo: false, isOwnerOrAdmin: true, info: info() })
        .ownerWsWarning,
    ).toBe(false);
  });
});

describe('deriveLobbyView', () => {
  it('lets the host (isYou + isHost) start while WAITING', () => {
    const v = deriveLobbyView(room());
    expect(v.isMember).toBe(true);
    expect(v.isHost).toBe(true);
    expect(v.canStart).toBe(true);
  });

  it('does not let a non-host member start', () => {
    const r = room({
      players: [
        player({ playerId: 'h', isHost: true, isYou: false }),
        player({ playerId: 'me', isYou: true }),
      ],
    });
    const v = deriveLobbyView(r);
    expect(v.isMember).toBe(true);
    expect(v.isHost).toBe(false);
    expect(v.canStart).toBe(false);
  });

  it('detects full / closed / active rooms', () => {
    expect(deriveLobbyView(room({ maxPlayers: 2, playerCount: 2 })).isFull).toBe(true);
    expect(deriveLobbyView(room({ status: 'FINISHED' })).isClosed).toBe(true);
    expect(deriveLobbyView(room({ status: 'EXPIRED' })).isClosed).toBe(true);
    const active = deriveLobbyView(room({ status: 'ACTIVE' }));
    expect(active.isActive).toBe(true);
    expect(active.canStart).toBe(false); // can't start an already-active room
  });

  it('treats a viewer with no membership row as a non-member', () => {
    const r = room({ players: [player({ isHost: true, isYou: false })] });
    expect(deriveLobbyView(r).isMember).toBe(false);
  });
});

describe('buildRoomContext', () => {
  it('maps room + player + token into the SDK room context (versionId from token)', () => {
    const me = player({ playerId: 'p9', displayName: 'Maks', isHost: true, avatarUrl: null });
    const token: RoomTokenResponseDto = {
      token: 'signed.tok',
      expiresAt: '2030-01-01T00:02:00.000Z',
      wsUrl: 'wss://boxy.example.com',
      transport: 'external_ws',
    };
    const ctx = buildRoomContext(room({ roomCode: 'XYZ789' }), me, token);
    expect(ctx).toEqual({
      roomId: 'room-1',
      roomCode: 'XYZ789',
      gameId: 'game-1',
      versionId: null,
      playerId: 'p9',
      playerName: 'Maks',
      playerAvatarUrl: null,
      isHost: true,
      maxPlayers: 8,
      mode: 'free_for_all',
      transport: 'external_ws',
      wsUrl: 'wss://boxy.example.com',
      token: 'signed.tok',
      expiresAt: '2030-01-01T00:02:00.000Z',
    });
  });
});

describe('roomErrorKey', () => {
  it('maps room API error codes to friendly i18n keys', () => {
    expect(roomErrorKey(new ApiClientError('ROOM_NOT_FOUND', 'x', 404))).toBe('rooms.errorNotFound');
    expect(roomErrorKey(new ApiClientError('ROOM_FULL', 'x', 409))).toBe('rooms.errorFull');
    expect(roomErrorKey(new ApiClientError('ROOM_NOT_JOINABLE', 'x', 409))).toBe(
      'rooms.errorClosed',
    );
    expect(roomErrorKey(new ApiClientError('FORBIDDEN', 'x', 403))).toBe('rooms.errorForbidden');
    expect(roomErrorKey(new ApiClientError('NETWORK_ERROR', 'x', 0))).toBe('rooms.errorNetwork');
    expect(roomErrorKey(new Error('boom'))).toBe('rooms.errorGeneric');
  });
});

describe('inviteUrlFor', () => {
  it('builds an absolute invite URL from the origin and code', () => {
    expect(inviteUrlFor('ABC123', 'https://vibeplay.games')).toBe(
      'https://vibeplay.games/rooms/ABC123',
    );
    expect(inviteUrlFor('ABC123', 'https://vibeplay.games/')).toBe(
      'https://vibeplay.games/rooms/ABC123',
    );
  });
});
