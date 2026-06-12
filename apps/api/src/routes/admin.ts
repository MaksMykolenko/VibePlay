import type { FastifyInstance } from 'fastify';
import type { ReportStatus } from '@vibeplay/database';
import {
  adminReportsQuerySchema,
  adminUsersQuerySchema,
  approveVersionSchema,
  auditLogQuerySchema,
  createInviteSchema,
  errors,
  featureGameSchema,
  parseGameHostBase,
  previewGameOrigin,
  rejectVersionSchema,
  resolveReportSchema,
  suspendUserSchema,
} from '@vibeplay/shared';
import { audit } from '../lib/audit.js';
import { generateToken, hashToken, signExpiringValue } from '../lib/crypto.js';
import { requireAdmin } from '../lib/guards.js';
import {
  paginated,
  toCurrentUser,
  toGameDetail,
  toGameVersionDto,
  toPublicUser,
  toReportDto,
} from '../lib/serializers.js';
import { rlPolicy } from '../lib/rateLimit.js';
import { parse } from '../lib/validate.js';

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env } = app;

  app.addHook('preHandler', async (req) => {
    requireAdmin(req);
  });

  const moderationEntry = async (versionId: string) => {
    const version = await prisma.gameVersion.findUnique({
      where: { id: versionId },
      include: {
        game: {
          include: {
            creator: true,
            screenshots: true,
            publishedVersion: true,
            versions: true,
          },
        },
      },
    });
    if (!version) throw errors.notFound('VERSION_NOT_FOUND', 'Version not found');
    return {
      version: toGameVersionDto(version),
      game: toGameDetail(version.game, null),
    };
  };

  app.get('/moderation', async () => {
    const versions = await prisma.gameVersion.findMany({
      where: { status: { in: ['READY_FOR_REVIEW', 'VALIDATING', 'SCAN_FAILED'] } },
      orderBy: { submittedAt: 'asc' },
      select: { id: true },
    });
    return { queue: await Promise.all(versions.map((version) => moderationEntry(version.id))) };
  });

  app.get<{ Params: { versionId: string } }>('/game-versions/:versionId', async (req) =>
    moderationEntry(req.params.versionId),
  );

  app.post<{ Params: { versionId: string } }>(
    '/game-versions/:versionId/approve',
    { config: { rateLimit: rlPolicy('adminAction') } },
    async (req, reply) => {
      const admin = requireAdmin(req);
      const body = parse(approveVersionSchema, req.body);
      const version = await prisma.gameVersion.findUnique({
        where: { id: req.params.versionId },
        include: { game: true },
      });
      if (!version) throw errors.notFound('VERSION_NOT_FOUND', 'Version not found');
      if (version.game.creatorId === admin.id) {
        throw errors.forbidden('You cannot moderate your own game');
      }
      if (version.status !== 'READY_FOR_REVIEW' || !version.publishedObjectPrefix) {
        throw errors.invalidTransition(version.status, 'PUBLISHED');
      }
      await prisma.$transaction(async (tx) => {
        await tx.gameVersion.updateMany({
          where: { gameId: version.gameId, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });
        await tx.gameVersion.update({
          where: { id: version.id },
          data: { status: 'APPROVED', approvedAt: new Date() },
        });
        await tx.gameVersion.update({
          where: { id: version.id },
          data: { status: 'PUBLISHED' },
        });
        await tx.game.update({
          where: { id: version.gameId },
          data: {
            status: 'PUBLISHED',
            publishedVersionId: version.id,
            publishedAt: new Date(),
          },
        });
        await tx.moderationDecision.create({
          data: {
            gameVersionId: version.id,
            moderatorId: admin.id,
            decision: 'APPROVE',
            notes: body.notes,
          },
        });
        await tx.notification.create({
          data: {
            userId: version.game.creatorId,
            type: 'GAME_APPROVED',
            title: 'Game approved',
            body: `Version ${version.version} of “${version.game.title}” is now published.`,
            metadata: { gameId: version.gameId, versionId: version.id },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: admin.id,
            action: 'game_version.approved',
            targetType: 'GAME_VERSION',
            targetId: version.id,
            metadata: { gameId: version.gameId },
          },
        });
      });
      reply.status(204).send();
    },
  );

  app.post<{ Params: { versionId: string } }>(
    '/game-versions/:versionId/reject',
    { config: { rateLimit: rlPolicy('adminAction') } },
    async (req, reply) => {
      const admin = requireAdmin(req);
      const body = parse(rejectVersionSchema, req.body);
      const version = await prisma.gameVersion.findUnique({
        where: { id: req.params.versionId },
        include: { game: true },
      });
      if (!version) throw errors.notFound('VERSION_NOT_FOUND', 'Version not found');
      if (version.game.creatorId === admin.id) {
        throw errors.forbidden('You cannot moderate your own game');
      }
      if (version.status !== 'READY_FOR_REVIEW') {
        throw errors.invalidTransition(version.status, 'REJECTED');
      }
      await prisma.$transaction([
        prisma.gameVersion.update({
          where: { id: version.id },
          data: { status: 'REJECTED', rejectReason: body.reason, rejectedAt: new Date() },
        }),
        prisma.game.update({
          where: { id: version.gameId },
          data: version.game.status === 'DRAFT' ? { status: 'REJECTED' } : {},
        }),
        prisma.moderationDecision.create({
          data: {
            gameVersionId: version.id,
            moderatorId: admin.id,
            decision: 'REJECT',
            reason: body.reason,
            notes: body.notes,
          },
        }),
        prisma.notification.create({
          data: {
            userId: version.game.creatorId,
            type: 'GAME_REJECTED',
            title: 'Game build rejected',
            body: `Version ${version.version} of “${version.game.title}” was rejected: ${body.reason}`,
            metadata: { gameId: version.gameId, versionId: version.id },
          },
        }),
      ]);
      await audit(prisma, {
        actorId: admin.id,
        action: 'game_version.rejected',
        targetType: 'GAME_VERSION',
        targetId: version.id,
        metadata: { reason: body.reason },
        req,
        secret: env.SESSION_SECRET,
      });
      reply.status(204).send();
    },
  );

  app.post<{ Params: { versionId: string } }>(
    '/game-versions/:versionId/preview-url',
    { config: { rateLimit: rlPolicy('adminAction') } },
    async (req) => {
      const version = await prisma.gameVersion.findUnique({ where: { id: req.params.versionId } });
      if (!version || version.status !== 'READY_FOR_REVIEW' || !version.publishedObjectPrefix) {
        throw errors.notFound('VERSION_NOT_FOUND', 'Previewable version not found');
      }
      const token = signExpiringValue(version.id, Date.now() + 5 * 60_000, env.PREVIEW_URL_SECRET);
      // Preview gets its own {versionId}.preview.<base> origin so review
      // sessions never share storage with published games (spec §25).
      const origin = previewGameOrigin(parseGameHostBase(env.GAME_ORIGIN), version.id);
      return {
        url: `${origin}/${encodeURIComponent(token)}/index.html`,
      };
    },
  );

  app.post<{ Params: { gameId: string } }>(
    '/games/:gameId/hide',
    { config: { rateLimit: rlPolicy('adminAction') } },
    async (req, reply) => {
      const admin = requireAdmin(req);
      await prisma.game.update({ where: { id: req.params.gameId }, data: { status: 'HIDDEN' } });
      await audit(prisma, {
        actorId: admin.id,
        action: 'game.hidden',
        targetType: 'GAME',
        targetId: req.params.gameId,
      });
      reply.status(204).send();
    },
  );

  app.post<{ Params: { gameId: string } }>('/games/:gameId/restore', async (req, reply) => {
    const game = await prisma.game.findUnique({ where: { id: req.params.gameId } });
    if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    await prisma.game.update({
      where: { id: game.id },
      data: { status: game.publishedVersionId ? 'PUBLISHED' : 'DRAFT' },
    });
    reply.status(204).send();
  });

  app.post<{ Params: { gameId: string } }>('/games/:gameId/feature', async (req, reply) => {
    const body = parse(featureGameSchema, req.body);
    await prisma.game.update({
      where: { id: req.params.gameId },
      data: { featuredCategory: body.category },
    });
    reply.status(204).send();
  });

  app.get('/users', async (req) => {
    const query = parse(adminUsersQuerySchema, req.query);
    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { username: { contains: query.q, mode: 'insensitive' as const } },
              { displayName: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.user.count({ where }),
    ]);
    return paginated(users.map(toCurrentUser), query.page, query.perPage, total);
  });

  for (const action of ['suspend', 'ban'] as const) {
    app.post<{ Params: { userId: string } }>(`/users/:userId/${action}`, async (req, reply) => {
      const admin = requireAdmin(req);
      if (admin.id === req.params.userId) throw errors.forbidden('Cannot change your own status');
      const body = parse(suspendUserSchema, req.body);
      const status = action === 'suspend' ? 'SUSPENDED' : 'BANNED';
      await prisma.$transaction([
        prisma.user.update({
          where: { id: req.params.userId },
          data: { status, statusReason: body.reason },
        }),
        prisma.session.updateMany({
          where: { userId: req.params.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        prisma.game.updateMany({
          where: { creatorId: req.params.userId, status: 'PUBLISHED' },
          data: { status: 'SUSPENDED' },
        }),
      ]);
      reply.status(204).send();
    });
  }

  app.post<{ Params: { userId: string } }>('/users/:userId/restore', async (req, reply) => {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { status: 'ACTIVE', statusReason: null },
    });
    await prisma.game.updateMany({
      where: { creatorId: req.params.userId, status: 'SUSPENDED' },
      data: { status: 'HIDDEN' },
    });
    reply.status(204).send();
  });

  app.post<{ Params: { userId: string } }>('/users/:userId/promote-creator', async (req, reply) => {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { role: 'CREATOR' },
    });
    reply.status(204).send();
  });

  app.get('/reports', async (req) => {
    const query = parse(adminReportsQuerySchema, req.query);
    const where = query.status ? { status: query.status } : {};
    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: { reporter: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.report.count({ where }),
    ]);
    const labels = await Promise.all(
      reports.map(async (report) => {
        if (report.targetType === 'GAME') {
          return (
            (await prisma.game.findUnique({ where: { id: report.targetId } }))?.title ?? 'Game'
          );
        }
        if (report.targetType === 'USER') {
          return (
            (await prisma.user.findUnique({ where: { id: report.targetId } }))?.username ?? 'User'
          );
        }
        return 'Comment';
      }),
    );
    return paginated(
      reports.map((report, index) => toReportDto(report, labels[index] ?? 'Resource')),
      query.page,
      query.perPage,
      total,
    );
  });

  app.post<{ Params: { reportId: string } }>('/reports/:reportId/resolve', async (req, reply) => {
    const admin = requireAdmin(req);
    const body = parse(resolveReportSchema, req.body);
    const report = await prisma.report.findUnique({ where: { id: req.params.reportId } });
    if (!report) throw errors.notFound('REPORT_NOT_FOUND', 'Report not found');
    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: body.status as ReportStatus,
        resolutionNote: body.note,
        assignedAdminId: admin.id,
        resolvedAt: ['RESOLVED', 'DISMISSED'].includes(body.status) ? new Date() : null,
      },
    });
    if (report.reporterId) {
      await prisma.notification.create({
        data: {
          userId: report.reporterId,
          type: 'REPORT_RESOLVED',
          title: 'Report updated',
          body: `Your report is now ${body.status.toLowerCase()}.`,
          metadata: { reportId: report.id },
        },
      });
    }
    reply.status(204).send();
  });

  app.get('/audit-log', async (req) => {
    const query = parse(auditLogQuerySchema, req.query);
    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return paginated(
      rows.map((row) => ({
        id: row.id,
        actor: row.actor ? toPublicUser(row.actor) : null,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
      query.page,
      query.perPage,
      total,
    );
  });

  app.post('/invites', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(createInviteSchema, req.body);
    const code = generateToken();
    const invite = await prisma.invite.create({
      data: {
        codeHash: hashToken(code, env.SESSION_SECRET),
        email: body.email ?? null,
        role: body.role,
        expiresAt: new Date(Date.now() + body.expiresInDays * 24 * 60 * 60_000),
        createdById: admin.id,
      },
    });
    return {
      invite: {
        id: invite.id,
        code,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        usedAt: null,
        createdAt: invite.createdAt.toISOString(),
      },
    };
  });

  app.get('/invites', async () => {
    const invites = await prisma.invite.findMany({ orderBy: { createdAt: 'desc' } });
    return {
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        usedAt: invite.usedAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
      })),
    };
  });

  app.get('/stats', async () => {
    const [users, creators, games, published, pending, reports, plays] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'CREATOR' } }),
      prisma.game.count(),
      prisma.game.count({ where: { status: 'PUBLISHED' } }),
      prisma.gameVersion.count({ where: { status: 'READY_FOR_REVIEW' } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.game.aggregate({ _sum: { playsCount: true } }),
    ]);
    return {
      stats: {
        users,
        creators,
        games,
        published,
        pending,
        reports,
        plays: plays._sum.playsCount ?? 0,
      },
    };
  });
}
