import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import { buildTestApp, createUser, loginAs, resetDb, type AuthedAgent } from '../test/helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('creator analytics', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let creatorA: Awaited<ReturnType<typeof createUser>>;
  let creatorB: Awaited<ReturnType<typeof createUser>>;
  let player: Awaited<ReturnType<typeof createUser>>;
  let creatorAgent: AuthedAgent;
  let otherCreatorAgent: AuthedAgent;
  let playerAgent: AuthedAgent;

  beforeAll(async () => {
    const context = await buildTestApp({}, async () => {});
    app = context.app;
    prisma = context.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    [creatorA, creatorB, player] = await Promise.all([
      createUser(prisma, app.env, {
        email: 'analytics-a@example.com',
        username: 'analytics_a',
        role: 'CREATOR',
      }),
      createUser(prisma, app.env, {
        email: 'analytics-b@example.com',
        username: 'analytics_b',
        role: 'CREATOR',
      }),
      createUser(prisma, app.env, {
        email: 'analytics-player@example.com',
        username: 'analytics_player',
      }),
    ]);
    [creatorAgent, otherCreatorAgent, playerAgent] = await Promise.all([
      loginAs(app, creatorA.email),
      loginAs(app, creatorB.email),
      loginAs(app, player.email),
    ]);
  });

  async function createGame(
    creatorId: string,
    slug: string,
    status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' = 'PUBLISHED',
  ) {
    const game = await prisma.game.create({
      data: {
        creatorId,
        slug,
        title: slug.replaceAll('-', ' '),
        shortDescription: 'A game used to verify creator analytics.',
        description: 'Production-shaped creator analytics integration test game.',
        category: 'Arcade',
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
    });
    const version = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: '1.0.0',
        status: status === 'PUBLISHED' ? 'PUBLISHED' : 'READY_FOR_REVIEW',
      },
    });
    return { game, version };
  }

  function get(agent: AuthedAgent, range = '30d') {
    return app.inject({
      method: 'GET',
      url: `/api/creator/analytics?range=${range}`,
      cookies: agent.cookies,
    });
  }

  it('returns real owned counts, UTC daily buckets, sorted top games, and no private fields', async () => {
    const first = await createGame(creatorA.id, 'analytics-first');
    const second = await createGame(creatorA.id, 'analytics-second', 'PENDING_REVIEW');
    const other = await createGame(creatorB.id, 'analytics-private');
    const current = new Date(Date.now() - DAY_MS);
    const older = new Date(Date.now() - 100 * DAY_MS);

    await prisma.playSession.createMany({
      data: [
        {
          gameId: first.game.id,
          gameVersionId: first.version.id,
          startedAt: current,
          durationSeconds: 30,
          clientSessionId: 'must-not-leak-1',
        },
        {
          userId: player.id,
          gameId: first.game.id,
          gameVersionId: first.version.id,
          startedAt: current,
          durationSeconds: 90,
          clientSessionId: 'must-not-leak-2',
        },
        {
          gameId: second.game.id,
          gameVersionId: second.version.id,
          startedAt: current,
          durationSeconds: 60,
        },
        {
          gameId: first.game.id,
          gameVersionId: first.version.id,
          startedAt: older,
          durationSeconds: 120,
        },
        {
          gameId: other.game.id,
          gameVersionId: other.version.id,
          startedAt: current,
          durationSeconds: 999,
        },
      ],
    });
    await prisma.like.create({ data: { userId: player.id, gameId: first.game.id } });
    await prisma.comment.createMany({
      data: [
        { userId: player.id, gameId: first.game.id, body: 'Visible creator feedback.' },
        {
          userId: player.id,
          gameId: second.game.id,
          body: 'Hidden feedback.',
          status: 'HIDDEN',
        },
        { userId: player.id, gameId: other.game.id, body: 'Other creator feedback.' },
      ],
    });

    const response = await get(creatorAgent);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.range).toBe('30d');
    expect(body.summary).toMatchObject({
      totalGames: 2,
      publishedGames: 1,
      inModerationGames: 1,
      totalPlays: 4,
      playsInRange: 3,
      likes: 1,
      comments: 1,
      averageDurationSeconds: 60,
    });
    expect(body.timeseries).toHaveLength(30);
    expect(
      body.timeseries.find(
        (day: { date: string }) => day.date === current.toISOString().slice(0, 10),
      ),
    ).toEqual({
      date: current.toISOString().slice(0, 10),
      plays: 3,
    });
    expect(body.topGames.map((game: { gameId: string }) => game.gameId)).toEqual([
      first.game.id,
      second.game.id,
    ]);
    expect(body.advanced).toBeNull();
    expect(body.entitlements).toEqual({ creatorPlus: false, advancedAnalytics: false });

    const privateKeys = new Set([
      'email',
      'userId',
      'sessionId',
      'clientSessionId',
      'token',
      'objectKey',
      'data',
      'dataHash',
    ]);
    function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
      if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
      else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          keys.add(key);
          collectKeys(child, keys);
        }
      }
      return keys;
    }
    expect([...collectKeys(body)].filter((key) => privateKeys.has(key))).toEqual([]);
  });

  it('isolates each creator to games they own', async () => {
    const own = await createGame(creatorA.id, 'creator-a-game');
    const privateGame = await createGame(creatorB.id, 'creator-b-game');
    await prisma.playSession.createMany({
      data: [
        { gameId: own.game.id, gameVersionId: own.version.id },
        { gameId: privateGame.game.id, gameVersionId: privateGame.version.id },
        { gameId: privateGame.game.id, gameVersionId: privateGame.version.id },
      ],
    });

    const first = await get(creatorAgent);
    const second = await get(otherCreatorAgent);
    expect(first.json().summary.totalPlays).toBe(1);
    expect(first.json().topGames[0].gameId).toBe(own.game.id);
    expect(second.json().summary.totalPlays).toBe(2);
    expect(second.json().topGames[0].gameId).toBe(privateGame.game.id);
  });

  it('gates advanced analytics for free creators and enables real Plus aggregates', async () => {
    const game = await createGame(creatorA.id, 'plus-analytics');
    const current = new Date(Date.now() - DAY_MS);
    const prior = new Date(Date.now() - 40 * DAY_MS);
    await prisma.playSession.createMany({
      data: [
        {
          userId: player.id,
          gameId: game.game.id,
          gameVersionId: game.version.id,
          startedAt: prior,
          durationSeconds: 20,
        },
        {
          userId: player.id,
          gameId: game.game.id,
          gameVersionId: game.version.id,
          startedAt: current,
          durationSeconds: 40,
        },
        {
          gameId: game.game.id,
          gameVersionId: game.version.id,
          startedAt: current,
          durationSeconds: 100,
        },
      ],
    });
    await prisma.gameSave.create({
      data: {
        userId: player.id,
        gameId: game.game.id,
        data: { level: 2 },
        schemaVersion: 1,
        sizeBytes: 11,
        dataHash: 'private-save-hash',
      },
    });

    expect((await get(creatorAgent)).json().advanced).toBeNull();
    await prisma.subscription.create({
      data: {
        userId: creatorA.id,
        stripeSubscriptionId: 'sub_analytics_plus',
        stripeCustomerId: 'cus_analytics_plus',
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
      },
    });

    const response = await get(creatorAgent);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().entitlements).toEqual({ creatorPlus: true, advancedAnalytics: true });
    expect(response.json().advanced).toMatchObject({
      uniquePlayers: 1,
      loggedInPlays: 1,
      guestPlays: 1,
      returningPlayers: 1,
      cloudSaveUsers: 1,
      cloudSaveAdoptionPercent: 100,
      durationPercentiles: { p50Seconds: 40, p90Seconds: 100 },
    });
    expect(response.json().advanced.games[0]).toMatchObject({
      gameId: game.game.id,
      plays: 2,
      cloudSaveUsers: 1,
      versions: [{ versionId: game.version.id, version: '1.0.0', plays: 2 }],
    });
    expect(response.json().advanced.conversion.registrationCta).toBe('NOT_ENOUGH_INTERNAL_DATA');
  });

  it('lets admins and owners bypass Creator Plus gating', async () => {
    const [admin, owner] = await Promise.all([
      createUser(prisma, app.env, {
        email: 'analytics-admin@example.com',
        username: 'analytics_admin',
        role: 'ADMIN',
      }),
      createUser(prisma, app.env, {
        email: 'analytics-owner@example.com',
        username: 'analytics_owner',
        role: 'OWNER',
      }),
    ]);
    const [adminAgent, ownerAgent] = await Promise.all([
      loginAs(app, admin.email),
      loginAs(app, owner.email),
    ]);

    for (const agent of [adminAgent, ownerAgent]) {
      const response = await get(agent);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().entitlements).toEqual({
        creatorPlus: false,
        advancedAnalytics: true,
      });
      expect(response.json().advanced).not.toBeNull();
    }
  });

  it('rejects guests, players, suspended creators, and banned creators', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/creator/analytics?range=30d' })).statusCode,
    ).toBe(401);
    expect((await get(playerAgent)).statusCode).toBe(403);

    await prisma.user.update({ where: { id: creatorA.id }, data: { status: 'SUSPENDED' } });
    expect((await get(creatorAgent)).statusCode).toBe(403);
    await prisma.user.update({ where: { id: creatorA.id }, data: { status: 'BANNED' } });
    expect((await get(creatorAgent)).statusCode).toBe(403);
  });

  it('returns 400 for invalid ranges', async () => {
    const response = await get(creatorAgent, '365d');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns an honest empty response for a creator with no games or plays', async () => {
    const response = await get(creatorAgent, '7d');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().summary).toMatchObject({
      totalGames: 0,
      totalPlays: 0,
      playsInRange: 0,
      likes: 0,
      comments: 0,
      averageDurationSeconds: null,
    });
    expect(response.json().timeseries).toHaveLength(7);
    expect(response.json().timeseries.every((day: { plays: number }) => day.plays === 0)).toBe(
      true,
    );
    expect(response.json().topGames).toEqual([]);
  });
});
