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

// A minimal but VALID PNG: the 8-byte signature + enough trailing bytes so the
// magic-byte sniffer (which needs >= 12 bytes) accepts it.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
// A non-image payload (looks like SVG/script) that must be rejected even if it
// is uploaded under an image content type.
const FAKE_IMAGE = Buffer.from('<svg onload="alert(1)"></svg>', 'utf8');

describe('avatar upload + game version update', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let creator: Awaited<ReturnType<typeof createUser>>;
  let other: Awaited<ReturnType<typeof createUser>>;
  let player: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let creatorAgent: AuthedAgent;
  let otherAgent: AuthedAgent;
  let playerAgent: AuthedAgent;
  let adminAgent: AuthedAgent;

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
    [creator, other, player, admin] = await Promise.all([
      createUser(prisma, env, { email: 'c@example.com', username: 'creator_a', role: 'CREATOR' }),
      createUser(prisma, env, { email: 'o@example.com', username: 'creator_b', role: 'CREATOR' }),
      createUser(prisma, env, { email: 'p@example.com', username: 'player_a' }),
      createUser(prisma, env, { email: 'a@example.com', username: 'admin_a', role: 'ADMIN' }),
    ]);
    [creatorAgent, otherAgent, playerAgent, adminAgent] = await Promise.all([
      loginAs(app, creator.email),
      loginAs(app, other.email),
      loginAs(app, player.email),
      loginAs(app, admin.email),
    ]);
  });

  // ---- Avatar upload --------------------------------------------------------

  async function avatarIntent(agent: AuthedAgent, contentType = 'image/png', fileName = 'a.png') {
    return app.inject({
      method: 'POST',
      url: '/api/me/avatar/upload-intent',
      ...authed(agent),
      payload: { contentType, fileName, size: PNG_BYTES.length },
    });
  }

  it('completes the full avatar upload flow and serves it from private storage', async () => {
    const intent = await avatarIntent(creatorAgent);
    expect(intent.statusCode, intent.body).toBe(200);
    const { uploadUrl, objectKey } = intent.json();
    // The key is scoped to the caller and never leaks an internal MinIO host.
    expect(objectKey).toMatch(new RegExp(`^users/${creator.id}/avatar/`));
    expect(intent.body).not.toContain('minio');

    const put = await app.inject({
      method: 'PUT',
      url: uploadUrl,
      ...authed(creatorAgent),
      headers: { ...authed(creatorAgent).headers, 'content-type': 'image/png' },
      payload: PNG_BYTES,
    });
    expect(put.statusCode, put.body).toBe(200);

    const complete = await app.inject({
      method: 'POST',
      url: '/api/me/avatar/complete',
      ...authed(creatorAgent),
      payload: { objectKey },
    });
    expect(complete.statusCode, complete.body).toBe(200);
    expect(complete.json().user.avatarUrl).toContain(`/api/users/${creator.id}/avatar`);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: creator.id } });
    expect(stored.avatarObjectKey).toBe(objectKey);

    // Public serving streams the bytes from the private bucket.
    const served = await app.inject({ method: 'GET', url: `/api/users/${creator.id}/avatar` });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');
    expect(served.rawPayload.length).toBe(PNG_BYTES.length);

    // Removal resets to the fallback (404 afterwards).
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/me/avatar',
      ...authed(creatorAgent),
    });
    expect(del.statusCode).toBe(200);
    const gone = await app.inject({ method: 'GET', url: `/api/users/${creator.id}/avatar` });
    expect(gone.statusCode).toBe(404);
  });

  it('rejects disallowed content types at intent (no SVG, no executables)', async () => {
    for (const ct of ['image/svg+xml', 'application/zip', 'text/html']) {
      const res = await avatarIntent(creatorAgent, ct, 'x.bin');
      expect(res.statusCode, `${ct} should be rejected`).toBe(422);
    }
  });

  it('rejects an oversized declared avatar at intent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/avatar/upload-intent',
      ...authed(creatorAgent),
      payload: { contentType: 'image/png', fileName: 'a.png', size: 50 * 1024 * 1024 },
    });
    expect(res.statusCode).toBe(413);
  });

  it('rejects a non-image payload even under an image content type (magic-byte check)', async () => {
    const intent = await avatarIntent(creatorAgent);
    const { uploadUrl, objectKey } = intent.json();
    const put = await app.inject({
      method: 'PUT',
      url: uploadUrl,
      ...authed(creatorAgent),
      headers: { ...authed(creatorAgent).headers, 'content-type': 'image/png' },
      payload: FAKE_IMAGE,
    });
    expect(put.statusCode).toBe(422);
    // Nothing was attached to the user, and nothing is served.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: creator.id } });
    expect(stored.avatarObjectKey).toBeNull();
    void objectKey;
  });

  it('forbids completing with another user object key (no IDOR / traversal)', async () => {
    const intent = await avatarIntent(creatorAgent);
    const { uploadUrl, objectKey } = intent.json();
    await app.inject({
      method: 'PUT',
      url: uploadUrl,
      ...authed(creatorAgent),
      headers: { ...authed(creatorAgent).headers, 'content-type': 'image/png' },
      payload: PNG_BYTES,
    });
    // `other` tries to claim creator's uploaded object → forbidden.
    const stolen = await app.inject({
      method: 'POST',
      url: '/api/me/avatar/complete',
      ...authed(otherAgent),
      payload: { objectKey },
    });
    expect(stolen.statusCode).toBe(403);
    // A traversal-style key is rejected too.
    const traversal = await app.inject({
      method: 'POST',
      url: '/api/me/avatar/complete',
      ...authed(creatorAgent),
      payload: { objectKey: `users/${creator.id}/avatar/../../../etc/passwd` },
    });
    expect(traversal.statusCode).toBe(403);
  });

  it('requires authentication for avatar upload-intent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/avatar/upload-intent',
      payload: { contentType: 'image/png', fileName: 'a.png', size: PNG_BYTES.length },
    });
    expect(res.statusCode).toBe(401);
  });

  // ---- Game version update (new immutable version) --------------------------

  async function publishedGame(): Promise<{ gameId: string; v1: string }> {
    const game = await prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: 'Live Game',
        shortDescription: 'A currently published game.',
        description: 'It already has a live, playable version.',
        category: 'Arcade',
      },
    });
    const v1 = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: '1.0.0',
        status: 'PUBLISHED',
        publishedObjectPrefix: `games/${game.id}/v1/`,
      },
    });
    await prisma.game.update({
      where: { id: game.id },
      data: { status: 'PUBLISHED', publishedVersionId: v1.id, publishedAt: new Date() },
    });
    return { gameId: game.id, v1: v1.id };
  }

  it('lets the owner add a new version while a published version stays live', async () => {
    const { gameId, v1 } = await publishedGame();
    const res = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/versions`,
      ...authed(creatorAgent),
      payload: { version: '2.0.0', changelog: 'New levels' },
    });
    expect(res.statusCode, res.body).toBe(200);
    // The published pointer must NOT move when a new version is created.
    const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.publishedVersionId).toBe(v1);
  });

  it('does not change publishedVersionId until the new version is approved, then switches atomically', async () => {
    const { gameId, v1 } = await publishedGame();
    const created = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/versions`,
      ...authed(creatorAgent),
      payload: { version: '2.0.0', changelog: 'v2' },
    });
    const v2 = created.json().version.id as string;

    // Worker promotes v2 to READY_FOR_REVIEW (still not published).
    await prisma.gameVersion.update({
      where: { id: v2 },
      data: { status: 'READY_FOR_REVIEW', publishedObjectPrefix: `games/${gameId}/v2/` },
    });
    let game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.publishedVersionId).toBe(v1); // unchanged before approval

    // It must also surface in the moderation queue even though the game is PUBLISHED.
    const queue = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation',
      ...authed(adminAgent),
    });
    const ids = (queue.json().queue as Array<{ version: { id: string } }>).map((e) => e.version.id);
    expect(ids).toContain(v2);

    // Admin approves → publishedVersionId switches to v2, v1 is archived.
    const approve = await app.inject({
      method: 'POST',
      url: `/api/admin/game-versions/${v2}/approve`,
      ...authed(adminAgent),
      payload: { notes: 'looks good' },
    });
    expect(approve.statusCode, approve.body).toBe(204);

    game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.publishedVersionId).toBe(v2);

    const old = await prisma.gameVersion.findUniqueOrThrow({ where: { id: v1 } });
    expect(old.status).toBe('ARCHIVED');
    // The old version's stored files are still referenced (not overwritten).
    expect(old.publishedObjectPrefix).toBe(`games/${gameId}/v1/`);
  });

  it('forbids a non-owner creator, a player, and an unverified creator from adding versions', async () => {
    const { gameId } = await publishedGame();

    const byOther = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/versions`,
      ...authed(otherAgent),
      payload: { version: '2.0.0' },
    });
    expect(byOther.statusCode).toBe(403);

    const byPlayer = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/versions`,
      ...authed(playerAgent),
      payload: { version: '2.0.0' },
    });
    expect(byPlayer.statusCode).toBe(403);

    await prisma.user.update({ where: { id: creator.id }, data: { emailVerifiedAt: null } });
    const unverified = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/versions`,
      ...authed(creatorAgent),
      payload: { version: '2.0.0' },
    });
    expect(unverified.statusCode).toBe(403);
  });
});
