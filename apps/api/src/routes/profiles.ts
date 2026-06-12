import type { FastifyInstance } from 'fastify';
import {
  ApiError,
  errors,
  searchQuerySchema,
  updateProfileSchema,
  usernameSchema,
} from '@vibeplay/shared';
import { audit } from '../lib/audit.js';
import { requireActiveUser } from '../lib/guards.js';
import { toCurrentUser, toGameListItem, toPublicUser } from '../lib/serializers.js';
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
  app.post('/profile/delete-request', async (req) => {
    const user = requireActiveUser(req);
    await audit(prisma, {
      actorId: user.id,
      action: 'account.deletion_requested',
      targetType: 'USER',
      targetId: user.id,
      req,
      secret: env.SESSION_SECRET,
    });
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
  });
}
