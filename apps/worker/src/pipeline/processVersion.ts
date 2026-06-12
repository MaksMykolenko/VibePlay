/**
 * Quarantine pipeline for one uploaded GameVersion (spec §21).
 *
 * QUARANTINED → VALIDATING → READY_FOR_REVIEW | SCAN_FAILED
 *
 * Steps:
 *  1. download ZIP from the quarantine bucket to a temp file
 *  2. verify declared sha256 checksum
 *  3. validate signature / structure / limits / paths / extensions (zipValidator)
 *  4. ClamAV scan of the raw archive
 *  5. safe extraction with byte budgets (extract)
 *  6. ClamAV is also given the chance to scan extracted entries' container
 *     implicitly via the archive scan; per-file rescan is future work
 *  7. compute deterministic content hash
 *  8. upload extracted files to the immutable prefix games/{gameId}/{versionId}/
 *  9. update version status + validation report; notify the creator
 * 10. clean temp data (always)
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open as fsOpen, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@vibeplay/database';
import {
  MIME_TYPES,
  storageKeys,
  type UploadLimits,
  type ValidationReportDto,
} from '@vibeplay/shared';
import type { ObjectStorage } from '@vibeplay/storage';
import type { Scanner } from './clamav.js';
import { extractArchive } from './extract.js';
import { validateArchive, type ArchiveCheck } from './zipValidator.js';

export interface PipelineDeps {
  prisma: PrismaClient;
  storage: ObjectStorage;
  scanner: Scanner;
  quarantineBucket: string;
  publishedBucket: string;
  limits: UploadLimits;
  log: {
    info: (o: object, msg: string) => void;
    warn: (o: object, msg: string) => void;
    error: (o: object, msg: string) => void;
  };
}

export interface ProcessInput {
  uploadId: string;
  gameVersionId: string;
}

async function fileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const s = createReadStream(filePath);
    s.on('data', (c) => hash.update(c));
    s.on('end', () => resolve());
    s.on('error', reject);
  });
  return hash.digest('hex');
}

async function readFirstBytes(filePath: string, n: number): Promise<Buffer> {
  const fh = await fsOpen(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export async function processVersion(deps: PipelineDeps, input: ProcessInput): Promise<void> {
  const { prisma, storage, scanner, limits, log } = deps;

  const version = await prisma.gameVersion.findUnique({
    where: { id: input.gameVersionId },
    include: { upload: true, game: true },
  });
  if (!version || !version.upload) {
    log.warn({ input }, 'version or upload record missing; skipping');
    return;
  }
  if (version.status !== 'QUARANTINED') {
    log.warn({ versionId: version.id, status: version.status }, 'unexpected status; skipping');
    return;
  }

  // QUARANTINED → VALIDATING (guarded; concurrent workers lose the race safely)
  const moved = await prisma.gameVersion.updateMany({
    where: { id: version.id, status: 'QUARANTINED' },
    data: { status: 'VALIDATING' },
  });
  if (moved.count === 0) return;

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'vibeplay-validate-'));
  const zipPath = path.join(tmpDir, 'build.zip');
  const checks: ArchiveCheck[] = [];

  const failVersion = async (
    failReason: string,
    scannerResult: ValidationReportDto['scanner'],
  ): Promise<void> => {
    const report: ValidationReportDto = {
      ok: false,
      failReason,
      checks,
      scanner: scannerResult,
    };
    await prisma.gameVersion.updateMany({
      where: { id: version.id, status: 'VALIDATING' },
      data: { status: 'SCAN_FAILED', validationReport: report as object, rejectReason: failReason },
    });
    await prisma.notification.create({
      data: {
        userId: version.game.creatorId,
        type: 'GAME_VALIDATION_FAILED',
        title: 'Build validation failed',
        body: `Version ${version.version} of “${version.game.title}” failed validation: ${failReason}`,
        metadata: { gameId: version.gameId, versionId: version.id },
      },
    });
    log.warn({ versionId: version.id, failReason }, 'validation failed');
  };

  try {
    // 1. download
    await storage.downloadToFile(deps.quarantineBucket, version.upload.objectKey, zipPath);
    const zipStat = await stat(zipPath);
    checks.push({ name: 'download', ok: true, detail: `${zipStat.size} bytes` });

    // 2. checksum
    const actualSha = await fileSha256(zipPath);
    const checksumOk = actualSha === version.upload.declaredSha256;
    checks.push({ name: 'checksum', ok: checksumOk });
    if (!checksumOk) {
      await failVersion('uploaded file checksum does not match the declared sha256', {
        engine: 'none',
        result: 'error',
      });
      return;
    }

    // 3. structural validation
    const firstBytes = await readFirstBytes(zipPath, 8);
    const validation = await validateArchive(zipPath, zipStat.size, limits, firstBytes);
    checks.push(...validation.checks);
    if (!validation.ok) {
      await failVersion(validation.failReason ?? 'archive validation failed', {
        engine: 'none',
        result: 'error',
      });
      return;
    }

    // 4. malware scan (raw archive)
    const scan = await scanner.scanFile(zipPath);
    checks.push({
      name: 'malware scan',
      ok: scan.result === 'clean' || scan.result === 'disabled',
      detail: scan.result === 'infected' ? scan.signature : scan.detail,
    });
    if (scan.result === 'infected') {
      await failVersion(`malware detected: ${scan.signature ?? 'unknown signature'}`, scan);
      return;
    }
    if (scan.result === 'error') {
      await failVersion(`malware scan unavailable: ${scan.detail ?? 'scanner error'}`, scan);
      return;
    }

    // 5. safe extraction
    const extractDir = path.join(tmpDir, 'extracted');
    const extracted = await extractArchive(
      zipPath,
      extractDir,
      limits.maxUncompressedBytes,
      limits.maxSingleFileBytes,
    );
    checks.push({ name: 'safe extraction', ok: true, detail: `${extracted.files.length} files` });

    // 8. upload immutable extracted tree to the published bucket (private; the
    //    game-host is the only reader and checks DB state on every request).
    const prefix = storageKeys.publishedPrefix(version.gameId, version.id);
    for (const file of extracted.files) {
      const ext = path.extname(file.path).toLowerCase();
      await storage.putObject(
        deps.publishedBucket,
        `${prefix}${file.path}`,
        createReadStream(path.join(extractDir, file.path)),
        MIME_TYPES[ext] ?? 'application/octet-stream',
      );
    }
    checks.push({ name: 'immutable upload', ok: true, detail: prefix });

    // 9. final report + status
    const report: ValidationReportDto = {
      ok: true,
      checks,
      scanner: scan,
      fileCount: validation.fileCount,
      uncompressedSize: extracted.totalBytes,
      entrypoint: validation.entrypoint ?? 'index.html',
    };

    await prisma.gameVersion.updateMany({
      where: { id: version.id, status: 'VALIDATING' },
      data: {
        status: 'READY_FOR_REVIEW',
        validationReport: report as object,
        publishedObjectPrefix: prefix,
        uncompressedSize: BigInt(extracted.totalBytes),
        compressedSize: BigInt(zipStat.size),
        fileCount: validation.fileCount,
        entrypoint: validation.entrypoint ?? 'index.html',
        contentHash: extracted.contentHash,
        submittedAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        userId: version.game.creatorId,
        type: 'GAME_READY_FOR_REVIEW',
        title: 'Build passed validation',
        body: `Version ${version.version} of “${version.game.title}” passed validation and is waiting for moderation.`,
        metadata: { gameId: version.gameId, versionId: version.id },
      },
    });

    log.info({ versionId: version.id, files: validation.fileCount }, 'version ready for review');
  } catch (err) {
    log.error({ err, versionId: version.id }, 'pipeline error');
    await failVersion(`internal processing error: ${(err as Error).message.slice(0, 300)}`, {
      engine: 'none',
      result: 'error',
    });
  } finally {
    // 10. cleanup temp data
    await rm(tmpDir, { recursive: true, force: true });
  }
}
