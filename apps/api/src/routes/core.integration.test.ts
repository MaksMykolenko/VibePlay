import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@vibeplay/database';
import { storageKeys } from '@vibeplay/shared';
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
  let owner: Awaited<ReturnType<typeof createUser>>;
  let creatorAgent: AuthedAgent;
  let otherAgent: AuthedAgent;
  let playerAgent: AuthedAgent;
  let adminAgent: AuthedAgent;
  let ownerAgent: AuthedAgent;
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
    [creator, otherCreator, player, admin, owner] = await Promise.all([
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
      createUser(prisma, env, {
        email: 'owner@example.com',
        username: 'owner_one',
        role: 'OWNER',
      }),
    ]);
    [creatorAgent, otherAgent, playerAgent, adminAgent, ownerAgent] = await Promise.all([
      loginAs(app, creator.email),
      loginAs(app, otherCreator.email),
      loginAs(app, player.email),
      loginAs(app, admin.email),
      loginAs(app, owner.email),
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

  async function createVersion(gameId: string, agent = creatorAgent): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/versions`,
      ...authed(agent),
      payload: { version: '1.0.0' },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json().version.id as string;
  }

  function zipFixture(): { zip: Buffer; sha256: string } {
    const zip = Buffer.from('PKintegration-fixture');
    return { zip, sha256: createHash('sha256').update(zip).digest('hex') };
  }

  function createIntent(
    gameId: string,
    versionId: string,
    zip: Buffer,
    sha256: string,
    agent = creatorAgent,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/upload-intent`,
      ...authed(agent),
      payload: {
        versionId,
        fileName: 'game.zip',
        fileSize: zip.length,
        contentType: 'application/zip',
        sha256,
      },
    });
  }

  // The production bug: the browser received an internal MinIO presigned URL
  // (http://minio:9000/...) it could never reach -> "Failed to fetch".
  it('upload-intent returns a same-origin API URL, never an internal MinIO URL', async () => {
    const game = await createGame();
    const versionId = await createVersion(game.id);
    const { zip, sha256 } = zipFixture();
    const intent = await createIntent(game.id, versionId, zip, sha256);
    expect(intent.statusCode, intent.body).toBe(200);
    const uploadId = intent.json().uploadId as string;

    expect(intent.json().uploadUrl).toBe(`/api/uploads/${uploadId}/direct`);
    expect(intent.json().method).toBe('PUT');
    // Browser-facing response must NOT leak any internal/Docker hostname.
    expect(intent.body).not.toContain('minio:9000');
    expect(intent.body).not.toContain('localhost');
    expect(intent.body).not.toContain('127.0.0.1');
    expect(intent.body).not.toContain('http://');
  });

  it('stores the ZIP internally and enqueues exactly one validation job on direct upload', async () => {
    const game = await createGame();
    const versionId = await createVersion(game.id);
    const { zip, sha256 } = zipFixture();
    const intent = await createIntent(game.id, versionId, zip, sha256);
    expect(intent.statusCode, intent.body).toBe(200);
    const uploadId = intent.json().uploadId as string;

    const direct = await app.inject({
      method: 'PUT',
      url: `/api/uploads/${uploadId}/direct`,
      ...authed(creatorAgent),
      headers: { ...authed(creatorAgent).headers, 'content-type': 'application/zip' },
      payload: zip,
    });
    expect(direct.statusCode, direct.body).toBe(200);
    expect(direct.json().versionStatus).toBe('QUARANTINED');

    // The bytes are persisted into the private quarantine bucket (fs in tests,
    // MinIO in prod) - the API stored them server-side, the browser did not.
    const stat = await app.storage.headObject(
      app.env.S3_QUARANTINE_BUCKET,
      storageKeys.quarantineZip(versionId),
    );
    expect(stat?.size).toBe(zip.length);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queuedJobs).toEqual([{ uploadId, gameVersionId: versionId }]);

    // The legacy /complete step is now redundant; calling it after a direct
    // upload is a safe conflict and never enqueues a second validation job.
    const redundant = await app.inject({
      method: 'POST',
      url: `/api/uploads/${uploadId}/complete`,
      ...authed(creatorAgent),
      payload: {},
    });
    expect(redundant.statusCode).toBe(409);
    expect(queuedJobs).toHaveLength(1);
  });

  it('rejects a direct upload from an unauthenticated client', async () => {
    const game = await createGame();
    const versionId = await createVersion(game.id);
    const { zip, sha256 } = zipFixture();
    const intent = await createIntent(game.id, versionId, zip, sha256);
    const uploadId = intent.json().uploadId as string;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/uploads/${uploadId}/direct`,
      headers: { 'content-type': 'application/zip' },
      payload: zip,
    });
    // No session/CSRF -> rejected by the auth or CSRF guard, nothing stored.
    expect([401, 403]).toContain(res.statusCode);
    const stat = await app.storage.headObject(
      app.env.S3_QUARANTINE_BUCKET,
      storageKeys.quarantineZip(versionId),
    );
    expect(stat).toBeNull();
    expect(queuedJobs).toHaveLength(0);
  });

  it('rejects a direct upload from a creator who does not own the upload', async () => {
    const game = await createGame();
    const versionId = await createVersion(game.id);
    const { zip, sha256 } = zipFixture();
    const intent = await createIntent(game.id, versionId, zip, sha256);
    const uploadId = intent.json().uploadId as string;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/uploads/${uploadId}/direct`,
      ...authed(otherAgent),
      headers: { ...authed(otherAgent).headers, 'content-type': 'application/zip' },
      payload: zip,
    });
    expect(res.statusCode).toBe(403);
    expect(queuedJobs).toHaveLength(0);
  });

  it('rejects an upload-intent whose declared ZIP size exceeds the configured limit', async () => {
    const game = await createGame();
    const versionId = await createVersion(game.id);
    const oversized = app.env.UPLOAD_MAX_COMPRESSED_MB * 1024 * 1024 + 1;
    const intent = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${game.id}/upload-intent`,
      ...authed(creatorAgent),
      payload: {
        versionId,
        fileName: 'too-big.zip',
        fileSize: oversized,
        contentType: 'application/zip',
        sha256: 'a'.repeat(64),
      },
    });
    expect(intent.statusCode).toBe(413);
  });

  it('rejects a direct upload whose body size does not match the declared intent', async () => {
    const game = await createGame();
    const versionId = await createVersion(game.id);
    const { zip, sha256 } = zipFixture();
    const intent = await createIntent(game.id, versionId, zip, sha256);
    const uploadId = intent.json().uploadId as string;

    const tampered = Buffer.concat([zip, Buffer.from('-tampered')]);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/uploads/${uploadId}/direct`,
      ...authed(creatorAgent),
      headers: { ...authed(creatorAgent).headers, 'content-type': 'application/zip' },
      payload: tampered,
    });
    expect(res.statusCode).toBe(422);
    expect(queuedJobs).toHaveLength(0);
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
    // Per-version unique origin: {versionId}--{gameId}.<game host base>.
    expect(launch.json().gameUrl).toBe(
      `http://${version.id}--${game.id}.games.localhost:8080/index.html`,
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

  // ── OWNER moderation permissions ────────────────────────────────────────────
  async function readyVersion(gameId: string, status = 'READY_FOR_REVIEW') {
    return prisma.gameVersion.create({
      data: {
        gameId,
        version: '1.0.0',
        status: status as 'READY_FOR_REVIEW',
        publishedObjectPrefix:
          status === 'READY_FOR_REVIEW' ? `games/${gameId}/owner-build/` : null,
        submittedAt: new Date(),
      },
    });
  }

  it('a CREATOR can never approve their own game (admin role required)', async () => {
    const game = await createGame(creatorAgent);
    const version = await readyVersion(game.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${version.id}/approve`,
      ...authed(creatorAgent),
      payload: {},
    });
    expect(res.statusCode).toBe(403); // blocked by the admin-role guard
    const persisted = await prisma.gameVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(persisted.status).toBe('READY_FOR_REVIEW'); // not published
  });

  it('blocks an ADMIN from moderating their own game with a clear message', async () => {
    const ownGame = await createGame(adminAgent);
    const version = await readyVersion(ownGame.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${version.id}/approve`,
      ...authed(adminAgent),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('Only OWNER can moderate their own games.');
  });

  it('lets the OWNER approve their own READY_FOR_REVIEW game and records an owner override', async () => {
    const ownGame = await createGame(ownerAgent);
    const version = await readyVersion(ownGame.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${version.id}/approve`,
      ...authed(ownerAgent),
      payload: { notes: 'solo beta test' },
    });
    expect(res.statusCode, res.body).toBe(204);

    const persisted = await prisma.gameVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(persisted.status).toBe('PUBLISHED');

    // Override recorded on the moderation decision...
    const decision = await prisma.moderationDecision.findFirstOrThrow({
      where: { gameVersionId: version.id },
    });
    expect(decision.decision).toBe('APPROVE');
    expect(decision.notes).toContain('OWNER OVERRIDE');
    // ...and in the audit log.
    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'game_version.approved', targetId: version.id },
    });
    expect(JSON.stringify(auditEntry.metadata)).toContain('"ownerOverride":true');
  });

  it('forbids the OWNER from approving their own game when the scan failed', async () => {
    const ownGame = await createGame(ownerAgent);
    const version = await prisma.gameVersion.create({
      data: {
        gameId: ownGame.id,
        version: '1.0.0',
        status: 'SCAN_FAILED',
        rejectReason: 'malware detected',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${version.id}/approve`,
      ...authed(ownerAgent),
      payload: {},
    });
    expect(res.statusCode).toBe(409); // unsafe status → invalid state transition
    const persisted = await prisma.gameVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(persisted.status).toBe('SCAN_FAILED'); // unchanged, never published
    expect(await prisma.moderationDecision.count({ where: { gameVersionId: version.id } })).toBe(0);
  });

  it('lets the OWNER reject their own READY_FOR_REVIEW game (recorded as override)', async () => {
    const ownGame = await createGame(ownerAgent);
    const version = await readyVersion(ownGame.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${version.id}/reject`,
      ...authed(ownerAgent),
      payload: { reason: 'Not ready for public release yet.' },
    });
    expect(res.statusCode, res.body).toBe(204);
    const persisted = await prisma.gameVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(persisted.status).toBe('REJECTED');
    const decision = await prisma.moderationDecision.findFirstOrThrow({
      where: { gameVersionId: version.id },
    });
    expect(decision.notes).toContain('OWNER OVERRIDE');
  });

  // Regression: the moderation queue is version-driven, not game-status-driven.
  // A freshly uploaded build leaves the Game in DRAFT while its GameVersion is
  // READY_FOR_REVIEW — it must still appear in Admin → Moderation.
  it('shows a READY_FOR_REVIEW version in the moderation queue even when its game is DRAFT', async () => {
    const game = await createGame(); // game.status defaults to DRAFT
    const dbGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(dbGame.status).toBe('DRAFT');

    // No submittedAt set — mirrors the worker promoting a version to READY_FOR_REVIEW.
    const version = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: '1.0.0',
        status: 'READY_FOR_REVIEW',
        publishedObjectPrefix: `games/${game.id}/ready/`,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation',
      ...authed(adminAgent),
    });
    expect(res.statusCode, res.body).toBe(200);
    const queue = res.json().queue as Array<{ version: { id: string }; game: { id: string } }>;
    expect(queue.map((e) => e.version.id)).toContain(version.id);
    expect(queue.find((e) => e.version.id === version.id)?.game.id).toBe(game.id);
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
    // creator, otherCreator, player, admin, owner (added for OWNER moderation tests).
    expect(allowed.json().total).toBe(5);
  });

  it('persists account controls, exports only owned safe data, and manages beta feedback', async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      ...authed(playerAgent),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.notificationPrefs).toEqual({
      moderationUpdates: true,
      social: true,
      platformNews: false,
    });

    const prefs = await app.inject({
      method: 'PUT',
      url: '/api/profile/notification-preferences',
      ...authed(playerAgent),
      payload: { moderationUpdates: false, social: true, platformNews: true },
    });
    expect(prefs.statusCode, prefs.body).toBe(200);
    expect(prefs.json().user.notificationPrefs).toEqual({
      moderationUpdates: false,
      social: true,
      platformNews: true,
    });

    const invalidPrefs = await app.inject({
      method: 'PUT',
      url: '/api/profile/notification-preferences',
      ...authed(playerAgent),
      payload: {
        moderationUpdates: false,
        social: true,
        platformNews: true,
        userId: admin.id,
      },
    });
    expect(invalidPrefs.statusCode).toBe(422);

    const feedback = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      ...authed(playerAgent),
      payload: {
        category: 'BUG',
        message: '<img src=x onerror=alert(1)> is stored as plain data, never rendered as HTML',
        page: '/settings',
      },
    });
    expect(feedback.statusCode, feedback.body).toBe(204);
    const feedbackRow = await prisma.feedback.findFirstOrThrow({ where: { userId: player.id } });
    expect(feedbackRow.status).toBe('OPEN');
    expect(feedbackRow.message).toContain('<img');

    const adminFeedback = await app.inject({
      method: 'GET',
      url: '/api/admin/feedback?status=OPEN',
      ...authed(adminAgent),
    });
    expect(adminFeedback.statusCode, adminFeedback.body).toBe(200);
    expect(adminFeedback.json().items[0].id).toBe(feedbackRow.id);

    const resolveFeedback = await app.inject({
      method: 'POST',
      url: `/api/admin/feedback/${feedbackRow.id}/resolve`,
      ...authed(adminAgent),
      payload: {},
    });
    expect(resolveFeedback.statusCode, resolveFeedback.body).toBe(204);
    expect(
      (await prisma.feedback.findUniqueOrThrow({ where: { id: feedbackRow.id } })).status,
    ).toBe('RESOLVED');

    const resolveAgain = await app.inject({
      method: 'POST',
      url: `/api/admin/feedback/${feedbackRow.id}/resolve`,
      ...authed(adminAgent),
      payload: {},
    });
    expect(resolveAgain.statusCode).toBe(409);

    const exportResponse = await app.inject({
      method: 'POST',
      url: '/api/profile/export',
      ...authed(playerAgent),
      payload: {},
    });
    expect(exportResponse.statusCode, exportResponse.body).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('application/json');
    expect(exportResponse.headers['content-disposition']).toContain('attachment');
    const exported = exportResponse.json();
    expect(exported.account.email).toBe(player.email);
    expect(exported.feedback).toHaveLength(1);
    const serialized = JSON.stringify(exported);
    for (const forbidden of [
      'passwordHash',
      'tokenHash',
      'csrfHash',
      'verificationToken',
      'resetToken',
      otherCreator.email,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(
      await prisma.auditLog.count({
        where: { actorId: player.id, action: 'account.data_exported' },
      }),
    ).toBe(1);

    const anonymousExport = await app.inject({
      method: 'POST',
      url: '/api/profile/export',
      payload: {},
    });
    expect(anonymousExport.statusCode).toBe(401);

    const deletion = await app.inject({
      method: 'POST',
      url: '/api/profile/delete-request',
      ...authed(playerAgent),
      payload: {},
    });
    expect(deletion.statusCode, deletion.body).toBe(200);
    expect(await prisma.session.count({ where: { userId: player.id, revokedAt: null } })).toBe(0);

    const meAfterDeletionRequest = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      ...authed(playerAgent),
    });
    expect(meAfterDeletionRequest.statusCode).toBe(401);
  });
});
