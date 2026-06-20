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

const IMAGE_FIXTURES = {
  'image/png': {
    fileName: 'cover.png',
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  },
  'image/jpeg': {
    fileName: 'cover.jpeg',
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]),
  },
  'image/webp': {
    fileName: 'cover.webp',
    bytes: Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
  },
} as const;

describe('game covers and supported devices', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let creator: Awaited<ReturnType<typeof createUser>>;
  let other: Awaited<ReturnType<typeof createUser>>;
  let player: Awaited<ReturnType<typeof createUser>>;
  let creatorAgent: AuthedAgent;
  let otherAgent: AuthedAgent;
  let playerAgent: AuthedAgent;

  beforeAll(async () => {
    const context = await buildTestApp({}, async () => {});
    app = context.app;
    prisma = context.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    [creator, other, player] = await Promise.all([
      createUser(prisma, app.env, {
        email: 'cover-owner@example.com',
        username: 'cover_owner',
        role: 'CREATOR',
      }),
      createUser(prisma, app.env, {
        email: 'cover-other@example.com',
        username: 'cover_other',
        role: 'CREATOR',
      }),
      createUser(prisma, app.env, {
        email: 'cover-player@example.com',
        username: 'cover_player',
      }),
    ]);
    [creatorAgent, otherAgent, playerAgent] = await Promise.all([
      loginAs(app, creator.email),
      loginAs(app, other.email),
      loginAs(app, player.email),
    ]);
  });

  async function createGame() {
    return prisma.game.create({
      data: {
        creatorId: creator.id,
        slug: `cover-game-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: 'Cover Test Game',
        shortDescription: 'A game used to test cover image editing.',
        description: 'This published game validates secure media and supported devices.',
        category: 'Arcade',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }

  async function coverIntent(
    gameId: string,
    contentType: string,
    fileName: string,
    size: number,
    agent = creatorAgent,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/cover/upload-intent`,
      ...authed(agent),
      payload: { contentType, fileName, size },
    });
  }

  async function uploadAndComplete(
    gameId: string,
    contentType: keyof typeof IMAGE_FIXTURES,
    agent = creatorAgent,
  ) {
    const fixture = IMAGE_FIXTURES[contentType];
    const intent = await coverIntent(
      gameId,
      contentType,
      fixture.fileName,
      fixture.bytes.length,
      agent,
    );
    expect(intent.statusCode, intent.body).toBe(200);
    const { uploadUrl, objectKey } = intent.json();
    expect(objectKey).toMatch(new RegExp(`^games/${gameId}/media/cover/`));
    expect(intent.body).not.toContain('minio');

    const upload = await app.inject({
      method: 'PUT',
      url: uploadUrl,
      ...authed(agent),
      headers: { ...authed(agent).headers, 'content-type': contentType },
      payload: fixture.bytes,
    });
    expect(upload.statusCode, upload.body).toBe(200);

    const complete = await app.inject({
      method: 'POST',
      url: `/api/creator/games/${gameId}/cover/complete`,
      ...authed(agent),
      payload: { objectKey },
    });
    expect(complete.statusCode, complete.body).toBe(200);
    return { complete, fixture, objectKey };
  }

  it('lets the creator upload/change PNG, JPEG, and WebP covers and serves them privately', async () => {
    const game = await createGame();

    for (const contentType of Object.keys(IMAGE_FIXTURES) as (keyof typeof IMAGE_FIXTURES)[]) {
      const { complete, fixture } = await uploadAndComplete(game.id, contentType);
      expect(complete.json().game.coverUrl).toContain(`/api/games/${game.id}/cover?v=`);
      const served = await app.inject({ method: 'GET', url: `/api/games/${game.id}/cover` });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toContain(contentType);
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.rawPayload).toEqual(fixture.bytes);
    }
  });

  it('forbids another creator and a player from updating the cover', async () => {
    const game = await createGame();
    const fixture = IMAGE_FIXTURES['image/png'];
    const otherResult = await coverIntent(
      game.id,
      'image/png',
      fixture.fileName,
      fixture.bytes.length,
      otherAgent,
    );
    const playerResult = await coverIntent(
      game.id,
      'image/png',
      fixture.fileName,
      fixture.bytes.length,
      playerAgent,
    );
    expect(otherResult.statusCode).toBe(403);
    expect(playerResult.statusCode).toBe(403);
  });

  it('rejects SVG, oversized images, and spoofed image bytes', async () => {
    const game = await createGame();
    const svg = await coverIntent(game.id, 'image/svg+xml', 'cover.svg', 100);
    const oversized = await coverIntent(game.id, 'image/png', 'cover.png', 5 * 1024 * 1024 + 1);
    expect(svg.statusCode).toBe(422);
    expect(oversized.statusCode).toBe(413);

    const fixture = IMAGE_FIXTURES['image/png'];
    const intent = await coverIntent(game.id, 'image/png', fixture.fileName, fixture.bytes.length);
    const upload = await app.inject({
      method: 'PUT',
      url: intent.json().uploadUrl,
      ...authed(creatorAgent),
      headers: { ...authed(creatorAgent).headers, 'content-type': 'image/png' },
      payload: Buffer.from('<svg></svg>!'),
    });
    expect(upload.statusCode).toBe(422);
  });

  it('includes the uploaded cover URL in card and detail serializers', async () => {
    const game = await createGame();
    await uploadAndComplete(game.id, 'image/png');

    const catalog = await app.inject({ method: 'GET', url: '/api/games?sort=newest' });
    expect(catalog.statusCode, catalog.body).toBe(200);
    const card = catalog.json().items.find((item: { id: string }) => item.id === game.id);
    expect(card.coverUrl).toContain(`/api/games/${game.id}/cover?v=`);
    expect(card.devices).toEqual(['desktop']);

    const detail = await app.inject({ method: 'GET', url: `/api/games/${game.slug}` });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().game.coverUrl).toBe(card.coverUrl);
  });

  it('lets the owner update devices, normalizes duplicates, and rejects invalid or empty values', async () => {
    const game = await createGame();
    const valid = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      ...authed(creatorAgent),
      payload: { devices: ['desktop', 'mobile', 'mobile', 'gamepad'] },
    });
    expect(valid.statusCode, valid.body).toBe(200);
    expect(valid.json().game.devices).toEqual(['desktop', 'mobile', 'gamepad']);

    for (const devices of [[], ['desktop', 'console']]) {
      const invalid = await app.inject({
        method: 'PATCH',
        url: `/api/creator/games/${game.id}`,
        ...authed(creatorAgent),
        payload: { devices },
      });
      expect(invalid.statusCode, invalid.body).toBe(422);
    }
  });

  it('forbids non-owner creators and players from updating devices', async () => {
    const game = await createGame();
    for (const agent of [otherAgent, playerAgent]) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/creator/games/${game.id}`,
        ...authed(agent),
        payload: { devices: ['mobile'] },
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('lets a creator save normalized controls and returns them from creator and public details', async () => {
    const game = await createGame();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      ...authed(creatorAgent),
      payload: {
        controls: [
          { action: '  Move  ', keys: '  WASD / Arrow keys  ' },
          { action: '   ', keys: '   ' },
          { action: 'Pause / Back', keys: 'Esc' },
        ],
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().game.controls).toEqual([
      { action: 'Move', keys: 'WASD / Arrow keys' },
      { action: 'Pause / Back', keys: 'Esc' },
    ]);

    const creatorDetail = await app.inject({
      method: 'GET',
      url: `/api/creator/games/${game.id}`,
      ...authed(creatorAgent),
    });
    expect(creatorDetail.statusCode, creatorDetail.body).toBe(200);
    expect(creatorDetail.json().game.controls).toEqual(response.json().game.controls);

    const publicDetail = await app.inject({ method: 'GET', url: `/api/games/${game.slug}` });
    expect(publicDetail.statusCode, publicDetail.body).toBe(200);
    expect(publicDetail.json().game.controls).toEqual(response.json().game.controls);
  });

  it("forbids non-owner creators and players from updating another game's controls", async () => {
    const game = await createGame();
    for (const agent of [otherAgent, playerAgent]) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/creator/games/${game.id}`,
        ...authed(agent),
        payload: { controls: [{ action: 'Move', keys: 'WASD' }] },
      });
      expect(response.statusCode).toBe(403);
    }
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).controls).toEqual([]);
  });

  it('rejects invalid controls payloads', async () => {
    const game = await createGame();
    const invalidControls = [
      'WASD',
      [{ action: 'Move', keys: 'WASD', html: '<script>alert(1)</script>' }],
      [{ action: 'x'.repeat(81), keys: 'WASD' }],
      [{ action: 'Move', keys: 'x'.repeat(121) }],
      Array.from({ length: 31 }, () => ({ action: 'Move', keys: 'WASD' })),
    ];

    for (const controls of invalidControls) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/creator/games/${game.id}`,
        ...authed(creatorAgent),
        payload: { controls },
      });
      expect(response.statusCode, response.body).toBe(422);
    }
  });

  it('blocks an unverified creator from changing cover or device metadata', async () => {
    const game = await createGame();
    await prisma.user.update({ where: { id: creator.id }, data: { emailVerifiedAt: null } });
    const fixture = IMAGE_FIXTURES['image/png'];
    const cover = await coverIntent(game.id, 'image/png', fixture.fileName, fixture.bytes.length);
    const devices = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      ...authed(creatorAgent),
      payload: { devices: ['desktop'] },
    });
    expect(cover.statusCode).toBe(403);
    expect(cover.json().error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(devices.statusCode).toBe(403);
    expect(devices.json().error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('does not change the published version when cover, device, or controls metadata changes', async () => {
    const game = await createGame();
    const version = await prisma.gameVersion.create({
      data: {
        gameId: game.id,
        version: '1.0.0',
        status: 'PUBLISHED',
        publishedObjectPrefix: `games/${game.id}/version-content/`,
      },
    });
    await prisma.game.update({ where: { id: game.id }, data: { publishedVersionId: version.id } });

    await uploadAndComplete(game.id, 'image/webp');
    const deviceUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      ...authed(creatorAgent),
      payload: { devices: ['desktop', 'tablet'] },
    });
    expect(deviceUpdate.statusCode, deviceUpdate.body).toBe(200);
    const controlsUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/creator/games/${game.id}`,
      ...authed(creatorAgent),
      payload: { controls: [{ action: 'Move', keys: 'WASD' }] },
    });
    expect(controlsUpdate.statusCode, controlsUpdate.body).toBe(200);
    expect(
      (await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).publishedVersionId,
    ).toBe(version.id);
  });
});
