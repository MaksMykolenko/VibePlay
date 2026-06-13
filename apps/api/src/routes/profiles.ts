import type { FastifyInstance } from 'fastify';
import {
  ApiError,
  errors,
  notificationPrefsSchema,
  searchQuerySchema,
  updateProfileSchema,
  usernameSchema,
} from '@vibeplay/shared';
import { audit } from '../lib/audit.js';
import { requireActiveUser } from '../lib/guards.js';
import { rlPolicy } from '../lib/rateLimit.js';
import { toCurrentUser, toGameListItem, toPublicUser } from '../lib/serializers.js';
import { clearSessionCookies } from '../lib/sessions.js';
import { parse } from '../lib/validate.js';

export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env } = app;

  app.get('/profiles', async (req) => {
    const query = parse(searchQuerySchema, req.query);
    const creators = await prisma.user.findMany({
      where: {
        role: 'CREATOR',
        status: 'ACTIVE',
        OR: [
          { username: { contains: query.q, mode: 'insensitive' } },
          { displayName: { contains: query.q, mode: 'insensitive' } },
          { bio: { contains: query.q, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    });
    return { creators: creators.map(toPublicUser) };
  });

  // Public profile by username.
  app.get<{ Params: { username: string } }>('/profiles/:username', async (req) => {
    const parsed = usernameSchema.safeParse(req.params.username);
    if (!parsed.success) throw errors.notFound('USER_NOT_FOUND', 'Profile not found');

    const user = await prisma.user.findUnique({ where: { username: parsed.data } });
    const viewer = req.currentUser;
    const visible =
      user && (user.status === 'ACTIVE' || viewer?.id === user.id || viewer?.role === 'ADMIN');
    if (!user || !visible) throw errors.notFound('USER_NOT_FOUND', 'Profile not found');

    const games = await prisma.game.findMany({
      where: { creatorId: user.id, status: 'PUBLISHED' },
      include: { creator: true },
      orderBy: { publishedAt: 'desc' },
      take: 12,
    });

    const [publishedCount, likesReceived] = await Promise.all([
      prisma.game.count({ where: { creatorId: user.id, status: 'PUBLISHED' } }),
      prisma.like.count({ where: { game: { creatorId: user.id } } }),
    ]);

    return {
      profile: toPublicUser(user),
      status: user.status,
      stats: { publishedCount, likesReceived },
      games: games.map(toGameListItem),
    };
  });

  // Update own profile. `.strict()` schema rejects role/email/creatorId — mass
  // assignment and role escalation are impossible through this endpoint.
  app.patch('/profile', async (req) => {
    const user = requireActiveUser(req);
    const body = parse(updateProfileSchema, req.body);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
    });
    return { user: toCurrentUser(updated) };
  });

  // Avatar binary upload is not part of the beta — honest 501 (spec §4, §15).
  app.post('/profile/avatar', async (req) => {
    requireActiveUser(req);
    throw new ApiError(
      501,
      'NOT_AVAILABLE_IN_BETA',
      'Direct avatar upload is not available in this beta. Set an https avatar URL instead.',
    );
  });

  // Account deletion request (spec §36): recorded for admins, processed manually
  // during the beta. Documented in /privacy.
  app.post(
    '/profile/delete-request',
    { config: { rateLimit: rlPolicy('accountDeletion') } },
    async (req, reply) => {
      const user = requireActiveUser(req);
      await audit(prisma, {
        actorId: user.id,
        action: 'account.deletion_requested',
        targetType: 'USER',
        targetId: user.id,
        req,
        secret: env.SESSION_SECRET,
      });
      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      clearSessionCookies(reply, env);
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' } });
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: 'PLATFORM' as const,
          title: 'Account deletion request',
          body: `User @${user.username} (${user.email}) requested account deletion.`,
          metadata: { userId: user.id },
        })),
      });
      return {
        ok: true,
        message:
          'Deletion request recorded. An administrator will process it within 30 days; you will receive a confirmation email.',
      };
    },
  );

  // Immediate machine-readable export of the authenticated user's own data.
  // Deliberately excludes credential hashes, sessions/tokens, private admin
  // notes and internal storage keys.
  app.post(
    '/profile/export',
    { config: { rateLimit: rlPolicy('dataExport') } },
    async (req, reply) => {
      const user = requireActiveUser(req);
      const [account, games, comments, likes, favorites, plays, reports, feedback, notifications] =
        await Promise.all([
          prisma.user.findUniqueOrThrow({
            where: { id: user.id },
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              role: true,
              status: true,
              emailVerifiedAt: true,
              notificationPrefs: true,
              createdAt: true,
              updatedAt: true,
              lastLoginAt: true,
            },
          }),
          prisma.game.findMany({
            where: { creatorId: user.id },
            select: {
              id: true,
              slug: true,
              title: true,
              shortDescription: true,
              description: true,
              category: true,
              ageRating: true,
              status: true,
              tags: true,
              devices: true,
              controls: true,
              toolsUsed: true,
              multiplayer: true,
              aiDisclosure: true,
              coverUrl: true,
              publishedVersionId: true,
              publishedAt: true,
              createdAt: true,
              updatedAt: true,
              versions: {
                select: {
                  id: true,
                  version: true,
                  status: true,
                  compressedSize: true,
                  uncompressedSize: true,
                  fileCount: true,
                  aiDisclosure: true,
                  toolsUsed: true,
                  changelog: true,
                  rejectReason: true,
                  submittedAt: true,
                  approvedAt: true,
                  rejectedAt: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          }),
          prisma.comment.findMany({
            where: { userId: user.id },
            select: {
              id: true,
              gameId: true,
              body: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          prisma.like.findMany({
            where: { userId: user.id },
            select: { gameId: true, createdAt: true },
          }),
          prisma.favorite.findMany({
            where: { userId: user.id },
            select: { gameId: true, createdAt: true },
          }),
          prisma.playSession.findMany({
            where: { userId: user.id },
            select: {
              id: true,
              gameId: true,
              gameVersionId: true,
              startedAt: true,
              endedAt: true,
              durationSeconds: true,
            },
          }),
          prisma.report.findMany({
            where: { reporterId: user.id },
            select: {
              id: true,
              targetType: true,
              targetId: true,
              reason: true,
              details: true,
              status: true,
              createdAt: true,
              resolvedAt: true,
            },
          }),
          prisma.feedback.findMany({
            where: { userId: user.id },
            select: {
              id: true,
              category: true,
              status: true,
              message: true,
              page: true,
              createdAt: true,
              resolvedAt: true,
            },
          }),
          prisma.notification.findMany({
            where: { userId: user.id },
            select: {
              id: true,
              type: true,
              title: true,
              body: true,
              metadata: true,
              readAt: true,
              createdAt: true,
            },
          }),
        ]);

      await audit(prisma, {
        actorId: user.id,
        action: 'account.data_exported',
        targetType: 'USER',
        targetId: user.id,
        req,
        secret: env.SESSION_SECRET,
      });

      const exportedGames = games.map((game) => ({
        ...game,
        versions: game.versions.map((version) => ({
          ...version,
          compressedSize: version.compressedSize == null ? null : Number(version.compressedSize),
          uncompressedSize:
            version.uncompressedSize == null ? null : Number(version.uncompressedSize),
        })),
      }));
      const fileName = `vibeplay-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;
      reply.header('content-type', 'application/json; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${fileName}"`);
      return {
        generatedAt: new Date().toISOString(),
        account,
        games: exportedGames,
        comments,
        likes,
        favorites,
        playSessions: plays,
        reports,
        feedback,
        notifications,
      };
    },
  );

  // Persisted notification preferences (spec §36).
  app.put('/profile/notification-preferences', async (req) => {
    const user = requireActiveUser(req);
    const prefs = parse(notificationPrefsSchema, req.body);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { notificationPrefs: prefs },
    });
    return { user: toCurrentUser(updated) };
  });
}
