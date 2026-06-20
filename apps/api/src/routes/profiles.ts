import type { FastifyInstance } from 'fastify';
import {
  AVATAR_CONTENT_TYPES,
  type AvatarContentType,
  avatarCompleteSchema,
  avatarUploadIntentSchema,
  errors,
  notificationPrefsSchema,
  searchQuerySchema,
  updateProfileSchema,
  usernameSchema,
} from '@vibeplay/shared';
import { audit } from '../lib/audit.js';
import {
  avatarContentTypeForKey,
  isOwnAvatarKey,
  newAvatarObjectKey,
  sniffImageType,
} from '../lib/avatar.js';
import { sha256, signExpiringValue, verifyExpiringValue } from '../lib/crypto.js';
import { requireActiveUser } from '../lib/guards.js';
import { rlPolicy } from '../lib/rateLimit.js';
import { toCurrentUser, toGameListItem, toPublicUser } from '../lib/serializers.js';
import { clearSessionCookies } from '../lib/sessions.js';
import { parse } from '../lib/validate.js';

/** Build the public, same-origin serving URL for a freshly stored avatar. The
 *  `v` cache-buster changes per upload so browsers fetch the new image. */
function avatarServingUrl(apiOrigin: string, userId: string, objectKey: string): string {
  const v = sha256(objectKey).slice(0, 12);
  return `${apiOrigin}/api/users/${userId}/avatar?v=${v}`;
}

