import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import {
  authed,
  buildTestApp,
  createUser,
  loginAs,
  resetDb,
  type AuthedAgent,
} from '../test/helpers.js';

describe('core MVP routes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let creator: Awaited<ReturnType<typeof createUser>>;
  let otherCreator: Awaited<ReturnType<typeof createUser>>;
  let player: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let creatorAgent: AuthedAgent;
  let otherAgent: AuthedAgent;
  let playerAgent: AuthedAgent;
  let adminAgent: AuthedAgent;
  const queuedJobs: { uploadId: string; gameVersionId: string }[] = [];

  beforeAll(async () => {
    const ctx = await buildTestApp({}, async (job) => {
      queuedJobs.push(job);
    });
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    queuedJobs.length = 0;
    await resetDb(prisma);
    const env = app.env;
    [creator, otherCreator, player, admin] = await Promise.all([
      createUser(prisma, env, {
        email: 'creator@example.com',
        username: 'creator_one',
        role: 'CREATOR',
      }),
      createUser(prisma, env, {
        email: 'other@example.com',
        username: 'creator_two',
        role: 'CREATOR',
      }),
      createUser(prisma, env, {
        email: 'player@example.com',
        username: 'player_one',
      }),
      createUser(prisma, env, {
        email: 'admin@example.com',
        username: 'admin_one',
        role: 'ADMIN',
      }),
    ]);
    [creatorAgent, otherAgent, playerAgent, adminAgent] = await Promise.all([
      loginAs(app, creator.email),
      loginAs(app, otherCreator.email),
      loginAs(app, player.email),
      loginAs(app, admin.email),
    ]);
  });

  async function createGame(agent = creatorAgent): Promise<{ id: string; slug: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/creator/games',
      ...authed(agent),
      payload: {
        title: 'Integration Arcade',
        shortDescription: 'A complete integration test game.',
        description: 'This game exists to test creator and moderation routes end to end.',
        category: 'Arcade',
        tags: ['integration'],
        devices: ['desktop'],
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json().game;
  }

  it('enforces creator role and resource ownership', async () => {
    const playerCreate = await app.inject({
      method: 'POST',
      url: '/api/creator/games',
      ...authed(playerAgent),
      payload: {
        title: 'Forbidden Game',
        shortDescription: 'Players cannot create games.',
        description: 'This payload must be rejected by the creator role guard.',
        category: 'Arcade',
      },
    });
    expect(playerCreate.statusCode).toBe(403);

    const game = await createGame();
    const otherRead = await app.inject({
      method: 'GET',
      url: `/api/creator/games/${game.id}`,
      ...authed(otherAgent),
    });
    expect(otherRead.statusCode).toBe(403);
  });

  it('creates, updates, and reads creator games through PostgreSQL', async () => {
    const game = await createGame();
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      ...authed(creatorAgent),
      payload: { title: 'Updated Integration Arcade', tags: ['updated'] },
    });
    expect(update.statusCode, update.body).toBe(200);
    expect(update.json().game.title).toBe('Updated Integration Arcade');

    const mine = await app.inject({
      method: 'GET',
      url: '/api/creator/games',
      ...authed(creatorAgent),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().games).toHaveLength(1);
  });

  it('completes an fs quarantine upload and enqueues exactly one validation job', async () => {
    const game = await createGame();
    const versionRes = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${game.id}/versions`,
      ...authed(creatorAgent),
      payload: { version: '1.0.0' },
    });
    expect(versionRes.statusCode, versionRes.body).toBe(200);
    const versionId = versionRes.json().version.id as string;
    const zip = Buffer.from('PK\u0003\u0004integration-fixture');
    const sha256 = createHash('sha256').update(zip).digest('hex');

    const intent = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${game.id}/upload-intent`,
      ...authed(creatorAgent),
      payload: {
        versionId,
        fileName: 'game.zip',
        fileSize: zip.length,
        contentType: 'application/zip',
        sha256,
      },
    });
    expect(intent.statusCode, intent.body).toBe(200);
    const uploadId = intent.json().uploadId as string;

    const direct = await app.inject({
      method: 'PUT',
      url: `/api/uploads/${uploadId}/direct`,
      ...authed(creatorAgent),
      headers: {
        ...authed(creatorAgent).headers,
        'content-type': 'application/zip',
      },
      payload: zip,
    });
    expect(direct.statusCode, direct.body).toBe(204);

    const complete = await app.inject({
      method: 'POST',
      url: `/api/uploads/${uploadId}/complete`,
      ...authed(creatorAgent),
      payload: {},
    });
    expect(complete.statusCode, complete.body).toBe(200);
    expect(complete.json().versionStatus).toBe('QUARANTINED');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queuedJobs).toEqual([{ uploadId, gameVersionId: versionId }]);

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/uploads/${uploadId}/complete`,
      ...authed(creatorAgent),
      payload: {},
    });
    expect(duplicate.statusCode).toBe(409);
    expect(queuedJobs).toHaveLength(1);
  });

  it('publishes only READY_FOR_REVIEW versions and exposes them in catalog/launch', async () => {
    const game = await createGame();
    const version = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: '1.0.0',
        status: 'READY_FOR_REVIEW',
        publishedObjectPrefix: `games/${game.id}/version-ready/`,
        validationReport: {
          ok: true,
          checks: [{ name: 'malware scan', ok: true }],
          scanner: { engine: 'clamav', result: 'clean' },
        },
        submittedAt: new Date(),
      },
    });

    const approve = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${version.id}/approve`,
      ...authed(adminAgent),
      payload: { notes: 'Reviewed in integration test' },
    });
    expect(approve.statusCode, approve.body).toBe(204);

    const persisted = await prisma.gameVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(persisted.status).toBe('PUBLISHED');
    expect(await prisma.moderationDecision.count({ where: { gameVersionId: version.id } })).toBe(1);

    const catalog = await app.inject({ method: 'GET', url: '/api/games' });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().items[0].id).toBe(game.id);

    const launch = await app.inject({
      method: 'POST',
      url: `/api/games/${game.id}/launch`,
      payload: {},
    });
    expect(launch.statusCode, launch.body).toBe(200);
    // Per-version unique origin: {versionId}.{gameId}.<game host base>.
    expect(launch.json().gameUrl).toBe(
      `http://${version.id}.${game.id}.games.localhost:8080/index.html`,
    );
  });

  it('blocks self-moderation and approval from invalid states', async () => {
    const ownGame = await createGame(adminAgent);
    const ownVersion = await prisma.gameVersion.create({
      data: {
        gameId: ownGame.id,
        version: '1.0.0',
        status: 'READY_FOR_REVIEW',
        publishedObjectPrefix: 'games/own/version/',
      },
    });
    const selfApprove = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${ownVersion.id}/approve`,
      ...authed(adminAgent),
      payload: {},
    });
    expect(selfApprove.statusCode).toBe(403);

    const game = await createGame();
    const uploading = await prisma.gameVersion.create({
      data: { gameId: game.id, version: '0.1.0', status: 'UPLOADING' },
    });
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${uploading.id}/approve`,
      ...authed(adminAgent),
      payload: {},
    });
    expect(invalid.statusCode).toBe(409);
  });

  it('persists likes, favorites, comments, notifications, and ownership checks', async () => {
    const game = await createGame();
    const version = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: '1.0.0',
        status: 'PUBLISHED',
        publishedObjectPrefix: `games/${game.id}/published/`,
      },
    });
    await prisma.game.update({
      where: { id: game.id },
      data: { status: 'PUBLISHED', publishedVersionId: version.id, publishedAt: new Date() },
    });

    for (const suffix of ['like', 'favorite']) {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/games/${game.id}/${suffix}`,
        ...authed(playerAgent),
      });
      expect(response.statusCode).toBe(204);
    }

    const comment = await app.inject({
      method: 'POST',
      url: `/api/games/${game.id}/comments`,
      ...authed(playerAgent),
      payload: { body: 'A real database-backed comment.' },
    });
    expect(comment.statusCode, comment.body).toBe(200);
    const commentId = comment.json().comment.id as string;

    const forbiddenEdit = await app.inject({
      method: 'PATCH',
      url: `/api/comments/${commentId}`,
      ...authed(otherAgent),
      payload: { body: 'Attempted IDOR' },
    });
    expect(forbiddenEdit.statusCode).toBe(403);

    const library = await app.inject({
      method: 'GET',
      url: '/api/library',
      ...authed(playerAgent),
    });
    expect(library.json().likes).toHaveLength(1);
    expect(library.json().favorites).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: creator.id } })).toBe(1);
  });

  it('keeps admin endpoints server-enforced', async () => {
    const denied = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      ...authed(creatorAgent),
    });
    expect(denied.statusCode).toBe(403);

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      ...authed(adminAgent),
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().total).toBe(4);
  });
});
