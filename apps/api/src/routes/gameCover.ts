import type { FastifyInstance } from 'fastify';
import {
  GAME_COVER_CONTENT_TYPES,
  gameCoverCompleteSchema,
  gameCoverUploadIntentSchema,
  errors,
  type GameCoverContentType,
} from '@vibeplay/shared';
import { audit } from '../lib/audit.js';
import { sniffImageType } from '../lib/avatar.js';
import { sha256, signExpiringValue, verifyExpiringValue } from '../lib/crypto.js';
import {
  gameCoverContentTypeForKey,
  isGameCoverKey,
  newGameCoverObjectKey,
} from '../lib/gameCover.js';
import { requireCreator, requireOwnershipOrAdmin, requireVerifiedEmail } from '../lib/guards.js';
import { rlPolicy } from '../lib/rateLimit.js';
import { toGameDetail } from '../lib/serializers.js';
import { parse } from '../lib/validate.js';

const MAX_COVER_BYTES = 5 * 1024 * 1024;

function coverServingUrl(apiOrigin: string, gameId: string, objectKey: string): string {
  return `${apiOrigin}/api/games/${gameId}/cover?v=${sha256(objectKey).slice(0, 12)}`;
}

export async function registerGameCoverRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env, storage } = app;
  const mediaBucket = env.S3_AVATARS_BUCKET;

  app.post<{ Params: { gameId: string } }>(
    '/creator/games/:gameId/cover/upload-intent',
    { config: { rateLimit: rlPolicy('gameMediaUpload') } },
    async (req) => {
      requireVerifiedEmail(req);
      requireCreator(req);
      const game = await prisma.game.findUnique({ where: { id: req.params.gameId } });
      if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
      requireOwnershipOrAdmin(req, game.creatorId);

      const body = parse(gameCoverUploadIntentSchema, req.body);
      if (body.size > MAX_COVER_BYTES) {
        throw errors.tooLarge('Game cover exceeds the 5 MB limit');
      }
      const extension = body.fileName.split('.').pop()?.toLowerCase() ?? '';
      const expected = GAME_COVER_CONTENT_TYPES[body.contentType as GameCoverContentType];
      if (extension !== expected && !(expected === 'jpg' && extension === 'jpeg')) {
        throw errors.validation([
          { path: 'fileName', message: 'File extension does not match the image type' },
        ]);
      }

      const objectKey = newGameCoverObjectKey(game.id, body.contentType as GameCoverContentType);
      const expiresAt = Date.now() + 10 * 60_000;
      const token = signExpiringValue(objectKey, expiresAt, env.SESSION_SECRET);
      return {
        token,
        uploadUrl: `/api/creator/games/${game.id}/cover/upload?key=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(token)}`,
        objectKey,
        method: 'PUT' as const,
        headers: { 'content-type': body.contentType },
        maxBytes: MAX_COVER_BYTES,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    },
  );

  app.put<{
    Params: { gameId: string };
    Querystring: { key?: string; token?: string };
    Body: Buffer;
  }>(
    '/creator/games/:gameId/cover/upload',
    { bodyLimit: MAX_COVER_BYTES, config: { rateLimit: rlPolicy('gameMediaUpload') } },
    async (req) => {
      requireVerifiedEmail(req);
      requireCreator(req);
      const game = await prisma.game.findUnique({ where: { id: req.params.gameId } });
      if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
      requireOwnershipOrAdmin(req, game.creatorId);

      const key = typeof req.query.key === 'string' ? req.query.key : '';
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      if (!isGameCoverKey(game.id, key) || !verifyExpiringValue(key, token, env.SESSION_SECRET)) {
        throw errors.forbidden('Invalid or expired game cover upload token');
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw errors.validation([{ path: 'body', message: 'Empty or invalid upload' }]);
      }
      if (req.body.length > MAX_COVER_BYTES) {
        throw errors.tooLarge('Game cover exceeds the 5 MB limit');
      }

      const declaredType = req.headers['content-type']?.split(';', 1)[0];
      if (!(declaredType && declaredType in GAME_COVER_CONTENT_TYPES)) {
        throw errors.validation([{ path: 'content-type', message: 'Use PNG, JPEG, or WebP' }]);
      }
      const sniffed = sniffImageType(req.body);
      if (!sniffed || sniffed !== declaredType || sniffed !== gameCoverContentTypeForKey(key)) {
        throw errors.validation([
          { path: 'body', message: 'Image bytes, content type, and extension must match' },
        ]);
      }

      await storage.putObject(mediaBucket, key, req.body, sniffed);
      return { objectKey: key };
    },
  );

  app.post<{ Params: { gameId: string } }>(
    '/creator/games/:gameId/cover/complete',
    { config: { rateLimit: rlPolicy('gameMediaUpload') } },
    async (req) => {
      const user = requireVerifiedEmail(req);
      requireCreator(req);
      const game = await prisma.game.findUnique({ where: { id: req.params.gameId } });
      if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
      requireOwnershipOrAdmin(req, game.creatorId);

      const body = parse(gameCoverCompleteSchema, req.body);
      if (!isGameCoverKey(game.id, body.objectKey)) {
        throw errors.forbidden('That game cover object key is invalid');
      }
      const object = await storage.headObject(mediaBucket, body.objectKey);
      if (!object) throw errors.notFound('COVER_NOT_FOUND', 'Uploaded game cover was not found');
      if (object.size > MAX_COVER_BYTES) throw errors.tooLarge('Game cover exceeds the 5 MB limit');
      const bytes = await storage.getObjectBuffer(mediaBucket, body.objectKey);
      if (sniffImageType(bytes) !== gameCoverContentTypeForKey(body.objectKey)) {
        throw errors.validation([{ path: 'objectKey', message: 'Stored image is invalid' }]);
      }

      const updated = await prisma.game.update({
        where: { id: game.id },
        data: {
          coverObjectKey: body.objectKey,
          coverUrl: coverServingUrl(env.API_ORIGIN, game.id, body.objectKey),
        },
        include: {
          creator: true,
          screenshots: true,
          publishedVersion: true,
          versions: true,
        },
      });
      if (game.coverObjectKey && game.coverObjectKey !== body.objectKey) {
        await storage.deleteObject(mediaBucket, game.coverObjectKey).catch(() => {});
      }
      await audit(prisma, {
        actorId: user.id,
        action: 'game.cover_updated',
        targetType: 'GAME',
        targetId: game.id,
        req,
        secret: env.SESSION_SECRET,
      });
      return { game: toGameDetail(updated, { liked: false, favorited: false, isOwner: true }) };
    },
  );

  app.delete<{ Params: { gameId: string } }>('/creator/games/:gameId/cover', async (req) => {
    requireVerifiedEmail(req);
    requireCreator(req);
    const game = await prisma.game.findUnique({ where: { id: req.params.gameId } });
    if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
    requireOwnershipOrAdmin(req, game.creatorId);
    await prisma.game.update({
      where: { id: game.id },
      data: { coverObjectKey: null, coverUrl: null },
    });
    if (game.coverObjectKey) {
      await storage.deleteObject(mediaBucket, game.coverObjectKey).catch(() => {});
    }
    return { ok: true };
  });

  app.get<{ Params: { gameId: string } }>('/games/:gameId/cover', async (req, reply) => {
    const game = await prisma.game.findUnique({
      where: { id: req.params.gameId },
      select: { coverObjectKey: true },
    });
    if (!game?.coverObjectKey) throw errors.notFound('COVER_NOT_FOUND', 'No game cover');
    const object = await storage.headObject(mediaBucket, game.coverObjectKey);
    if (!object) throw errors.notFound('COVER_NOT_FOUND', 'No game cover');
    const buffer = await storage.getObjectBuffer(mediaBucket, game.coverObjectKey);
    reply
      .header('content-type', gameCoverContentTypeForKey(game.coverObjectKey))
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('content-disposition', 'inline');
    return reply.send(buffer);
  });
}