export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env, storage } = app;
  const maxAvatarBytes = env.UPLOAD_MAX_AVATAR_MB * 1024 * 1024;

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
      include: { subscription: true },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    });
    return { creators: creators.map(toPublicUser) };
  });

  // Public profile by username.
  app.get<{ Params: { username: string } }>('/profiles/:username', async (req) => {
    const parsed = usernameSchema.safeParse(req.params.username);
    if (!parsed.success) throw errors.notFound('USER_NOT_FOUND', 'Profile not found');

    const user = await prisma.user.findUnique({
      where: { username: parsed.data },
      include: { subscription: true },
    });
    const viewer = req.currentUser;
    const visible =
      user && (user.status === 'ACTIVE' || viewer?.id === user.id || viewer?.role === 'ADMIN');
    if (!user || !visible) throw errors.notFound('USER_NOT_FOUND', 'Profile not found');

    const games = await prisma.game.findMany({
      where: { creatorId: user.id, status: 'PUBLISHED' },
      include: { creator: { include: { subscription: true } } },
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

    // Setting/clearing an external avatarUrl supersedes any uploaded avatar:
    // detach the stored object key (and best-effort delete the orphaned object)
    // so the two representations never disagree.
    const settingAvatarUrl = body.avatarUrl !== undefined;
    const previousKey = settingAvatarUrl ? user.avatarObjectKey : null;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(settingAvatarUrl ? { avatarUrl: body.avatarUrl, avatarObjectKey: null } : {}),
      },
    });
    if (previousKey) {
      await storage.deleteObject(env.S3_AVATARS_BUCKET, previousKey).catch(() => {});
    }
    return { user: toCurrentUser(updated) };
  });

  // --- Avatar binary upload -------------------------------------------------
  // The browser uploads image bytes to the API (same-origin, exactly like the
  // game ZIP flow); the API stores them in a PRIVATE bucket. MinIO is never
  // exposed publicly, and unscanned arbitrary files can never be served.

  // 1) Intent: validate the declared image, mint a server-generated object key
  //    plus a short-lived HMAC token authorizing the matching PUT.
  app.post(
    '/me/avatar/upload-intent',
    { config: { rateLimit: rlPolicy('avatarUpload') } },
    async (req) => {
      const user = requireActiveUser(req);
      const body = parse(avatarUploadIntentSchema, req.body);
      if (body.size > maxAvatarBytes) {
        throw errors.tooLarge(`Avatar exceeds the ${env.UPLOAD_MAX_AVATAR_MB} MB limit`);
      }
      // Extension must agree with the declared content type (the bytes are
      // re-sniffed on upload). The schema's enum already rejects SVG/other types.
      const ext = body.fileName.split('.').pop()?.toLowerCase() ?? '';
      const expected = AVATAR_CONTENT_TYPES[body.contentType as AvatarContentType];
      const extOk = ext === expected || (expected === 'jpg' && ext === 'jpeg');
      if (!extOk) {
        throw errors.validation([
          { path: 'fileName', message: 'File extension does not match the image type' },
        ]);
      }
      const objectKey = newAvatarObjectKey(user.id, body.contentType as AvatarContentType);
      const expiresAt = Date.now() + 10 * 60_000;
      const token = signExpiringValue(objectKey, expiresAt, env.SESSION_SECRET);
      return {
        token,
        uploadUrl: `/api/me/avatar/upload?key=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(token)}`,
        objectKey,
        method: 'PUT' as const,
        headers: { 'content-type': body.contentType },
        maxBytes: maxAvatarBytes,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    },
  );

  // 2) Direct upload: the browser PUTs the raw image bytes here. The API verifies
  //    the signed key + size + real image magic bytes, then stores into the
  //    PRIVATE avatars bucket. The User row is only updated by step 3.
  app.put<{ Querystring: { key?: string; token?: string }; Body: Buffer }>(
    '/me/avatar/upload',
    { bodyLimit: maxAvatarBytes, config: { rateLimit: rlPolicy('avatarUpload') } },
    async (req) => {
      const user = requireActiveUser(req);
      const key = typeof req.query.key === 'string' ? req.query.key : '';
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      // The key must sit inside THIS user's prefix and carry a valid, unexpired
      // signature we issued — no IDOR, no client-controlled path traversal.
      if (!isOwnAvatarKey(user.id, key) || !verifyExpiringValue(key, token, env.SESSION_SECRET)) {
        throw errors.forbidden('Invalid or expired avatar upload token');
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw errors.validation([{ path: 'body', message: 'Empty or invalid upload' }]);
      }
      if (req.body.length > maxAvatarBytes) {
        throw errors.tooLarge(`Avatar exceeds the ${env.UPLOAD_MAX_AVATAR_MB} MB limit`);
      }
      // Reject anything that is not really one of the accepted raster images.
      // This blocks HTML/JS/SVG payloads masquerading under an image content type.
      const sniffed = sniffImageType(req.body);
      if (!sniffed) {
        throw errors.validation([
          { path: 'body', message: 'Unsupported or invalid image; use PNG, JPEG, or WebP' },
        ]);
      }
      await storage.putObject(env.S3_AVATARS_BUCKET, key, req.body, sniffed);
      return { objectKey: key };
    },
  );

  // 3) Complete: verify the object exists and belongs to the caller, then point
  //    the user's avatar at it (and best-effort delete the previous object).
  app.post(
    '/me/avatar/complete',
    { config: { rateLimit: rlPolicy('avatarUpload') } },
    async (req) => {
      const user = requireActiveUser(req);
      const body = parse(avatarCompleteSchema, req.body);
      if (!isOwnAvatarKey(user.id, body.objectKey)) {
        throw errors.forbidden('That object key is not yours');
      }
      const object = await storage.headObject(env.S3_AVATARS_BUCKET, body.objectKey);
      if (!object) throw errors.notFound('AVATAR_NOT_FOUND', 'Uploaded avatar was not found');
      if (object.size > maxAvatarBytes) {
        throw errors.tooLarge('Uploaded avatar exceeds the size limit');
      }
      const previousKey = user.avatarObjectKey;
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          avatarObjectKey: body.objectKey,
          avatarUrl: avatarServingUrl(env.API_ORIGIN, user.id, body.objectKey),
        },
      });
      if (previousKey && previousKey !== body.objectKey) {
        await storage.deleteObject(env.S3_AVATARS_BUCKET, previousKey).catch(() => {});
      }
      await audit(prisma, {
        actorId: user.id,
        action: 'avatar.updated',
        targetType: 'USER',
        targetId: user.id,
        req,
        secret: env.SESSION_SECRET,
      });
      return { user: toCurrentUser(updated) };
    },
  );

  // Remove the uploaded avatar (resets to the initials / external-URL fallback).
  app.delete('/me/avatar', async (req) => {
    const user = requireActiveUser(req);
    const previousKey = user.avatarObjectKey;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatarObjectKey: null, avatarUrl: null },
    });
    if (previousKey) {
      await storage.deleteObject(env.S3_AVATARS_BUCKET, previousKey).catch(() => {});
    }
    return { user: toCurrentUser(updated) };
  });

  // Public avatar serving: streams the stored object from the PRIVATE avatars
  // bucket so MinIO stays internal. 404 when there is no uploaded avatar (the UI
  // then renders initials or the external avatarUrl).
  app.get<{ Params: { userId: string } }>('/users/:userId/avatar', async (req, reply) => {
    const target = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { avatarObjectKey: true },
    });
    if (!target?.avatarObjectKey) {
      throw errors.notFound('AVATAR_NOT_FOUND', 'No avatar');
    }
    const buffer = await storage.getObjectBuffer(env.S3_AVATARS_BUCKET, target.avatarObjectKey);
    reply
      .header('content-type', avatarContentTypeForKey(target.avatarObjectKey))
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('content-disposition', 'inline');
    return reply.send(buffer);
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
