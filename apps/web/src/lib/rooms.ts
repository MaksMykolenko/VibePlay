import type {
  GameMultiplayerDto,
  RoomContextPayload,
  RoomDto,
  RoomPlayerDto,
  RoomTokenResponseDto,
} from '@vibeplay/shared';
import { isApiError } from './api/errors';

/**
 * Pure, testable helpers for the multiplayer-room UI. Components stay thin: all
 * the "which buttons / what state / build the context" logic lives here so it can
 * be unit-tested without rendering (matching the repo's renderToStaticMarkup +
 * pure-logic testing style).
 */

export interface MultiplayerUiInput {
  /** The game's catalog multiplayer flag (kept in sync with multiplayerEnabled). */
  multiplayer: boolean;
  /** Demo build has no backend — multiplayer is hidden entirely. */
  isDemo: boolean;
  /** Detailed metadata (present for owned/detail games; wsUrl owner/admin-only). */
  info?: GameMultiplayerDto;
  /** Whether the viewer is the game's owner or an admin. */
  isOwnerOrAdmin: boolean;
}

export interface MultiplayerUi {
  showPlayWithFriends: boolean;
  showQuickPlay: boolean;
  /** Owner/admin-only heads-up: external multiplayer with no server URL configured. */
  ownerWsWarning: boolean;
}

/** Decide which multiplayer affordances to show on the game page. */
export function multiplayerUi(input: MultiplayerUiInput): MultiplayerUi {
  const enabled = !input.isDemo && input.multiplayer === true;
  const info = input.info;
  // Quick Play stays hidden unless the creator explicitly declared a quick-play
  // mode (spec: "only if metadata/mode supports it or keep it hidden for now").
  const showQuickPlay =
    enabled && Array.isArray(info?.modes) && info.modes.includes('quick_play');
  // External multiplayer needs a server URL; warn the owner/admin only (never a
  // normal player) when it's missing so they can finish configuration.
  const ownerWsWarning =
    input.isOwnerOrAdmin &&
    !!info &&
    info.enabled &&
    info.transport === 'EXTERNAL_WS' &&
    !info.wsUrl;
  return { showPlayWithFriends: enabled, showQuickPlay, ownerWsWarning };
}

export interface LobbyView {
  /** The viewer's own membership row (resolved server-side via isYou), or null. */
  me: RoomPlayerDto | null;
  isMember: boolean;
  isHost: boolean;
  isWaiting: boolean;
  isActive: boolean;
  isClosed: boolean;
  isFull: boolean;
  /** Host may start only while WAITING. */
  canStart: boolean;
}

/** Derive lobby UI state from the room + the server-resolved viewer (isYou). */
export function deriveLobbyView(room: RoomDto): LobbyView {
  const me = room.players.find((p) => p.isYou) ?? null;
  const isWaiting = room.status === 'WAITING';
  const isActive = room.status === 'ACTIVE';
  const isClosed = room.status === 'FINISHED' || room.status === 'EXPIRED';
  const isHost = me?.isHost ?? false;
  return {
    me,
    isMember: me !== null,
    isHost,
    isWaiting,
    isActive,
    isClosed,
    isFull: room.playerCount >= room.maxPlayers,
    canStart: isHost && isWaiting,
  };
}

/**
 * Build the RoomContext the Play Page hands to the game iframe. `versionId` is
 * left null here — the authoritative version is carried (signed) inside the room
 * token; the client never needs to assert it.
 */
export function buildRoomContext(
  room: RoomDto,
  me: RoomPlayerDto,
  token: RoomTokenResponseDto,
): RoomContextPayload {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    gameId: room.game.id,
    versionId: null,
    playerId: me.playerId,
    playerName: me.displayName,
    playerAvatarUrl: me.avatarUrl,
    isHost: me.isHost,
    maxPlayers: room.maxPlayers,
    mode: room.mode,
    transport: token.transport,
    wsUrl: token.wsUrl,
    token: token.token,
    expiresAt: token.expiresAt,
  };
}

/** Map a room API error to a friendly i18n key. */
export function roomErrorKey(err: unknown): string {
  if (isApiError(err, 'ROOM_NOT_FOUND')) return 'rooms.errorNotFound';
  if (isApiError(err, 'ROOM_FULL')) return 'rooms.errorFull';
  if (isApiError(err, 'ROOM_NOT_JOINABLE')) return 'rooms.errorClosed';
  if (isApiError(err, 'FORBIDDEN')) return 'rooms.errorForbidden';
  if (isApiError(err, 'NETWORK_ERROR')) return 'rooms.errorNetwork';
  return 'rooms.errorGeneric';
}

/** Build the absolute invite URL for a room code (uses the current origin). */
export function inviteUrlFor(roomCode: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/rooms/${roomCode}`;
}
