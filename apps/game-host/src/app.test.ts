import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { gameHostEnvSchema } from '@vibeplay/config';
import type { PrismaClient } from '@vibeplay/database';
import type { ObjectStorage } from '@vibeplay/storage';
import { buildGameHost, makePreviewToken, verifyPreviewToken } from './app.js';

const env = gameHostEnvSchema.parse({
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  DATABASE_URL: 'postgresql://unused',
  STORAGE_DRIVER: 'fs',
  FS_STORAGE_ROOT: '.data/test',
  S3_PUBLISHED_BUCKET: 'published',
  WEB_ORIGIN: 'https://app.example.com',
  GAME_ORIGIN: 'http://games.localhost:8080',
  PREVIEW_URL_SECRET: 'preview-secret-that-is-at-least-32-characters',
  REDIS_URL: '',
  ACCESS_CACHE_TTL_SECONDS: 15,
});

function createStorage(): ObjectStorage {
  return {
    driver: 'fs',
    putObject: vi.fn(),
    getObjectStream: vi.fn(async () => Readable.from('<h1>game</h1>')),
    getObjectBuffer: vi.fn(),
    downloadToFile: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
    presignPut: vi.fn(),
    healthCheck: vi.fn(),
  } as unknown as ObjectStorage;
}

function createPrisma(options?: {
  gameStatus?: string;
  publishedVersionId?: string | null;
  versionStatus?: string;
}): PrismaClient {
  return {
    game: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        status: options?.gameStatus ?? 'PUBLISHED',
        publishedVersionId: options?.publishedVersionId ?? 'version1',
      })),
    },
    gameVersion: {
      findUnique: vi.fn(async () => ({
        gameId: 'game1',
        status: options?.versionStatus ?? 'READY_FOR_REVIEW',
        publishedObjectPrefix: 'games/game1/version1/',
      })),
    },
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  } as unknown as PrismaClient;
}

/** Inject with an explicit Host header (the router is host-based). */
function injectHost(
  app: Awaited<ReturnType<typeof buildGameHost>>,
  host: string,
  path: string,
): ReturnType<Awaited<ReturnType<typeof buildGameHost>>['inject']> {
  return app.inject({ method: 'GET', url: path, headers: { host } });
}

describe('game host (one origin per version)', () => {
  it('serves the published version from its own {version}.{game} subdomain', async () => {
    const storage = createStorage();
    const app = await buildGameHost({ env, prisma: createPrisma(), storage });

    const ok = await injectHost(app, 'version1--game1.games.localhost:8080', '/index.html');
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-security-policy']).toContain(
      'frame-ancestors https://app.example.com',
    );
    expect(storage.getObjectStream).toHaveBeenCalledWith(
      'published',
      'games/game1/version1/index.html',
    );
    await app.close();
  });

  it('refuses the shared base origin — there is no path-based fallback', async () => {
    const app = await buildGameHost({ env, prisma: createPrisma(), storage: createStorage() });
    expect(
      (await injectHost(app, 'games.localhost:8080', '/g/game1/version1/index.html')).statusCode,
    ).toBe(404);
    expect((await injectHost(app, 'games.localhost:8080', '/index.html')).statusCode).toBe(404);
    await app.close();
  });

  it('refuses foreign hosts and malformed host shapes', async () => {
    const app = await buildGameHost({ env, prisma: createPrisma(), storage: createStorage() });
    expect((await injectHost(app, 'evil.example', '/index.html')).statusCode).toBe(404);
    expect((await injectHost(app, 'a.b.c.games.localhost:8080', '/index.html')).statusCode).toBe(
      404,
    );
    expect((await injectHost(app, 'games.localhost.evil.example', '/index.html')).statusCode).toBe(
      404,
    );
    await app.close();
  });

  it('denies hidden games and version-id mismatches (cross-version isolation)', async () => {
    const hidden = await buildGameHost({
      env,
      prisma: createPrisma({ gameStatus: 'HIDDEN' }),
      storage: createStorage(),
    });
    expect(
      (await injectHost(hidden, 'version1--game1.games.localhost:8080', '/index.html')).statusCode,
    ).toBe(404);
    await hidden.close();

    // An ARCHIVED/old version id must not be servable even for a published game.
    const app = await buildGameHost({
      env,
      prisma: createPrisma({ publishedVersionId: 'version2' }),
      storage: createStorage(),
    });
    expect(
      (await injectHost(app, 'version1--game1.games.localhost:8080', '/index.html')).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('previews READY_FOR_REVIEW builds on {version}.preview.<base> with a valid token', async () => {
    const token = makePreviewToken('version1', env.PREVIEW_URL_SECRET);
    const ready = await buildGameHost({ env, prisma: createPrisma(), storage: createStorage() });

    expect(
      (await injectHost(ready, 'version1--preview.games.localhost:8080', `/${token}/index.html`))
        .statusCode,
    ).toBe(200);
    // Missing or garbage token → 403.
    expect(
      (await injectHost(ready, 'version1--preview.games.localhost:8080', '/index.html')).statusCode,
    ).toBe(403);
    await ready.close();

    const rejected = await buildGameHost({
      env,
      prisma: createPrisma({ versionStatus: 'REJECTED' }),
      storage: createStorage(),
    });
    expect(
      (await injectHost(rejected, 'version1--preview.games.localhost:8080', `/${token}/index.html`))
        .statusCode,
    ).toBe(404);
    await rejected.close();
  });

  it('rejects expired and version-swapped preview tokens', () => {
    const token = makePreviewToken('version1', env.PREVIEW_URL_SECRET, 10_000);
    expect(verifyPreviewToken('version1', token, env.PREVIEW_URL_SECRET)).toBe(true);
    expect(verifyPreviewToken('version2', token, env.PREVIEW_URL_SECRET)).toBe(false);
    expect(
      verifyPreviewToken(
        'version1',
        makePreviewToken('version1', env.PREVIEW_URL_SECRET, -1),
        env.PREVIEW_URL_SECRET,
      ),
    ).toBe(false);
  });

  it('keeps the preview token in relative asset paths', async () => {
    const storage = createStorage();
    const token = makePreviewToken('version1', env.PREVIEW_URL_SECRET);
    const app = await buildGameHost({ env, prisma: createPrisma(), storage });

    const asset = await injectHost(
      app,
      'version1--preview.games.localhost:8080',
      `/${token}/assets/game.js`,
    );

    expect(asset.statusCode).toBe(200);
    expect(storage.getObjectStream).toHaveBeenCalledWith(
      'published',
      'games/game1/version1/assets/game.js',
    );
    await app.close();
  });

  it('serves health and the SDK regardless of host (reserved paths)', async () => {
    const app = await buildGameHost({ env, prisma: createPrisma(), storage: createStorage() });
    expect(
      (await injectHost(app, 'version1--game1.games.localhost:8080', '/health/live')).statusCode,
    ).toBe(200);
    await app.close();
  });
});
