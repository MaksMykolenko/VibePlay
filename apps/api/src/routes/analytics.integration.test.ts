import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import { RATE_LIMIT_POLICIES } from '../lib/rateLimit.js';
import {
  authed,
  buildTestApp,
  createUser,
  loginAs,
  resetDb,
  type AuthedAgent,
} from '../test/helpers.js';

describe('first-party analytics collector', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let creator: Awaited<ReturnType<typeof createUser>>;
  let player: Awaited<ReturnType<typeof createUser>>;
  let creatorAgent: AuthedAgent;
  let playerAgent: AuthedAgent;
  let game: { id: string; slug: string };
  let version: { id: string };
  let guestPlaySessionId: string;
  let playerPlaySessionId: string;

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
    [creator, player] = await Promise.all([
      createUser(prisma, app.env, {
        email: 'event-creator@example.com',
        username: 'event_creator',
        role: 'CREATOR',
      }),
      createUser(prisma, app.env, {
        email: 'event-player@example.com',
        username: 'event_player',
      }),
    ]);
    [creatorAgent, playerAgent] = await Promise.all([
      loginAs(app, creator.email),
      loginAs(app, player.email),
    ]);
    game = await prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: 'analytics-event-game',
        title: 'Analytics Event Game',
        shortDescription: 'A published game used for event collector tests.',
        description: 'A production-shaped game for privacy-safe analytics tests.',
        category: 'Arcade',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    version = await prisma.gameVersion.create({
      data: { gameId: game.id, version: '1.0.0', status: 'PUBLISHED' },
    });
    await prisma.game.update({
      where: { id: game.id },
      data: { publishedVersionId: version.id },
    });
    const [guestSession, playerSession] = await Promise.all([
      prisma.playSession.create({
        data: { gameId: game.id, gameVersionId: version.id },
      }),
      prisma.playSession.create({
        data: { gameId: game.id, gameVersionId: version.id, userId: player.id },
      }),
    ]);
    guestPlaySessionId = guestSession.id;
    playerPlaySessionId = playerSession.id;
  });

  const originHeaders = () => ({
    origin: app.env.WEB_ORIGIN,
    referer: `${app.env.WEB_ORIGIN}/play/x`,
  });

  it('accepts guest events and stores only server-derived safe fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics/events',
      headers: originHeaders(),
      payload: {
        type: 'play_heartbeat',
        context: {
          gameId: game.id,
          versionId: version.id,
          playSessionId: guestPlaySessionId,
        },
        metadata: { elapsedSeconds: 45 },
      },
    });
    expect(response.statusCode, response.body).toBe(202);
    expect(response.json()).toEqual({ accepted: 1 });
    const stored = await prisma.analyticsEvent.findFirstOrThrow();
    expect(stored).toMatchObject({
      type: 'play_heartbeat',
      gameId: game.id,
      versionId: version.id,
      userId: null,
      actorType: 'guest',
      source: 'PLAY_PAGE',
      metadata: { elapsedSeconds: 45 },
    });
    expect(stored).not.toHaveProperty('playSessionId');
  });

  it('attaches authenticated user identity server-side and rejects client identity fields', async () => {
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/analytics/events',
      ...authed(playerAgent),
      headers: { ...authed(playerAgent).headers, ...originHeaders() },
      payload: {
        type: 'sdk_ready',
        context: {
          gameId: game.id,
          versionId: version.id,
          playSessionId: playerPlaySessionId,
        },
      },
    });
    expect(accepted.statusCode, accepted.body).toBe(202);
    expect(await prisma.analyticsEvent.findFirst()).toMatchObject({
      userId: player.id,
      actorType: 'player',
    });

    const spoofed = await app.inject({
      method: 'POST',
      url: '/api/analytics/events',
      ...authed(playerAgent),
      headers: { ...authed(playerAgent).headers, ...originHeaders() },
      payload: {
        type: 'sdk_ready',
        context: {
          gameId: game.id,
          playSessionId: playerPlaySessionId,
        },
        userId: creator.id,
      },
    });
    expect(spoofed.statusCode).toBe(400);
  });

  it('rejects unknown events, nested/private metadata, oversized batches, and payloads', async () => {
    for (const payload of [
      { type: 'arbitrary_event', context: { gameId: game.id } },
      {
        type: 'game_custom_event',
        context: { gameId: game.id, playSessionId: guestPlaySessionId },
        metadata: { name: 'level_started', email: 'private@example.com' },
      },
      {
        type: 'sdk_error',
        context: { gameId: game.id, playSessionId: guestPlaySessionId },
        metadata: { code: 'runtime_error', stack: 'raw private stack' },
      },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/analytics/events',
        headers: originHeaders(),
        payload,
      });
      expect(response.statusCode).toBe(400);
    }

    const batch = await app.inject({
      method: 'POST',
      url: '/api/analytics/batch',
      headers: originHeaders(),
      payload: {
        events: Array.from({ length: 21 }, () => ({
          type: 'game_page_view',
          context: { gameId: game.id },
        })),
      },
    });
    expect(batch.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: 'POST',
      url: '/api/analytics/events',
      headers: { ...originHeaders(), 'content-type': 'application/json' },
      payload: JSON.stringify({ junk: 'x'.repeat(20_000) }),
    });
    expect(tooLarge.statusCode).toBe(413);
  });

  it('verifies play ownership, game/version context, and same-origin browser headers', async () => {
    const foreignSession = await app.inject({
      method: 'POST',
      url: '/api/analytics/events',
      ...authed(playerAgent),
      headers: { ...authed(playerAgent).headers, ...originHeaders() },
      payload: {
        type: 'sdk_ready',
        context: { gameId: game.id, playSessionId: guestPlaySessionId },
      },
    });
    expect(foreignSession.statusCode).toBe(403);

    const wrongVersion = await app.inject({
      method: 'POST',
      url: '/api/analytics/events',
      headers: originHeaders(),
      payload: {
        type: 'sdk_ready',
        context: {
          gameId: game.id,
          versionId: creator.id,
          playSessionId: guestPlaySessionId,
        },
      },
    });
    expect(wrongVersion.statusCode).toBe(400);

    const wrongOrigin = await app.inject({
      method: 'POST',
      url: '/api/analytics/events',
      headers: { origin: 'https://evil.example' },
      payload: { type: 'game_page_view', context: { gameId: game.id } },
    });
    expect(wrongOrigin.statusCode).toBe(403);
  });

  it('accepts bounded batches atomically', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics/batch',
      headers: originHeaders(),
      payload: {
        events: [
          { type: 'game_page_view', context: { gameId: game.id } },
          { type: 'game_launch_requested', context: { gameId: game.id } },
          {
            type: 'game_launch_failed',
            context: { gameId: game.id },
            metadata: { code: 'launch_request_failed' },
          },
        ],
      },
    });
    expect(response.statusCode, response.body).toBe(202);
    expect(response.json()).toEqual({ accepted: 3 });
    expect(await prisma.analyticsEvent.count()).toBe(3);
  });

  it('aggregates basic and gated advanced event insights for the owning creator', async () => {
    await prisma.analyticsEvent.createMany({
      data: [
        {
          type: 'game_launch_success',
          gameId: game.id,
          versionId: version.id,
          actorType: 'guest',
          source: 'PLAY_PAGE',
          metadata: {},
        },
        {
          type: 'game_launch_failed',
          gameId: game.id,
          versionId: version.id,
          actorType: 'guest',
          source: 'PLAY_PAGE',
          metadata: { code: 'iframe_load_failed' },
        },
        {
          type: 'play_session_started',
          gameId: game.id,
          versionId: version.id,
          actorType: 'guest',
          source: 'PLAY_PAGE',
          metadata: {},
        },
        {
          type: 'game_custom_event',
          gameId: game.id,
          versionId: version.id,
          actorType: 'guest',
          source: 'SDK',
          metadata: { name: 'level_started', value: 1 },
        },
      ],
    });

    const basic = await app.inject({
      method: 'GET',
      url: '/api/creator/analytics?range=7d',
      cookies: creatorAgent.cookies,
    });
    expect(basic.statusCode, basic.body).toBe(200);
    expect(basic.json().eventMetrics).toMatchObject({
      launchSuccesses: 1,
      launchFailures: 1,
      playsStarted: 1,
      topGamesByLaunch: [{ gameId: game.id, launches: 1 }],
    });
    expect(basic.json().advanced).toBeNull();

    await prisma.subscription.create({
      data: {
        userId: creator.id,
        stripeSubscriptionId: 'sub_event_analytics',
        stripeCustomerId: 'cus_event_analytics',
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    });
    const advanced = await app.inject({
      method: 'GET',
      url: '/api/creator/analytics?range=7d',
      cookies: creatorAgent.cookies,
    });
    expect(advanced.json().advanced.eventInsights).toMatchObject({
      launchSuccessRate: 50,
      launchFailureReasons: [{ code: 'iframe_load_failed', count: 1 }],
      customEvents: [{ name: 'level_started', count: 1 }],
    });
  });

  it('uses the dedicated collector rate-limit policy', async () => {
    expect(RATE_LIMIT_POLICIES.analyticsEvents).toEqual({ max: 120, timeWindow: '1 minute' });
    process.env.RATE_LIMIT_TESTS = 'true';
    const limitedContext = await buildTestApp({}, async () => {});
    try {
      let limited = false;
      for (let index = 0; index < 130; index += 1) {
        const response = await limitedContext.app.inject({
          method: 'POST',
          url: '/api/analytics/events',
          headers: {
            origin: limitedContext.env.WEB_ORIGIN,
            referer: `${limitedContext.env.WEB_ORIGIN}/play/x`,
          },
          payload: { type: 'game_page_view', context: { gameId: game.id } },
        });
        if (response.statusCode === 429) {
          limited = true;
          expect(response.json().error.code).toBe('RATE_LIMITED');
          break;
        }
      }
      expect(limited).toBe(true);
    } finally {
      await limitedContext.app.close();
      delete process.env.RATE_LIMIT_TESTS;
    }
  });
});
