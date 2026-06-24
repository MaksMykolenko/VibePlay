import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, type GameRoom, type MultiplayerTransport } from '@vibeplay/database';
import {
  ROOM_DEFAULT_MAX_PLAYERS,
  ROOM_DEFAULT_TTL_MINUTES,
  ROOM_MAX_PLAYERS_CAP,
  ROOM_MIN_MAX_PLAYERS,
  createRoomSchema,
  errors,
  generateRoomCode,
  joinRoomSchema,
  roomCodeParamSchema,
  sanitizeRoomDisplayName,
  type CreateRoomResponseDto,
  type JoinRoomResponseDto,
  type LeaveRoomResponseDto,
  type RoomDto,
  type RoomTokenResponseDto,
  type StartRoomResponseDto,
} from '@vibeplay/shared';
import { getOrCreateGuest, resolveGuest } from '../lib/guests.js';
import { rlPolicy } from '../lib/rateLimit.js';
import { ROOM_TOKEN_TTL_SECONDS, signRoomToken } from '../lib/roomToken.js';
import { toRoomDto, type RoomViewer, type RoomWithRelations } from '../lib/serializers.js';
import { parse } from '../lib/validate.js';

/**
 * VibePlay-owned multiplayer rooms (spec Phase 2). VibePlay owns the room
 * lifecycle, the short join code, and player identity (logged-in user OR signed
 * guest cookie). A game's external realtime server keys its live match by the
 * VibePlay roomCode and trusts ONLY the short-lived signed room token.
 *
 * Security invariants:
 * - guests act through a signed httpOnly cookie; they can only ever be room
 *   players/hosts, never VibePlay users;
 * - capacity, status, expiry and host-only actions are enforced server-side;
 * - room tokens are minted server-side, signed, short-lived, and never logged;
 * - public room views never leak user/guest ids, ws urls, or tokens.
 */

const GAME_ID_RE = /^[a-z0-9]{8,64}$/i;

const ROOM_INCLUDE = {
  game: { select: { id: true, slug: true, title: true, coverUrl: true } },
  players: true,
} as const;

/** Identity that can own a room membership row. Exactly one field is set. */
interface MemberIdentity {
  userId: string | null;
  guestId: string | null;
}

interface JoiningPlayer {
  identity: MemberIdentity;
  displayName: string;
  avatarUrl: string | null;
}

function transportString(t: MultiplayerTransport): string {
  if (t === 'EXTERNAL_WS') return 'external_ws';
  if (t === 'VIBEPLAY_SDK') return 'vibeplay_sdk';
  return 'none';
}

function defaultGuestName(guestId: string): string {
  return `Player ${guestId.slice(-4).toUpperCase()}`;
}

function isUniqueViolation(err: unknown, target: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    String((err.meta as { target?: string | string[] } | undefined)?.target ?? '').includes(target)
  );
}

