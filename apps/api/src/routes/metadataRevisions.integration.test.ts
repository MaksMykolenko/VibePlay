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

describe('published metadata revisions', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let creator: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let creatorAgent: AuthedAgent;
  let adminAgent: AuthedAgent;

  beforeAll(async () => {
    const ctx = await buildTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => app.close());

  beforeEach(async () => {
    await resetDb(prisma);
    [creator, admin] = await Promise.all([
      createUser(prisma, app.env, {
        email: 'creator@example.com',
        username: 'creator_meta',
        role: 'CREATOR',
      }),
      createUser(prisma, app.env, {
        email: 'admin@example.com',
        username: 'admin_meta',
        role: 'ADMIN',
      }),
    ]);
    [creatorAgent, adminAgent] = await Promise.all([
      loginAs(app, creator.email),
      loginAs(app, admin.email),
    ]);
  });

  async function createGame(published: boolean) {
    const game = await prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: published ? 'published-meta' : 'draft-meta',
        title: 'Original Game',
        shortDescription: 'Original short description',
        description: 'Original long description for the public catalog.',
        category: 'Action',
        tags: ['original'],
        controls: [],
      },
    });
    if (!published) return game;
    const version = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: '1.0.0',
        status: 'PUBLISHED',
        publishedObjectPrefix: `games/${game.id}/1.0.0`,
      },
    });
    return prisma.game.update({
      where: { id: game.id },
      data: { status: 'PUBLISHED', publishedVersionId: version.id, publishedAt: new Date() },
    });
  }

  it('applies draft edits immediately without creating a revision', async () => {
    const game = await createGame(false);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      payload: { title: 'Updated Draft' },
      ...authed(creatorAgent),
    });

    expect(response.statusCode).toBe(200);
    expect((await prisma.game.findUnique({ where: { id: game.id } }))?.title).toBe('Updated Draft');
    expect(await prisma.gameMetadataRevision.count()).toBe(0);
  });

  it('keeps published metadata live until an admin approves the revision', async () => {
    const game = await createGame(true);
    const submitted = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      payload: {
        title: 'Reviewed Title',
        description: 'Reviewed long description for the public catalog.',
        tags: ['reviewed'],
      },
      ...authed(creatorAgent),
    });

    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().game.title).toBe('Original Game');
    expect(submitted.json().pendingMetadataRevision.data.title).toBe('Reviewed Title');
    expect((await prisma.game.findUnique({ where: { id: game.id } }))?.title).toBe('Original Game');

    const publicBefore = await app.inject({ method: 'GET', url: `/api/games/${game.slug}` });
    expect(publicBefore.statusCode).toBe(200);
    expect(publicBefore.json().game.title).toBe('Original Game');

    const revision = await prisma.gameMetadataRevision.findFirstOrThrow({
      where: { gameId: game.id, status: 'PENDING' },
    });
    const approved = await app.inject({
      method: 'POST',
      url: `/api/admin/metadata-revisions/${revision.id}/approve`,
      payload: {},
      ...authed(adminAgent),
    });

    expect(approved.statusCode).toBe(204);
    const live = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(live.title).toBe('Reviewed Title');
    expect(live.tags).toEqual(['reviewed']);
    expect(
      (await prisma.gameMetadataRevision.findUniqueOrThrow({ where: { id: revision.id } })).status,
    ).toBe('APPROVED');
    expect(
      await prisma.auditLog.count({
        where: {
          targetId: game.id,
          action: { in: ['game.metadata_revision_submitted', 'game.metadata_revision_approved'] },
        },
      }),
    ).toBe(2);
  });

  it('records rejection and leaves published metadata unchanged', async () => {
    const game = await createGame(true);
    await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      payload: { category: 'Puzzle' },
      ...authed(creatorAgent),
    });
    const revision = await prisma.gameMetadataRevision.findFirstOrThrow({
      where: { gameId: game.id, status: 'PENDING' },
    });
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/admin/metadata-revisions/${revision.id}/reject`,
      payload: { reason: 'Category does not match the game.', notes: '' },
      ...authed(adminAgent),
    });

    expect(rejected.statusCode).toBe(204);
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).category).toBe(
      'Action',
    );
    const decision = await prisma.gameMetadataRevision.findUniqueOrThrow({
      where: { id: revision.id },
    });
    expect(decision.status).toBe('REJECTED');
    expect(decision.reason).toBe('Category does not match the game.');
    expect(decision.reviewedById).toBe(admin.id);
  });

  it('rejects revision submission by a non-owner', async () => {
    const other = await createUser(prisma, app.env, {
      email: 'other@example.com',
      username: 'other_creator',
      role: 'CREATOR',
    });
    const otherAgent = await loginAs(app, other.email);
    const game = await createGame(true);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      payload: { title: 'Unauthorized Title' },
      ...authed(otherAgent),
    });

    expect(response.statusCode).toBe(403);
    expect(await prisma.gameMetadataRevision.count()).toBe(0);
  });

  it('rejects revision submission by an unverified creator', async () => {
    const unverified = await createUser(prisma, app.env, {
      email: 'unverified@example.com',
      username: 'unverified_creator',
      role: 'CREATOR',
      verified: false,
    });
    const unverifiedAgent = await loginAs(app, unverified.email);
    const game = await prisma.game.create({
      data: {
        creatorId: unverified.id,
        slug: 'unverified-game',
        title: 'Unverified Game',
        shortDescription: 'Original short description',
        description: 'Original long description for the public catalog.',
        category: 'Action',
        controls: [],
      },
    });
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      payload: { title: 'Blocked Change' },
      ...authed(unverifiedAgent),
    });

    expect(response.statusCode).toBe(403);
    expect(await prisma.gameMetadataRevision.count()).toBe(0);
  });
});
