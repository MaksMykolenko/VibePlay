import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZipFile } from 'yazl';
import type { PrismaClient } from '@vibeplay/database';
import { storageKeys, type UploadLimits } from '@vibeplay/shared';
import { createFsStorage, sha256Hex } from '@vibeplay/storage';
import type { Scanner } from './clamav.js';
import { processVersion } from './processVersion.js';

const limits: UploadLimits = {
  maxCompressedBytes: 1024 * 1024,
  maxUncompressedBytes: 1024 * 1024,
  maxFiles: 20,
  maxSingleFileBytes: 512 * 1024,
};

describe('game version processing pipeline', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'vibeplay-pipeline-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeZip(): Promise<Buffer> {
    const zipPath = path.join(root, 'fixture.zip');
    const zip = new ZipFile();
    zip.addBuffer(Buffer.from('<script src="assets/game.js"></script>'), 'index.html');
    zip.addBuffer(Buffer.from('console.log("ready")'), 'assets/game.js');
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(zipPath));
    return readFile(zipPath);
  }

  function createPrisma(declaredSha256: string) {
    const updates: string[] = [];
    const notifications: Array<{ data: { type: string } }> = [];
    const prisma = {
      gameVersion: {
        findUnique: vi.fn(async () => ({
          id: 'version-1',
          gameId: 'game-1',
          version: '1.0.0',
          status: 'QUARANTINED',
          upload: {
            id: 'upload-1',
            objectKey: storageKeys.quarantineZip('version-1'),
            declaredSha256,
          },
          game: {
            id: 'game-1',
            creatorId: 'creator-1',
            title: 'Pipeline Test',
          },
        })),
        updateMany: vi.fn(async (args: { data: { status: string } }) => {
          updates.push(args.data.status);
          return { count: 1 };
        }),
      },
      notification: {
        create: vi.fn(async (args: { data: { type: string } }) => {
          notifications.push(args);
          return args.data;
        }),
      },
    } as unknown as PrismaClient;
    return { prisma, updates, notifications };
  }

  const scanner: Scanner = {
    driver: 'clamav',
    ping: vi.fn(async () => true),
    scanFile: vi.fn(async () => ({ engine: 'clamav', result: 'clean' as const })),
  };

  it('validates, extracts, and publishes an uploaded ZIP', async () => {
    const zip = await makeZip();
    const storage = createFsStorage(root);
    await storage.putObject(
      'quarantine',
      storageKeys.quarantineZip('version-1'),
      zip,
      'application/zip',
    );
    const { prisma, updates, notifications } = createPrisma(sha256Hex(zip));

    await processVersion(
      {
        prisma,
        storage,
        scanner,
        quarantineBucket: 'quarantine',
        publishedBucket: 'published',
        limits,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
      { uploadId: 'upload-1', gameVersionId: 'version-1' },
    );

    expect(updates).toEqual(['VALIDATING', 'READY_FOR_REVIEW']);
    const index = await storage.getObjectBuffer(
      'published',
      `${storageKeys.publishedPrefix('game-1', 'version-1')}index.html`,
    );
    expect(index.toString('utf8')).toContain('assets/game.js');
    expect(notifications.at(-1)?.data.type).toBe('GAME_READY_FOR_REVIEW');
  });

  it('fails closed when the uploaded checksum does not match', async () => {
    const zip = await makeZip();
    const storage = createFsStorage(root);
    await storage.putObject('quarantine', storageKeys.quarantineZip('version-1'), zip);
    const { prisma, updates, notifications } = createPrisma('0'.repeat(64));

    await processVersion(
      {
        prisma,
        storage,
        scanner,
        quarantineBucket: 'quarantine',
        publishedBucket: 'published',
        limits,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
      { uploadId: 'upload-1', gameVersionId: 'version-1' },
    );

    expect(updates).toEqual(['VALIDATING', 'SCAN_FAILED']);
    expect(notifications.at(-1)?.data.type).toBe('GAME_VALIDATION_FAILED');
    await expect(
      storage.headObject(
        'published',
        `${storageKeys.publishedPrefix('game-1', 'version-1')}index.html`,
      ),
    ).resolves.toBeNull();
  });
});