export async function registerRoomRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env } = app;

  function requireActiveCaller(req: FastifyRequest): void {
    // Guests are always allowed; a logged-in but suspended/banned user is not.
    if (req.currentUser && req.currentUser.status !== 'ACTIVE') {
      throw errors.forbidden('Your account cannot perform this action');
    }
  }

  /** Identity for an EXISTING member (no guest creation). Null when anonymous. */
  async function existingIdentity(req: FastifyRequest): Promise<MemberIdentity | null> {
    if (req.currentUser) return { userId: req.currentUser.id, guestId: null };
    const guest = await resolveGuest(prisma, env, req);
    return guest ? { userId: null, guestId: guest.id } : null;
  }

  /** Identity + display info for a caller about to create/join (creates a guest). */
  async function joiningPlayer(
    req: FastifyRequest,
    reply: FastifyReply,
    requestedName: string | undefined,
  ): Promise<JoiningPlayer> {
    if (req.currentUser) {
      return {
        identity: { userId: req.currentUser.id, guestId: null },
        displayName: req.currentUser.displayName,
        avatarUrl: req.currentUser.avatarUrl,
      };
    }
    const cleanName = sanitizeRoomDisplayName(requestedName);
    const guest = await getOrCreateGuest(prisma, env, req, reply, cleanName);
    return {
      identity: { userId: null, guestId: guest.id },
      displayName: cleanName ?? guest.displayName ?? defaultGuestName(guest.id),
      avatarUrl: null,
    };
  }

  function viewerOf(identity: MemberIdentity | null): RoomViewer {
    return identity ? { userId: identity.userId, guestId: identity.guestId } : null;
  }

  function memberRow<T extends { userId: string | null; guestId: string | null }>(
    players: T[],
    identity: MemberIdentity,
  ): T | undefined {
    return players.find(
      (p) =>
        (identity.userId && p.userId === identity.userId) ||
        (identity.guestId && p.guestId === identity.guestId),
    );
  }

  /** Lazily flip a past-expiry WAITING/ACTIVE room to EXPIRED. */
  async function withExpiry(room: RoomWithRelations): Promise<RoomWithRelations> {
    const stale =
      (room.status === 'WAITING' || room.status === 'ACTIVE') &&
      room.expiresAt.getTime() <= Date.now();
    if (!stale) return room;
    return prisma.gameRoom.update({
      where: { id: room.id },
      data: { status: 'EXPIRED' },
      include: ROOM_INCLUDE,
    });
  }

  async function findRoom(roomCode: string): Promise<RoomWithRelations | null> {
    return prisma.gameRoom.findUnique({ where: { roomCode }, include: ROOM_INCLUDE });
  }

  // ── Create a room for a published, multiplayer-enabled game ────────────────
  app.post<{ Params: { gameId: string }; Body: unknown }>(
    '/games/:gameId/rooms',
    { config: { rateLimit: rlPolicy('roomCreate') } },
    async (req, reply) => {
      requireActiveCaller(req);
      const { gameId } = req.params;
      if (!GAME_ID_RE.test(gameId)) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
      const body = parse(createRoomSchema, req.body);

      const game = await prisma.game.findFirst({
        where: { id: gameId, status: 'PUBLISHED', publishedVersionId: { not: null } },
        select: {
          id: true,
          publishedVersionId: true,
          multiplayerEnabled: true,
          multiplayerMaxPlayers: true,
          multiplayerTransport: true,
          multiplayerWsUrl: true,
          multiplayerModes: true,
        },
      });
      if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
      if (!game.multiplayerEnabled || game.multiplayerTransport === 'NONE') {
        throw errors.conflict('Multiplayer is not enabled for this game');
      }

      // Cap requested size by the game's declared max and the global safety cap.
      const ceiling = Math.min(
        game.multiplayerMaxPlayers || ROOM_DEFAULT_MAX_PLAYERS,
        ROOM_MAX_PLAYERS_CAP,
      );
      const requested = body.maxPlayers ?? ceiling;
      const maxPlayers = Math.max(ROOM_MIN_MAX_PLAYERS, Math.min(requested, ceiling));

      const modes = Array.isArray(game.multiplayerModes)
        ? game.multiplayerModes.filter((m): m is string => typeof m === 'string')
        : [];
      const mode = sanitizeRoomDisplayName(body.mode) ?? modes[0] ?? 'free_for_all';
      const transport = transportString(game.multiplayerTransport);
      const wsUrl = game.multiplayerTransport === 'EXTERNAL_WS' ? game.multiplayerWsUrl : null;
      const expiresAt = new Date(Date.now() + ROOM_DEFAULT_TTL_MINUTES * 60_000);

      const host = await joiningPlayer(req, reply, body.displayName);

      let room: RoomWithRelations | null = null;
      for (let attempt = 0; attempt < 6 && !room; attempt++) {
        const roomCode = generateRoomCode();
        try {
          room = await prisma.gameRoom.create({
            data: {
              gameId: game.id,
              versionId: game.publishedVersionId,
              roomCode,
              status: 'WAITING',
              visibility: body.visibility ?? 'PRIVATE',
              hostUserId: host.identity.userId,
              hostGuestId: host.identity.guestId,
              maxPlayers,
              playerCount: 1,
              mode,
              transport,
              wsUrl,
              expiresAt,
              players: {
                create: [
                  {
                    userId: host.identity.userId,
                    guestId: host.identity.guestId,
                    displayName: host.displayName,
                    avatarUrl: host.avatarUrl,
                    isHost: true,
                    status: 'JOINED',
                  },
                ],
              },
            },
            include: ROOM_INCLUDE,
          });
        } catch (err) {
          if (isUniqueViolation(err, 'roomCode')) continue; // collision — retry
          throw err;
        }
      }
      if (!room) throw errors.conflict('Could not allocate a room code, please retry');

      const viewer = viewerOf(host.identity);
      const dto = toRoomDto(room, viewer);
      const hostPlayer = room.players.find((p) => p.isHost)!;
      const response: CreateRoomResponseDto = {
        roomId: room.id,
        roomCode: room.roomCode,
        inviteUrl: `${env.WEB_ORIGIN}/rooms/${room.roomCode}`,
        playerId: hostPlayer.id,
        isHost: true,
        room: dto,
      };
      reply.status(201).send(response);
    },
  );

  // ── Public room info by code ───────────────────────────────────────────────
  app.get<{ Params: { roomCode: string } }>('/rooms/:roomCode', async (req) => {
    const roomCode = parse(roomCodeParamSchema, req.params.roomCode);
    const found = await findRoom(roomCode);
    if (!found) throw errors.roomNotFound();
    const room = await withExpiry(found);
    const identity = await existingIdentity(req);
    const dto: RoomDto = toRoomDto(room, viewerOf(identity));
    return { room: dto };
  });

  // ── Join a room by code (logged-in user or guest) ──────────────────────────
  app.post<{ Params: { roomCode: string }; Body: unknown }>(
    '/rooms/:roomCode/join',
    { config: { rateLimit: rlPolicy('roomJoin') } },
    async (req, reply) => {
      requireActiveCaller(req);
      const roomCode = parse(roomCodeParamSchema, req.params.roomCode);
      const body = parse(joinRoomSchema, req.body);
      const found = await findRoom(roomCode);
      if (!found) throw errors.roomNotFound();
      const room = await withExpiry(found);

      const player = await joiningPlayer(req, reply, body.displayName);

      const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.gameRoom.findUnique({
          where: { id: room.id },
          include: { players: true },
        });
        if (!fresh) throw errors.roomNotFound();
        if (fresh.status === 'FINISHED' || fresh.status === 'EXPIRED') {
          throw errors.roomNotJoinable();
        }
        if (fresh.expiresAt.getTime() <= Date.now()) throw errors.roomNotJoinable();

        const existing = memberRow(fresh.players, player.identity);
        if (existing && existing.status === 'KICKED') {
          throw errors.forbidden('You have been removed from this room');
        }

        const joinedCount = fresh.players.filter((p) => p.status === 'JOINED').length;

        if (existing && existing.status === 'JOINED') {
          // Idempotent re-join: refresh display info only.
          const updated = await tx.gameRoomPlayer.update({
            where: { id: existing.id },
            data: { displayName: player.displayName, avatarUrl: player.avatarUrl },
          });
          return { playerId: updated.id, isHost: updated.isHost };
        }

        // New membership (or re-activating a LEFT row) needs free capacity.
        if (joinedCount >= fresh.maxPlayers) throw errors.roomFull();

        if (existing) {
          const updated = await tx.gameRoomPlayer.update({
            where: { id: existing.id },
            data: {
              status: 'JOINED',
              leftAt: null,
              displayName: player.displayName,
              avatarUrl: player.avatarUrl,
            },
          });
          await tx.gameRoom.update({
            where: { id: fresh.id },
            data: { playerCount: { increment: 1 } },
          });
          return { playerId: updated.id, isHost: updated.isHost };
        }

        const created = await tx.gameRoomPlayer.create({
          data: {
            roomId: fresh.id,
            userId: player.identity.userId,
            guestId: player.identity.guestId,
            displayName: player.displayName,
            avatarUrl: player.avatarUrl,
            isHost: false,
            status: 'JOINED',
          },
        });
        await tx.gameRoom.update({
          where: { id: fresh.id },
          data: { playerCount: { increment: 1 } },
        });
        return { playerId: created.id, isHost: false };
      });

      const refreshed = (await findRoom(roomCode))!;
      const response: JoinRoomResponseDto = {
        playerId: result.playerId,
        isHost: result.isHost,
        room: toRoomDto(refreshed, viewerOf(player.identity)),
      };
      return response;
    },
  );

  // ── Leave a room (host transfers; empty room expires) ──────────────────────
  app.post<{ Params: { roomCode: string } }>('/rooms/:roomCode/leave', async (req) => {
    const roomCode = parse(roomCodeParamSchema, req.params.roomCode);
    const identity = await existingIdentity(req);
    const found = await findRoom(roomCode);
    if (!found || !identity) throw errors.roomNotFound();

    const me = memberRow(found.players, identity);
    if (!me || me.status !== 'JOINED') throw errors.roomNotFound();

    const outcome = await prisma.$transaction(async (tx) => {
      await tx.gameRoomPlayer.update({
        where: { id: me.id },
        data: { status: 'LEFT', leftAt: new Date() },
      });
      const remaining = found.players
        .filter((p) => p.id !== me.id && p.status === 'JOINED')
        .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());

      if (remaining.length === 0) {
        // Last player left — retire the room and clear host pointers.
        const room = await tx.gameRoom.update({
          where: { id: found.id },
          data: { playerCount: 0, status: 'EXPIRED', hostUserId: null, hostGuestId: null },
        });
        return { hostTransferredTo: null as string | null, roomStatus: room.status };
      }

      let hostTransferredTo: string | null = null;
      const data: Prisma.GameRoomUpdateInput = { playerCount: { decrement: 1 } };
      if (me.isHost) {
        const next = remaining[0]!; // remaining.length > 0 checked above
        await tx.gameRoomPlayer.update({ where: { id: next.id }, data: { isHost: true } });
        data.hostUser = next.userId ? { connect: { id: next.userId } } : { disconnect: true };
        data.hostGuest = next.guestId ? { connect: { id: next.guestId } } : { disconnect: true };
        hostTransferredTo = next.id;
      }
      const room = await tx.gameRoom.update({ where: { id: found.id }, data });
      return { hostTransferredTo, roomStatus: room.status };
    });

    const response: LeaveRoomResponseDto = {
      ok: true,
      hostTransferredTo: outcome.hostTransferredTo,
      roomStatus: outcome.roomStatus,
    };
    return response;
  });

  // ── Start the room (host only) ─────────────────────────────────────────────
  app.post<{ Params: { roomCode: string } }>('/rooms/:roomCode/start', async (req) => {
    const roomCode = parse(roomCodeParamSchema, req.params.roomCode);
    const identity = await existingIdentity(req);
    const found = await findRoom(roomCode);
    if (!found || !identity) throw errors.roomNotFound();
    const room = await withExpiry(found);

    const me = memberRow(room.players, identity);
    if (!me || me.status !== 'JOINED' || !me.isHost) {
      throw errors.forbidden('Only the host can start the room');
    }
    if (room.status === 'FINISHED' || room.status === 'EXPIRED') {
      throw errors.roomNotJoinable('This room can no longer be started');
    }

    const updated =
      room.status === 'ACTIVE'
        ? room
        : await prisma.gameRoom.update({
            where: { id: room.id },
            data: { status: 'ACTIVE' },
            include: ROOM_INCLUDE,
          });

    const playUrl = `${env.WEB_ORIGIN}/play/${updated.game.slug}?room=${updated.roomCode}`;
    const response: StartRoomResponseDto = {
      status: updated.status,
      playUrl,
      room: toRoomDto(updated, viewerOf(identity)),
    };
    return response;
  });

  // ── Mint a short-lived signed room token for the current player ────────────
  app.post<{ Params: { roomCode: string } }>(
    '/rooms/:roomCode/token',
    { config: { rateLimit: rlPolicy('roomToken') } },
    async (req) => {
      const roomCode = parse(roomCodeParamSchema, req.params.roomCode);
      const identity = await existingIdentity(req);
      const found = await findRoom(roomCode);
      if (!found || !identity) throw errors.roomNotFound();
      const room = await withExpiry(found);

      const me = memberRow(room.players, identity);
      if (!me || me.status !== 'JOINED') throw errors.forbidden('You are not in this room');
      if (room.status === 'FINISHED' || room.status === 'EXPIRED') {
        throw errors.roomNotJoinable('This room is no longer active');
      }

      const issuedAt = Date.now();
      const token = signRoomToken(
        {
          roomId: room.id,
          roomCode: room.roomCode,
          gameId: room.gameId,
          versionId: room.versionId,
          playerId: me.id,
          userId: me.userId,
          guestId: me.guestId,
          displayName: me.displayName,
          isHost: me.isHost,
          transport: room.transport,
        },
        env.MULTIPLAYER_ROOM_TOKEN_SECRET,
        ROOM_TOKEN_TTL_SECONDS,
        issuedAt,
      );
      // Never log the token value (the logger also redacts *.token defensively).
      const response: RoomTokenResponseDto = {
        token,
        expiresAt: new Date(issuedAt + ROOM_TOKEN_TTL_SECONDS * 1000).toISOString(),
        wsUrl: room.wsUrl,
        transport: room.transport,
      };
      return response;
    },
  );
}

// Re-export the row type Prisma infers for the host-transfer update narrowing.
export type { GameRoom };
