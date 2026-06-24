import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import { verifyRoomToken } from '../lib/roomToken.js';
import { authed, buildTestApp, createUser, loginAs, resetDb } from '../test/helpers.js';

/**
 * VibePlay-owned multiplayer rooms (spec Phase 2 / Phase 8). Verifies guest + user
 * room creation, joining, capacity/expiry/finished rejection, host-only start,
 * host transfer on leave, signed/expiring room tokens, and metadata validation.
 */
describe('multiplayer rooms', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let creatorId: string;

  beforeAll(async () => {
    const ctx = await buildTestApp({}, async () => {});
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const creator = await createUser(prisma, app.env, {
      email: 'creator@example.com',
      username: 'creator_mp',
      role: 'CREATOR',
    });
    creatorId = creator.id;
  });

  // Create a PUBLISHED, multiplayer-enabled game with a published version.
  async function createMpGame(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; versionId: string }> {
    const game = await prisma.game.create({
      data: {
        creatorId,
        slug: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: 'Boxy Tanks',
        shortDescription: 'A multiplayer showcase game.',
        description: 'Server-authoritative tank arena.',
        category: 'Shooter',
        status: 'PUBLISHED',
        multiplayer: true,
        multiplayerEnabled: true,
        multiplayerTransport: 'EXTERNAL_WS',
        multiplayerWsUrl: 'wss://boxy.example.com',
        multiplayerMaxPlayers: 8,
        publishedAt: new Date(),
        ...overrides,
      },
    });
    const version = await prisma.gameVersion.create({
      data: { gameId: game.id, version: '1.0.0', status: 'PUBLISHED' },
    });
    await prisma.game.update({
      where: { id: game.id },
      data: { publishedVersionId: version.id },
    });
    return { id: game.id, versionId: version.id };
  }

  /** Extract a Set-Cookie value by name from an inject response. */
  function cookie(res: { cookies: { name: string; value: string }[] }, name: string): string {
    return res.cookies.find((c) => c.name === name)?.value ?? '';
  }
  function guestCookies(res: { cookies: { name: string; value: string }[] }): Record<string, string> {
    const v = cookie(res, 'vp_guest');
    return v ? { vp_guest: v } : {};
  }

  type InjectOpts = {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    payload?: unknown;
  };

  const createRoom = (gameId: string, opts: InjectOpts = {}) =>
    app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/rooms`,
      ...(opts.cookies ? { cookies: opts.cookies } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
      payload: opts.payload ?? {},
    });

  const joinRoom = (code: string, opts: InjectOpts = {}) =>
    app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      ...(opts.cookies ? { cookies: opts.cookies } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
      payload: opts.payload ?? {},
    });

  // ---- creation ------------------------------------------------------------

  it('lets a guest create a room (issues a guest cookie + host player)', async () => {
    const game = await createMpGame();
    const res = await createRoom(game.id, { payload: { displayName: 'Guest A' } });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.roomCode).toMatch(/^[A-Z0-9]{4,6}$/);
    expect(body.roomId).toBeTruthy();
    expect(body.inviteUrl).toContain(`/rooms/${body.roomCode}`);
    expect(body.isHost).toBe(true);
    expect(body.room.playerCount).toBe(1);
    expect(body.room.players[0].displayName).toBe('Guest A');
    expect(body.room.players[0].isHost).toBe(true);
    // A guest identity cookie was set and a Guest row created.
    expect(cookie(res, 'vp_guest')).toBeTruthy();
    expect(await prisma.guest.count()).toBe(1);
  });

  it('lets a logged-in user create a room as host', async () => {
    const game = await createMpGame();
    const user = await createUser(prisma, app.env, {
      email: 'host@example.com',
      username: 'host_user',
    });
    const agent = await loginAs(app, user.email);
    const res = await createRoom(game.id, { ...authed(agent) });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().isHost).toBe(true);
    expect(res.json().room.players[0].displayName).toBe(user.displayName);
    const room = await prisma.gameRoom.findFirst({ where: { gameId: game.id } });
    expect(room?.hostUserId).toBe(user.id);
  });

  it('rejects creating a room for a non-multiplayer game', async () => {
    const game = await createMpGame({ multiplayerEnabled: false, multiplayerTransport: 'NONE' });
    const res = await createRoom(game.id);
    expect(res.statusCode).toBe(409);
  });

  it('caps maxPlayers at the game’s declared maximum', async () => {
    const game = await createMpGame({ multiplayerMaxPlayers: 4 });
    // Within the global schema cap (16) but above the game's declared max (4):
    // the route clamps it down to the game's maximum.
    const res = await createRoom(game.id, { payload: { maxPlayers: 12 } });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().room.maxPlayers).toBe(4);
  });

  // ---- joining -------------------------------------------------------------

  it('lets a second player join by room code', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id, { payload: { displayName: 'Host' } });
    const code = host.json().roomCode;

    const join = await joinRoom(code, { payload: { displayName: 'Joiner' } });
    expect(join.statusCode, join.body).toBe(200);
    expect(join.json().isHost).toBe(false);
    expect(join.json().room.playerCount).toBe(2);

    const info = await app.inject({ method: 'GET', url: `/api/rooms/${code}` });
    expect(info.statusCode).toBe(200);
    expect(info.json().room.players).toHaveLength(2);
    expect(info.json().room.canJoin).toBe(true);
  });

  it('is idempotent when the same identity joins twice (no duplicate rows)', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id);
    const code = host.json().roomCode;
    const joinerCookies = guestCookies(await joinRoom(code, { payload: { displayName: 'J' } }));

    const second = await joinRoom(code, { cookies: joinerCookies });
    expect(second.statusCode).toBe(200);
    expect(second.json().room.playerCount).toBe(2);
    const players = await prisma.gameRoomPlayer.count({ where: { status: 'JOINED' } });
    expect(players).toBe(2);
  });

  it('cannot join a full room', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id, { payload: { maxPlayers: 2 } });
    const code = host.json().roomCode;
    await joinRoom(code, { payload: { displayName: 'P2' } }); // room now full (2/2)

    const third = await joinRoom(code, { payload: { displayName: 'P3' } });
    expect(third.statusCode).toBe(409);
    expect(third.json().error.code).toBe('ROOM_FULL');
  });

  it('cannot join an expired room', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id);
    const code = host.json().roomCode;
    await prisma.gameRoom.update({
      where: { roomCode: code },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const join = await joinRoom(code, { payload: { displayName: 'Late' } });
    expect(join.statusCode).toBe(409);
    expect(join.json().error.code).toBe('ROOM_NOT_JOINABLE');
  });

  it('cannot join a finished room', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id);
    const code = host.json().roomCode;
    await prisma.gameRoom.update({ where: { roomCode: code }, data: { status: 'FINISHED' } });
    const join = await joinRoom(code, { payload: { displayName: 'X' } });
    expect(join.statusCode).toBe(409);
    expect(join.json().error.code).toBe('ROOM_NOT_JOINABLE');
  });

  it('returns 404 for an unknown room code', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rooms/ZZZ999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ROOM_NOT_FOUND');
  });

  // ---- start ---------------------------------------------------------------

  it('lets the host start the room and returns a play URL', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id);
    const code = host.json().roomCode;
    const hostCookies = guestCookies(host);

    const start = await app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/start`,
      cookies: hostCookies,
    });
    expect(start.statusCode, start.body).toBe(200);
    expect(start.json().status).toBe('ACTIVE');
    expect(start.json().playUrl).toContain(`?room=${code}`);
    const room = await prisma.gameRoom.findUnique({ where: { roomCode: code } });
    expect(room?.status).toBe('ACTIVE');
  });

  it('does not let a non-host start the room', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id);
    const code = host.json().roomCode;
    const joinerCookies = guestCookies(await joinRoom(code, { payload: { displayName: 'J' } }));

    const start = await app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/start`,
      cookies: joinerCookies,
    });
    expect(start.statusCode).toBe(403);
    expect(start.json().error.code).toBe('FORBIDDEN');
  });

  // ---- leave / host transfer ----------------------------------------------

  it('transfers host to the next player when the host leaves', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id, { payload: { displayName: 'Host' } });
    const code = host.json().roomCode;
    const hostCookies = guestCookies(host);
    const joiner = await joinRoom(code, { payload: { displayName: 'Next' } });
    const nextPlayerId = joiner.json().playerId;

    const leave = await app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/leave`,
      cookies: hostCookies,
    });
    expect(leave.statusCode, leave.body).toBe(200);
    expect(leave.json().hostTransferredTo).toBe(nextPlayerId);

    const info = await app.inject({ method: 'GET', url: `/api/rooms/${code}` });
    expect(info.json().room.host?.playerId).toBe(nextPlayerId);
    expect(info.json().room.playerCount).toBe(1);
  });

  it('expires the room when the last player leaves', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id);
    const code = host.json().roomCode;
    const hostCookies = guestCookies(host);

    const leave = await app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/leave`,
      cookies: hostCookies,
    });
    expect(leave.statusCode).toBe(200);
    expect(leave.json().roomStatus).toBe('EXPIRED');
    const room = await prisma.gameRoom.findUnique({ where: { roomCode: code } });
    expect(room?.status).toBe('EXPIRED');
    expect(room?.playerCount).toBe(0);
  });

  // ---- token ---------------------------------------------------------------

  it('mints a signed, short-lived room token with the player’s claims', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id, { payload: { displayName: 'Host' } });
    const code = host.json().roomCode;
    const hostCookies = guestCookies(host);

    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/token`,
      cookies: hostCookies,
    });
    expect(res.statusCode, res.body).toBe(200);
    const { token, expiresAt, wsUrl, transport } = res.json();
    expect(wsUrl).toBe('wss://boxy.example.com');
    expect(transport).toBe('external_ws');
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const verified = verifyRoomToken(token, app.env.MULTIPLAYER_ROOM_TOKEN_SECRET);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.claims.roomCode).toBe(code);
    expect(verified.claims.gameId).toBe(game.id);
    expect(verified.claims.versionId).toBe(game.versionId);
    expect(verified.claims.isHost).toBe(true);
    expect(verified.claims.guestId).toBeTruthy();
    expect(verified.claims.userId).toBeNull();

    // The token is short-lived: verifying far in the future fails as expired.
    const future = Date.now() + 1_000 * 1000;
    const expired = verifyRoomToken(token, app.env.MULTIPLAYER_ROOM_TOKEN_SECRET, { nowMs: future });
    expect(expired.ok).toBe(false);
  });

  it('refuses a token to a non-member', async () => {
    const game = await createMpGame();
    const host = await createRoom(game.id);
    const code = host.json().roomCode;
    // A stranger with their own (different) guest cookie is not a member.
    const stranger = await createRoom(game.id); // gives us a fresh guest cookie
    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/token`,
      cookies: guestCookies(stranger),
    });
    expect(res.statusCode).toBe(403);
  });

  // ---- metadata validation (Phase 5) --------------------------------------

  it('validates multiplayer settings on the creator update endpoint', async () => {
    const game = await createMpGame({
      multiplayerEnabled: false,
      multiplayerTransport: 'NONE',
      multiplayerWsUrl: null,
    });
    const creatorAgent = await loginAs(app, 'creator@example.com');
    const patch = (payload: unknown) =>
      app.inject({
        method: 'PATCH',
        url: `/api/creator/games/${game.id}`,
        ...authed(creatorAgent),
        payload,
      });

    // Enabling EXTERNAL_WS with no URL → 422.
    const noUrl = await patch({ multiplayerEnabled: true, multiplayerTransport: 'EXTERNAL_WS' });
    expect(noUrl.statusCode).toBe(422);

    // A non-ws(s) URL → 422.
    const badProto = await patch({
      multiplayerEnabled: true,
      multiplayerTransport: 'EXTERNAL_WS',
      multiplayerWsUrl: 'http://insecure.example.com',
    });
    expect(badProto.statusCode).toBe(422);

    // A valid wss URL → 200.
    const ok = await patch({
      multiplayerEnabled: true,
      multiplayerTransport: 'EXTERNAL_WS',
      multiplayerWsUrl: 'wss://valid.example.com',
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const saved = await prisma.game.findUnique({ where: { id: game.id } });
    expect(saved?.multiplayerEnabled).toBe(true);
    expect(saved?.multiplayerWsUrl).toBe('wss://valid.example.com/');
  });
});
