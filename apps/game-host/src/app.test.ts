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
      findUnique: vi.fn(async () => ({
        status: options?.gameStatus ?? 'PUBLISHED',
        publishedVersionId: options?.publishedVersionId ?? 'version-1',
      })),
    },
    gameVersion: {
      findUnique: vi.fn(async () => ({
        gameId: 'game-1',
        status: options?.versionStatus ?? 'READY_FOR_REVIEW',
        publishedObjectPrefix: 'games/game-1/version-1/',
      })),
    },
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  } as unknown as PrismaClient;
}

describe('game host', () => {
  it('serves only the current version of a published game', async () => {
    const app = await buildGameHost({
      env,
      prisma: createPrisma(),
      storage: createStorage(),
    });
    const ok = await app.inject({ method: 'GET', url: '/g/game-1/version-1/index.html' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-security-policy']).toContain(
      'frame-ancestors https://app.example.com',
    );
    expect(ok.headers['x-frame-options']).toBeUndefined();
    await app.close();

    const hidden = await buildGameHost({
      env,
      prisma: createPrisma({ gameStatus: 'HIDDEN' }),
      storage: createStorage(),
    });
    const denied = await hidden.inject({
      method: 'GET',
      url: '/g/game-1/version-1/index.html',
    });
    expect(denied.statusCode).toBe(404);
    await hidden.close();
  });

  it('previews READY_FOR_REVIEW builds but never rejected builds', async () => {
    const token = makePreviewToken('version-1', env.PREVIEW_URL_SECRET);
    const ready = await buildGameHost({
      env,
      prisma: createPrisma(),
      storage: createStorage(),
    });
    expect(
      (
        await ready.inject({
          method: 'GET',
          url: `/preview/version-1/index.html?t=${token}`,
        })
      ).statusCode,
    ).toBe(200);
    await ready.close();

    const rejected = await buildGameHost({
      env,
      prisma: createPrisma({ versionStatus: 'REJECTED' }),
      storage: createStorage(),
    });
    expect(
      (
        await rejected.inject({
          method: 'GET',
          url: `/preview/version-1/index.html?t=${token}`,
        })
      ).statusCode,
    ).toBe(404);
    await rejected.close();
  });

  it('rejects expired and version-swapped preview tokens', () => {
    const token = makePreviewToken('version-1', env.PREVIEW_URL_SECRET, 10_000);
    expect(verifyPreviewToken('version-1', token, env.PREVIEW_URL_SECRET)).toBe(true);
    expect(verifyPreviewToken('version-2', token, env.PREVIEW_URL_SECRET)).toBe(false);
    expect(
      verifyPreviewToken(
        'version-1',
        makePreviewToken('version-1', env.PREVIEW_URL_SECRET, -1),
        env.PREVIEW_URL_SECRET,
      ),
    ).toBe(false);
  });
});
