import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import { GAME_SAVE_MAX_BYTES } from '@vibeplay/shared';
import {
  authed,
  buildTestApp,
  createUser,
  loginAs,
  resetDb,
  type AuthedAgent,
} from '../test/helpers.js';

/**
 * Cloud saves (spec Phase 1 / Phase 7). Verifies auth, ownership isolation,
 * validation (size + shape + depth), upsert semantics, and typed errors.
 */
describe('cloud saves', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let other: Awaited<ReturnType<typeof createUser>>;
  let ownerAgent: AuthedAgent;
  let otherAgent: AuthedAgent;
  let gameId: string;

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
    const env = app.env;
    const creator = await createUser(prisma, env, {
      email: 'creator@example.com',
      username: 'creator_a',
      role: 'CREATOR',
    });
    [owner, other] = await Promise.all([
      createUser(prisma, env, { email: 'owner@example.com', username: 'player_owner' }),
      createUser(prisma, env, { email: 'other@example.com', username: 'player_other' }),
    ]);
    [ownerAgent, otherAgent] = await Promise.all([
      loginAs(app, owner.email),
      loginAs(app, other.email),
    ]);
    const game = await prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: 'Save Test Game',
        shortDescription: 'A game with cloud saves.',
        description: 'For testing cloud saves.',
        category: 'Arcade',
      },
    });
    gameId = game.id;
  });

  const put = (agent: AuthedAgent, id: string, body: unknown) =>
    app.inject({ method: 'PUT', url: `/api/me/game-saves/${id}`, ...authed(agent), payload: body });
  const get = (agent: AuthedAgent, id: string) =>
    app.inject({ method: 'GET', url: `/api/me/game-saves/${id}`, cookies: agent.cookies });
  const del = (agent: AuthedAgent, id: string) =>
    app.inject({ method: 'DELETE', url: `/api/me/game-saves/${id}`, ...authed(agent) });

  // ---- auth ----------------------------------------------------------------

  it('rejects unauthenticated GET/PUT/DELETE with 401', async () => {
    const g = await app.inject({ method: 'GET', url: `/api/me/game-saves/${gameId}` });
    expect(g.statusCode).toBe(401);
    const p = await app.inject({
      method: 'PUT',
      url: `/api/me/game-saves/${gameId}`,
      payload: { data: { level: 1 } },
    });
    expect(p.statusCode).toBe(401);
    const d = await app.inject({ method: 'DELETE', url: `/api/me/game-saves/${gameId}` });
    expect(d.statusCode).toBe(401);

    const list = await app.inject({ method: 'GET', url: '/api/me/game-saves' });
    expect(list.statusCode).toBe(401);
  });

  // ---- CRUD ----------------------------------------------------------------

  it('lets a user create, read, update, and delete their own save', async () => {
    // 404 before anything exists
    expect((await get(ownerAgent, gameId)).statusCode).toBe(404);

    // create
    const created = await put(ownerAgent, gameId, {
      data: { level: 4, coins: 120, inventory: ['burger', 'cola'] },
      schemaVersion: 2,
    });
    expect(created.statusCode, created.body).toBe(200);
    const createdSave = created.json().save;
    expect(createdSave.gameId).toBe(gameId);
    expect(createdSave.schemaVersion).toBe(2);
    expect(createdSave.data).toEqual({ level: 4, coins: 120, inventory: ['burger', 'cola'] });
    expect(createdSave.sizeBytes).toBeGreaterThan(0);
    expect(typeof createdSave.dataHash).toBe('string');

    // read
    const read = await get(ownerAgent, gameId);
    expect(read.statusCode).toBe(200);
    expect(read.json().save.data).toEqual({ level: 4, coins: 120, inventory: ['burger', 'cola'] });

    // list
    const list = await app.inject({
      method: 'GET',
      url: '/api/me/game-saves',
      cookies: ownerAgent.cookies,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().saves).toHaveLength(1);
    expect(list.json().saves[0]).not.toHaveProperty('data'); // metadata only

    // delete
    const deleted = await del(ownerAgent, gameId);
    expect(deleted.statusCode).toBe(200);
    expect((await get(ownerAgent, gameId)).statusCode).toBe(404);
    // second delete → 404 (nothing to remove)
    expect((await del(ownerAgent, gameId)).statusCode).toBe(404);
  });

  it('upserts by (userId, gameId) — a second PUT updates the same row', async () => {
    await put(ownerAgent, gameId, { data: { level: 1 } });
    const first = (await get(ownerAgent, gameId)).json().save;

    const updated = await put(ownerAgent, gameId, { data: { level: 2 } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().save.data).toEqual({ level: 2 });
    expect(updated.json().save.dataHash).not.toBe(first.dataHash);

    // exactly one row persisted for this (user, game)
    const count = await prisma.gameSave.count({ where: { userId: owner.id, gameId } });
    expect(count).toBe(1);
  });

  // ---- ownership isolation -------------------------------------------------

  it('never lets one user read or overwrite another user’s save', async () => {
    await put(ownerAgent, gameId, { data: { secret: 'owners-progress' } });

    // other user sees no save for the same game
    expect((await get(otherAgent, gameId)).statusCode).toBe(404);

    // other user writes their OWN save for the same game — a separate row
    const otherPut = await put(otherAgent, gameId, { data: { mine: true } });
    expect(otherPut.statusCode).toBe(200);

    // owner's save is untouched
    expect((await get(ownerAgent, gameId)).json().save.data).toEqual({ secret: 'owners-progress' });

    // and the other user can't delete the owner's row (only their own)
    await del(otherAgent, gameId);
    expect((await get(ownerAgent, gameId)).statusCode).toBe(200);

    const rows = await prisma.gameSave.findMany({ where: { gameId } });
    expect(rows.map((r) => r.userId).sort()).toEqual([owner.id].sort()); // other's was deleted, owner's remains
  });

  // ---- validation ----------------------------------------------------------

  it('rejects a save larger than the size limit with 413', async () => {
    const big = { blob: 'x'.repeat(GAME_SAVE_MAX_BYTES + 1024) };
    const res = await put(ownerAgent, gameId, { data: big });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects non-object/scalar save data with 422 SAVE_INVALID', async () => {
    const res = await put(ownerAgent, gameId, { data: 42 });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('SAVE_INVALID');
  });

  it('rejects excessively deep nesting with 422 SAVE_INVALID', async () => {
    // Build nesting deeper than GAME_SAVE_MAX_DEPTH (24).
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 60; i += 1) deep = { child: deep };
    const res = await put(ownerAgent, gameId, { data: deep });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('SAVE_INVALID');
  });

  it('returns 404 GAME_NOT_FOUND when saving for a non-existent game', async () => {
    const res = await put(ownerAgent, 'cmgnonexistentgame00000', { data: { level: 1 } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('GAME_NOT_FOUND');
  });
});

// Rate limiting needs the limiter ACTIVE (it is disabled by default in tests).
describe('cloud save rate limiting', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let agent: AuthedAgent;
  let gameId: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_TESTS = 'true'; // activate the in-memory limiter
    const ctx = await buildTestApp({});
    app = ctx.app;
    prisma = ctx.prisma;
    await resetDb(prisma);
    const env = app.env;
    const creator = await createUser(prisma, env, {
      email: 'rl-creator@example.com',
      username: 'rl_creator',
      role: 'CREATOR',
    });
    const user = await createUser(prisma, env, { email: 'rl@example.com', username: 'rl_user' });
    agent = await loginAs(app, user.email);
    const game = await prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: `rl-${Date.now()}`,
        title: 'RL Game',
        shortDescription: 'rate limit game',
        description: 'rate limit game',
        category: 'Arcade',
      },
    });
    gameId = game.id;
  });

  afterAll(async () => {
    await app.close();
    delete process.env.RATE_LIMIT_TESTS;
  });

  it('returns 429 once the per-minute write budget is exceeded', async () => {
    // Policy: gameSaveWrite = 30 / minute. The 31st write should be limited.
    let limited = false;
    for (let i = 0; i < 40; i += 1) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/me/game-saves/${gameId}`,
        ...authed(agent),
        payload: { data: { i } },
      });
      if (res.statusCode === 429) {
        limited = true;
        expect(res.json().error.code).toBe('RATE_LIMITED');
        break;
      }
      expect(res.statusCode).toBe(200);
    }
    expect(limited).toBe(true);
  });
});
