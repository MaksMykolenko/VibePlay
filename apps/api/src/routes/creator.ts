import type { FastifyInstance } from 'fastify';
import {
  createGameSchema,
  createVersionSchema,
  errors,
  storageKeys,
  updateGameSchema,
  uploadIntentSchema,
} from '@vibeplay/shared';
import { audit } from '../lib/audit.js';
import { requireCreator, requireOwnershipOrAdmin, requireVerifiedEmail } from '../lib/guards.js';
import { rlPolicy } from '../lib/rateLimit.js';
import { toGameDetail, toGameVersionDto } from '../lib/serializers.js';
import { parse } from '../lib/validate.js';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

export async function registerCreatorRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env, storage, validationQueue } = app;

  app.get('/creator/games', async (req) => {
    const user = requireCreator(req);
    const games = await prisma.game.findMany({
      where: { creatorId: user.id },
      include: {
        creator: true,
        screenshots: true,
        publishedVersion: true,
        versions: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      games: games.map((game) => ({
        game: toGameDetail(game, { liked: false, favorited: false, isOwner: true }),
        versions: game.versions.map(toGameVersionDto),
      })),
    };
  });

  app.post('/creator/games', async (req) => {
    const user = requireVerifiedEmail(req);
    requireCreator(req);
    const body = parse(createGameSchema, req.body);
    const base = slugify(body.title) || 'game';
    let slug = base;
    for (let suffix = 2; await prisma.game.findUnique({ where: { slug } }); suffix += 1) {
      slug = `${base}-${suffix}`;
    }
    const game = await prisma.$transaction(async (tx) => {
      const created = await tx.game.create({
        data: {
          creatorId: user.id,
          slug,
          title: body.title,
          shortDescription: body.shortDescription,
          description: body.description,
          category: body.category,
          ageRating: body.ageRating,
          tags: body.tags,
          devices: body.devices,
          controls: body.controls,
          multiplayer: body.multiplayer,
          aiDisclosure: body.aiDisclosure,
          toolsUsed: body.toolsUsed,
          coverUrl: body.coverUrl ?? null,
          screenshots: {
            create: body.screenshots.map((url, sortOrder) => ({ url, sortOrder })),
          },
        },
        include: {
          creator: true,
          screenshots: true,
          publishedVersion: true,
          versions: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'game.created',
          targetType: 'GAME',
          targetId: created.id,
        },
      });
      return created;
    });
    return { game: toGameDetail(game, { liked: false, favorited: false, isOwner: true }) };
  });

  app.get<{ Params: { gameId: string } }>('/creator/games/:gameId', async (req) => {
    const user = requireCreator(req);
    const game = await prisma.game.findUnique({
      where: { id: req.params.gameId },
      include: {
        creator: true,
        screenshots: true,
        publishedVersion: true,
        versions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    requireOwnershipOrAdmin(req, game.creatorId);
    return {
      game: toGameDetail(game, {
        liked: false,
        favorited: false,
        isOwner: game.creatorId === user.id,
      }),
      versions: game.versions.map(toGameVersionDto),
    };
  });

  app.patch<{ Params: { gameId: string } }>('/creator/games/:gameId', async (req) => {
    requireVerifiedEmail(req);
    requireCreator(req);
    const body = parse(updateGameSchema, req.body);
    const existing = await prisma.game.findUnique({ where: { id: req.params.gameId } });
    if (!existing) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    requireOwnershipOrAdmin(req, existing.creatorId);
    const game = await prisma.$transaction(async (tx) => {
      if (body.screenshots) {
        await tx.gameScreenshot.deleteMany({ where: { gameId: existing.id } });
      }
      return tx.game.update({
        where: { id: existing.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.shortDescription !== undefined
            ? { shortDescription: body.shortDescription }
            : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.ageRating !== undefined ? { ageRating: body.ageRating } : {}),
          ...(body.tags !== undefined ? { tags: body.tags } : {}),
          ...(body.devices !== undefined ? { devices: body.devices } : {}),
          ...(body.controls !== undefined ? { controls: body.controls } : {}),
          ...(body.multiplayer !== undefined ? { multiplayer: body.multiplayer } : {}),
          ...(body.aiDisclosure !== undefined ? { aiDisclosure: body.aiDisclosure } : {}),
          ...(body.toolsUsed !== undefined ? { toolsUsed: body.toolsUsed } : {}),
          ...(body.coverUrl !== undefined ? { coverUrl: body.coverUrl, coverObjectKey: null } : {}),
          ...(body.screenshots
            ? {
                screenshots: {
                  create: body.screenshots.map((url, sortOrder) => ({ url, sortOrder })),
                },
              }
            : {}),
        },
        include: {
          creator: true,
          screenshots: true,
          publishedVersion: true,
          versions: true,
        },
      });
    });
    if (body.coverUrl !== undefined && existing.coverObjectKey) {
      await storage.deleteObject(env.S3_AVATARS_BUCKET, existing.coverObjectKey).catch(() => {});
    }
    return { game: toGameDetail(game, { liked: false, favorited: false, isOwner: true }) };
  });

  app.post<{ Params: { gameId: string } }>('/creator/games/:gameId/versions', async (req) => {
    requireVerifiedEmail(req);
    requireCreator(req);
    const body = parse(createVersionSchema, req.body);
    const game = await prisma.game.findUnique({ where: { id: req.params.gameId } });
    if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    requireOwnershipOrAdmin(req, game.creatorId);
    const active = await prisma.gameVersion.findFirst({
      where: {
        gameId: game.id,
        status: { in: ['UPLOADING', 'QUARANTINED', 'VALIDATING', 'READY_FOR_REVIEW', 'APPROVED'] },
      },
    });
    if (active) throw errors.conflict('Finish the current version workflow first');
    const version = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: body.version,
        changelog: body.changelog,
        aiDisclosure: body.aiDisclosure,
        toolsUsed: body.toolsUsed,
      },
    });
    return { version: toGameVersionDto(version) };
  });

  app.get<{ Params: { versionId: string } }>('/creator/game-versions/:versionId', async (req) => {
    requireCreator(req);
    const version = await prisma.gameVersion.findUnique({
      where: { id: req.params.versionId },
      include: { game: true },
    });
    if (!version) throw errors.notFound('VERSION_NOT_FOUND', 'Version not found');
    requireOwnershipOrAdmin(req, version.game.creatorId);
    return { version: toGameVersionDto(version) };
  });

  app.post<{ Params: { gameId: string } }>('/creator/games/:gameId/hide', async (req, reply) => {
    requireCreator(req);
    const game = await prisma.game.findUnique({ where: { id: req.params.gameId } });
    if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    requireOwnershipOrAdmin(req, game.creatorId);
    await prisma.game.update({ where: { id: game.id }, data: { status: 'HIDDEN' } });
    reply.status(204).send();
  });

  app.post<{ Params: { gameId: string } }>(
    '/creator/games/:gameId/upload-intent',
    { config: { rateLimit: rlPolicy('uploadIntent') } },
    async (req) => {
      const user = requireVerifiedEmail(req);
      requireCreator(req);
      const body = parse(uploadIntentSchema, req.body);
      if (body.fileSize > env.UPLOAD_MAX_COMPRESSED_MB * 1024 * 1024) {
        throw errors.tooLarge('ZIP exceeds the configured upload limit');
      }
      const version = await prisma.gameVersion.findUnique({
        where: { id: body.versionId },
        include: { game: true, upload: true },
      });
      if (!version || version.gameId !== req.params.gameId) {
        throw errors.notFound('VERSION_NOT_FOUND', 'Version not found');
      }
      if (version.game.creatorId !== user.id && user.role !== 'ADMIN') throw errors.forbidden();
      if (version.status !== 'UPLOADING' || version.upload) {
        throw errors.conflict('Upload intent already created or version is not uploadable');
      }
      const upload = await prisma.upload.create({
        data: {
          gameVersionId: version.id,
          objectKey: storageKeys.quarantineZip(version.id),
          declaredSize: BigInt(body.fileSize),
          declaredSha256: body.sha256,
          fileName: body.fileName,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
      // The browser must NEVER receive an internal MinIO URL (e.g.
      // http://minio:9000) — MinIO is private to the Docker network and
      // unreachable from a user's browser, which is what caused "Failed to
      // fetch" in production. Instead we hand back a SAME-ORIGIN API endpoint;
      // the browser PUTs the ZIP there and the API streams it into MinIO
      // internally (see PUT /uploads/:uploadId/direct below). MinIO stays
      // internal-only and is never exposed publicly.
      return {
        uploadId: upload.id,
        uploadUrl: `/api/uploads/${upload.id}/direct`,
        method: 'PUT' as const,
        headers: { 'content-type': 'application/zip' },
        expiresAt: upload.expiresAt.toISOString(),
        maxBytes: env.UPLOAD_MAX_COMPRESSED_MB * 1024 * 1024,
      };
    },
  );

  // Same-origin upload endpoint the browser actually talks to. It accepts the
  // raw ZIP (application/zip → Buffer, see addContentTypeParser in app.ts),
  // stores it into the PRIVATE quarantine bucket (MinIO/S3 in prod, fs in dev),
  // marks the upload complete, and enqueues worker validation — all server-side,
  // so the browser never touches MinIO. Works for every storage driver.
  app.put<{ Params: { uploadId: string }; Body: Buffer }>(
    '/uploads/:uploadId/direct',
    { bodyLimit: env.UPLOAD_MAX_COMPRESSED_MB * 1024 * 1024 },
    async (req) => {
      const user = requireVerifiedEmail(req); // auth required
      const upload = await prisma.upload.findUnique({
        where: { id: req.params.uploadId },
        include: { gameVersion: { include: { game: true } } },
      });
      if (!upload) throw errors.notFound('UPLOAD_NOT_FOUND', 'Upload not found');
      // Ownership: only the owning creator (or an admin) may upload to it.
      if (upload.gameVersion.game.creatorId !== user.id && user.role !== 'ADMIN') {
        throw errors.forbidden();
      }
      if (upload.expiresAt < new Date()) throw errors.conflict('Upload intent expired');
      if (upload.completedAt || upload.gameVersion.status !== 'UPLOADING') {
        throw errors.conflict('Upload was already completed');
      }
      if (!Buffer.isBuffer(req.body)) throw errors.validation();
      // Enforce the max size (bodyLimit also rejects oversized bodies with 413).
      if (req.body.length > env.UPLOAD_MAX_COMPRESSED_MB * 1024 * 1024) {
        throw errors.tooLarge('ZIP exceeds the configured upload limit');
      }
      if (BigInt(req.body.length) !== upload.declaredSize) {
        throw errors.validation([{ path: 'body', message: 'Uploaded size does not match intent' }]);
      }
      // Persist into the internal quarantine bucket. MinIO is never public.
      await storage.putObject(
        env.S3_QUARANTINE_BUCKET,
        upload.objectKey,
        req.body,
        'application/zip',
      );
      await prisma.$transaction([
        prisma.upload.update({ where: { id: upload.id }, data: { completedAt: new Date() } }),
        prisma.gameVersion.update({
          where: { id: upload.gameVersionId },
          data: {
            status: 'QUARANTINED',
            quarantineObjectKey: upload.objectKey,
            declaredSha256: upload.declaredSha256,
            compressedSize: upload.declaredSize,
          },
        }),
      ]);
      try {
        await validationQueue.enqueueValidation({
          uploadId: upload.id,
          gameVersionId: upload.gameVersionId,
        });
      } catch (error) {
        // Enqueue failed — roll back so the creator can retry the same draft.
        await prisma.$transaction([
          prisma.upload.update({ where: { id: upload.id }, data: { completedAt: null } }),
          prisma.gameVersion.update({
            where: { id: upload.gameVersionId },
            data: { status: 'UPLOADING' },
          }),
        ]);
        throw error;
      }
      await audit(prisma, {
        actorId: user.id,
        action: 'upload.completed',
        targetType: 'GAME_VERSION',
        targetId: upload.gameVersionId,
        req,
        secret: env.SESSION_SECRET,
      });
      const version = await prisma.gameVersion.findUniqueOrThrow({
        where: { id: upload.gameVersionId },
      });
      return {
        uploadId: upload.id,
        versionId: version.id,
        versionStatus: version.status,
        validationReport: version.validationReport,
      };
    },
  );

  app.post<{ Params: { uploadId: string } }>(
    '/uploads/:uploadId/complete',
    { config: { rateLimit: rlPolicy('uploadComplete') } },
    async (req) => {
      const user = requireVerifiedEmail(req);
      const upload = await prisma.upload.findUnique({
        where: { id: req.params.uploadId },
        include: { gameVersion: { include: { game: true } } },
      });
      if (!upload) throw errors.notFound('UPLOAD_NOT_FOUND', 'Upload not found');
      if (upload.gameVersion.game.creatorId !== user.id && user.role !== 'ADMIN') {
        throw errors.forbidden();
      }
      if (upload.expiresAt < new Date()) throw errors.conflict('Upload intent expired');
      if (upload.completedAt || upload.gameVersion.status !== 'UPLOADING') {
        throw errors.conflict('Upload was already completed');
      }
      const object = await storage.headObject(env.S3_QUARANTINE_BUCKET, upload.objectKey);
      if (!object) throw errors.notFound('UPLOAD_NOT_FOUND', 'Uploaded ZIP was not found');
      if (BigInt(object.size) !== upload.declaredSize) {
        throw errors.validation([
          { path: 'fileSize', message: 'Uploaded size does not match intent' },
        ]);
      }
      await prisma.$transaction([
        prisma.upload.update({ where: { id: upload.id }, data: { completedAt: new Date() } }),
        prisma.gameVersion.update({
          where: { id: upload.gameVersionId },
          data: {
            status: 'QUARANTINED',
            quarantineObjectKey: upload.objectKey,
            declaredSha256: upload.declaredSha256,
            compressedSize: upload.declaredSize,
          },
        }),
      ]);
      try {
        await validationQueue.enqueueValidation({
          uploadId: upload.id,
          gameVersionId: upload.gameVersionId,
        });
      } catch (error) {
        await prisma.$transaction([
          prisma.upload.update({ where: { id: upload.id }, data: { completedAt: null } }),
          prisma.gameVersion.update({
            where: { id: upload.gameVersionId },
            data: { status: 'UPLOADING' },
          }),
        ]);
        throw error;
      }
      await audit(prisma, {
        actorId: user.id,
        action: 'upload.completed',
        targetType: 'GAME_VERSION',
        targetId: upload.gameVersionId,
        req,
        secret: env.SESSION_SECRET,
      });
      const version = await prisma.gameVersion.findUniqueOrThrow({
        where: { id: upload.gameVersionId },
      });
      return {
        uploadId: upload.id,
        versionId: version.id,
        versionStatus: version.status,
        validationReport: version.validationReport,
      };
    },
  );

  app.get<{ Params: { uploadId: string } }>('/uploads/:uploadId/status', async (req) => {
    const user = requireCreator(req);
    const upload = await prisma.upload.findUnique({
      where: { id: req.params.uploadId },
      include: { gameVersion: { include: { game: true } } },
    });
    if (!upload) throw errors.notFound('UPLOAD_NOT_FOUND', 'Upload not found');
    if (upload.gameVersion.game.creatorId !== user.id && user.role !== 'ADMIN') {
      throw errors.forbidden();
    }
    return {
      uploadId: upload.id,
      versionId: upload.gameVersion.id,
      versionStatus: upload.gameVersion.status,
      validationReport: upload.gameVersion.validationReport,
    };
  });
}
