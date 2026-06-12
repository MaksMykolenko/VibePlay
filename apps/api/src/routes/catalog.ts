import type { FastifyInstance } from 'fastify';
import {
  createCommentSchema,
  createFeedbackSchema,
  createReportSchema,
  errors,
  gamesListQuerySchema,
  paginationSchema,
  parseGameHostBase,
  publishedGameOrigin,
  updateCommentSchema,
} from '@vibeplay/shared';
import { requireActiveUser } from '../lib/guards.js';
import { rlPolicy } from '../lib/rateLimit.js';
import {
  paginated,
  toCommentDto,
  toGameDetail,
  toGameListItem,
  toNotificationDto,
} from '../lib/serializers.js';
import { parse } from '../lib/validate.js';

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env } = app;

  app.get('/games', async (req) => {
    const query = parse(gamesListQuerySchema, req.query);
    const where = {
      status: 'PUBLISHED' as const,
      ...(query.category ? { category: query.category } : {}),
      ...(query.featured ? { featuredCategory: { not: null } } : {}),
      ...(query.multiplayer !== undefined ? { multiplayer: query.multiplayer } : {}),
      ...(query.aiDisclosure ? { aiDisclosure: query.aiDisclosure } : {}),
      ...(query.creator ? { creator: { username: query.creator } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { shortDescription: { contains: query.q, mode: 'insensitive' as const } },
              { tags: { has: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const orderBy =
      query.sort === 'newest'
        ? ({ publishedAt: 'desc' } as const)
        : query.sort === 'most_liked'
          ? ({ likesCount: 'desc' } as const)
          : query.sort === 'title'
            ? ({ title: 'asc' } as const)
            : ({ playsCount: 'desc' } as const);
    const [items, total] = await Promise.all([
      prisma.game.findMany({
        where,
        include: { creator: true },
        orderBy,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.game.count({ where }),
    ]);
    return paginated(items.map(toGameListItem), query.page, query.perPage, total);
  });

  app.get<{ Params: { slug: string } }>('/games/:slug', async (req) => {
    const game = await prisma.game.findFirst({
      where: { slug: req.params.slug, status: 'PUBLISHED' },
      include: {
        creator: true,
        screenshots: true,
        publishedVersion: true,
        versions: true,
      },
    });
    if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    const viewerId = req.currentUser?.id ?? null;
    const [liked, favorited] = viewerId
      ? await Promise.all([
          prisma.like.findUnique({
            where: { userId_gameId: { userId: viewerId, gameId: game.id } },
          }),
          prisma.favorite.findUnique({
            where: { userId_gameId: { userId: viewerId, gameId: game.id } },
          }),
        ])
      : [null, null];
    return {
      game: toGameDetail(
        game,
        viewerId
          ? {
              liked: !!liked,
              favorited: !!favorited,
              isOwner: game.creatorId === viewerId,
            }
          : null,
      ),
    };
  });

  app.get('/categories', async () => {
    const groups = await prisma.game.groupBy({
      by: ['category'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
    return {
      categories: groups.map((group) => ({ name: group.category, count: group._count._all })),
    };
  });

  app.put<{ Params: { gameId: string } }>('/games/:gameId/like', async (req, reply) => {
    const user = requireActiveUser(req);
    const game = await prisma.game.findFirst({
      where: { id: req.params.gameId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    const existing = await prisma.like.findUnique({
      where: { userId_gameId: { userId: user.id, gameId: game.id } },
    });
    if (!existing) {
      await prisma.$transaction([
        prisma.like.create({ data: { userId: user.id, gameId: game.id } }),
        prisma.game.update({ where: { id: game.id }, data: { likesCount: { increment: 1 } } }),
      ]);
    }
    reply.status(204).send();
  });

  app.delete<{ Params: { gameId: string } }>('/games/:gameId/like', async (req, reply) => {
    const user = requireActiveUser(req);
    const deleted = await prisma.like.deleteMany({
      where: { userId: user.id, gameId: req.params.gameId },
    });
    if (deleted.count > 0) {
      await prisma.game.update({
        where: { id: req.params.gameId },
        data: { likesCount: { decrement: 1 } },
      });
    }
    reply.status(204).send();
  });

  app.put<{ Params: { gameId: string } }>('/games/:gameId/favorite', async (req, reply) => {
    const user = requireActiveUser(req);
    const game = await prisma.game.findFirst({
      where: { id: req.params.gameId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    await prisma.favorite.upsert({
      where: { userId_gameId: { userId: user.id, gameId: game.id } },
      create: { userId: user.id, gameId: game.id },
      update: {},
    });
    reply.status(204).send();
  });

  app.delete<{ Params: { gameId: string } }>('/games/:gameId/favorite', async (req, reply) => {
    const user = requireActiveUser(req);
    await prisma.favorite.deleteMany({ where: { userId: user.id, gameId: req.params.gameId } });
    reply.status(204).send();
  });

  app.get('/library', async (req) => {
    const user = requireActiveUser(req);
    const [likes, favorites] = await Promise.all([
      prisma.like.findMany({
        where: { userId: user.id, game: { status: 'PUBLISHED' } },
        include: { game: { include: { creator: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.favorite.findMany({
        where: { userId: user.id, game: { status: 'PUBLISHED' } },
        include: { game: { include: { creator: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      likes: likes.map((row) => toGameListItem(row.game)),
      favorites: favorites.map((row) => toGameListItem(row.game)),
    };
  });

  app.get('/recently-played', async (req) => {
    const user = requireActiveUser(req);
    const rows = await prisma.playSession.findMany({
      where: { userId: user.id, game: { status: 'PUBLISHED' } },
      include: { game: { include: { creator: true } } },
      orderBy: { startedAt: 'desc' },
      distinct: ['gameId'],
      take: 50,
    });
    return {
      items: rows.map((row) => ({
        game: toGameListItem(row.game),
        lastPlayedAt: row.startedAt.toISOString(),
      })),
    };
  });

  app.get<{ Params: { gameId: string } }>('/games/:gameId/comments', async (req) => {
    const query = parse(paginationSchema, req.query);
    const where = { gameId: req.params.gameId, status: 'VISIBLE' as const };
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.comment.count({ where }),
    ]);
    return paginated(
      comments.map((comment) => toCommentDto(comment, req.currentUser?.id ?? null)),
      query.page,
      query.perPage,
      total,
    );
  });

  app.post<{ Params: { gameId: string } }>(
    '/games/:gameId/comments',
    { config: { rateLimit: rlPolicy('comments') } },
    async (req) => {
      const user = requireActiveUser(req);
      const body = parse(createCommentSchema, req.body);
      const game = await prisma.game.findFirst({
        where: { id: req.params.gameId, status: 'PUBLISHED' },
        select: { id: true, creatorId: true, title: true },
      });
      if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
      const comment = await prisma.comment.create({
        data: { gameId: game.id, userId: user.id, body: body.body },
        include: { user: true },
      });
      if (game.creatorId !== user.id) {
        await prisma.notification.create({
          data: {
            userId: game.creatorId,
            type: 'NEW_COMMENT',
            title: 'New comment',
            body: `@${user.username} commented on “${game.title}”.`,
            metadata: { gameId: game.id, commentId: comment.id },
          },
        });
      }
      return { comment: toCommentDto(comment, user.id) };
    },
  );

  app.patch<{ Params: { commentId: string } }>('/comments/:commentId', async (req) => {
    const user = requireActiveUser(req);
    const body = parse(updateCommentSchema, req.body);
    const existing = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!existing) throw errors.notFound('COMMENT_NOT_FOUND', 'Comment not found');
    if (existing.userId !== user.id) throw errors.forbidden('You do not own this comment');
    const comment = await prisma.comment.update({
      where: { id: existing.id },
      data: { body: body.body },
      include: { user: true },
    });
    return { comment: toCommentDto(comment, user.id) };
  });

  app.delete<{ Params: { commentId: string } }>('/comments/:commentId', async (req, reply) => {
    const user = requireActiveUser(req);
    const existing = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!existing) throw errors.notFound('COMMENT_NOT_FOUND', 'Comment not found');
    if (existing.userId !== user.id && user.role !== 'ADMIN') {
      throw errors.forbidden('You do not own this comment');
    }
    await prisma.comment.update({
      where: { id: existing.id },
      data: { status: 'DELETED', body: '' },
    });
    reply.status(204).send();
  });

  // Beta feedback / bug reports (spec §38): stored and surfaced to admins.
  app.post('/feedback', { config: { rateLimit: rlPolicy('feedback') } }, async (req, reply) => {
    const user = requireActiveUser(req);
    const body = parse(createFeedbackSchema, req.body);
    await prisma.feedback.create({
      data: { userId: user.id, category: body.category, message: body.message, page: body.page },
    });
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: 'PLATFORM' as const,
        title: body.category === 'BUG' ? 'Beta bug report' : 'Beta feedback',
        body: `@${user.username}: ${body.message.slice(0, 300)}`,
        metadata: { page: body.page },
      })),
    });
    reply.status(204).send();
  });

  app.post('/reports', { config: { rateLimit: rlPolicy('reports') } }, async (req, reply) => {
    const user = requireActiveUser(req);
    const body = parse(createReportSchema, req.body);
    const exists =
      body.targetType === 'GAME'
        ? await prisma.game.findUnique({ where: { id: body.targetId }, select: { id: true } })
        : body.targetType === 'COMMENT'
          ? await prisma.comment.findUnique({ where: { id: body.targetId }, select: { id: true } })
          : await prisma.user.findUnique({ where: { id: body.targetId }, select: { id: true } });
    if (!exists) throw errors.notFound();
    await prisma.report.create({ data: { ...body, reporterId: user.id } });
    reply.status(204).send();
  });

  app.get('/notifications', async (req) => {
    const user = requireActiveUser(req);
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { notifications: notifications.map(toNotificationDto) };
  });

  app.patch<{ Params: { id: string } }>('/notifications/:id/read', async (req, reply) => {
    const user = requireActiveUser(req);
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: user.id },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) throw errors.notFound();
    reply.status(204).send();
  });

  app.post('/notifications/read-all', async (req, reply) => {
    const user = requireActiveUser(req);
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    reply.status(204).send();
  });

  app.post<{ Params: { gameId: string } }>(
    '/games/:gameId/launch',
    { config: { rateLimit: rlPolicy('gameLaunch') } },
    async (req) => {
      const game = await prisma.game.findFirst({
        where: { id: req.params.gameId, status: 'PUBLISHED', publishedVersionId: { not: null } },
        select: { id: true, publishedVersionId: true },
      });
      if (!game?.publishedVersionId) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
      const play = await prisma.$transaction(async (tx) => {
        const session = await tx.playSession.create({
          data: {
            userId: req.currentUser?.id ?? null,
            gameId: game.id,
            gameVersionId: game.publishedVersionId!,
          },
        });
        await tx.game.update({ where: { id: game.id }, data: { playsCount: { increment: 1 } } });
        return session;
      });
      // One origin per published version (spec §24): the iframe gets a unique
      // {versionId}.{gameId}.<game host base> origin and never a shared one.
      const gameOrigin = publishedGameOrigin(
        parseGameHostBase(env.GAME_ORIGIN),
        game.id,
        game.publishedVersionId,
      );
      return {
        sessionId: play.id,
        gameUrl: `${gameOrigin}/index.html`,
        gameVersionId: game.publishedVersionId,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        permissions: ['fullscreen'],
      };
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    '/play-sessions/:sessionId/end',
    async (req, reply) => {
      const session = await prisma.playSession.findUnique({ where: { id: req.params.sessionId } });
      if (!session) throw errors.notFound();
      if (session.userId && session.userId !== req.currentUser?.id) throw errors.forbidden();
      if (!session.endedAt) {
        const endedAt = new Date();
        await prisma.playSession.update({
          where: { id: session.id },
          data: {
            endedAt,
            durationSeconds: Math.max(
              0,
              Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
            ),
          },
        });
      }
      reply.status(204).send();
    },
  );
}
