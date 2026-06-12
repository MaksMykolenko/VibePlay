import http from 'node:http';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { loadWorkerEnv } from '@vibeplay/config';
import { createPrismaClient } from '@vibeplay/database';
import { createFsStorage, createS3Storage } from '@vibeplay/storage';
import { createClamAvScanner, createDisabledScanner } from './pipeline/clamav.js';
import { processVersion, type PipelineDeps } from './pipeline/processVersion.js';

const VALIDATION_QUEUE_NAME = 'game-version-validation';

const env = loadWorkerEnv();
const log = pino({
  level: env.LOG_LEVEL,
  base: { service: 'worker' },
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
    : {}),
});

const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });
const storage =
  env.STORAGE_DRIVER === 's3'
    ? createS3Storage({
        endpoint: env.S3_ENDPOINT!,
        region: env.S3_REGION,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      })
    : createFsStorage(env.FS_STORAGE_ROOT);
const scanner =
  env.SCAN_DRIVER === 'clamav'
    ? createClamAvScanner(env.CLAMAV_HOST, env.CLAMAV_PORT)
    : createDisabledScanner();

const deps: PipelineDeps = {
  prisma,
  storage,
  scanner,
  quarantineBucket: env.S3_QUARANTINE_BUCKET,
  publishedBucket: env.S3_PUBLISHED_BUCKET,
  limits: {
    maxCompressedBytes: env.UPLOAD_MAX_COMPRESSED_MB * 1024 * 1024,
    maxUncompressedBytes: env.UPLOAD_MAX_UNCOMPRESSED_MB * 1024 * 1024,
    maxFiles: env.UPLOAD_MAX_FILES,
    maxSingleFileBytes: env.UPLOAD_MAX_SINGLE_FILE_MB * 1024 * 1024,
  },
  log,
};

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<{ uploadId: string; gameVersionId: string }>(
  VALIDATION_QUEUE_NAME,
  async (job) => {
    log.info({ jobId: job.id, versionId: job.data.gameVersionId }, 'processing validation job');
    await processVersion(deps, job.data);
  },
  {
    connection: connection as unknown as NonNullable<
      ConstructorParameters<typeof Worker>[2]
    >['connection'],
    concurrency: env.WORKER_CONCURRENCY,
  },
);

worker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, err: err.message }, 'job failed');
});

// Lightweight health endpoint for docker healthchecks.
const healthServer = http.createServer((req, res) => {
  void (async () => {
    if (req.url === '/health/ready') {
      try {
        await prisma.$queryRaw`SELECT 1`;
        await connection.ping();
        const scannerOk = await scanner.ping();
        if (!scannerOk && env.SCAN_DRIVER === 'clamav') throw new Error('clamav unreachable');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (err) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'degraded', detail: (err as Error).message }));
      }
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    }
  })();
});
healthServer.listen(env.WORKER_HEALTH_PORT, () =>
  log.info(`worker health endpoint on :${env.WORKER_HEALTH_PORT}`),
);

log.info('VibePlay worker started');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info({ signal }, 'shutting down worker');
    void worker
      .close()
      .then(() => prisma.$disconnect())
      .then(() => {
        connection.disconnect();
        healthServer.close();
        process.exit(0);
      });
  });
}
