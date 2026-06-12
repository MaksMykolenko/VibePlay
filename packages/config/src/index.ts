import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

/**
 * Fail-fast environment validation (spec §8).
 * Each service loads only what it needs; missing critical config aborts startup
 * with a readable list of problems and never prints secret values.
 */

const booleanish = z
  .string()
  .transform((v) => ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()))
  .or(z.boolean());

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const originsSchema = z.object({
  WEB_ORIGIN: z.url(),
  API_ORIGIN: z.url(),
  GAME_ORIGIN: z.url(),
});

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

const redisSchema = z.object({
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
});

const secretsSchema = z.object({
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  PASSWORD_PEPPER: z.string().min(16, 'PASSWORD_PEPPER must be at least 16 chars'),
  PREVIEW_URL_SECRET: z.string().min(32, 'PREVIEW_URL_SECRET must be at least 32 chars'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .default(336),
});

const storageSchema = z
  .object({
    STORAGE_DRIVER: z.enum(['s3', 'fs']).default('s3'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_QUARANTINE_BUCKET: z.string().default('vibeplay-quarantine'),
    S3_PUBLISHED_BUCKET: z.string().default('vibeplay-published'),
    S3_FORCE_PATH_STYLE: booleanish.default(true),
    S3_PUBLIC_ENDPOINT: z.string().optional(),
    FS_STORAGE_ROOT: z.string().default('.data/storage'),
  })
  .check((ctx) => {
    const v = ctx.value;
    if (v.STORAGE_DRIVER === 's3') {
      for (const k of ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!v[k]) {
          ctx.issues.push({
            code: 'custom',
            message: `${k} is required when STORAGE_DRIVER=s3`,
            input: v,
            path: [k],
          });
        }
      }
    }
  });

const scanSchema = z
  .object({
    SCAN_DRIVER: z.enum(['clamav', 'off']).default('clamav'),
    CLAMAV_HOST: z.string().default('localhost'),
    CLAMAV_PORT: z.coerce.number().int().default(3310),
  })
  .check((ctx) => {
    if (ctx.value.SCAN_DRIVER === 'off' && process.env.NODE_ENV === 'production') {
      ctx.issues.push({
        code: 'custom',
        message: 'SCAN_DRIVER=off is not allowed in production',
        input: ctx.value,
        path: ['SCAN_DRIVER'],
      });
    }
  });

const emailSchema = z.object({
  EMAIL_DRIVER: z.enum(['smtp', 'memory']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: booleanish.default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().default('VibePlay <no-reply@vibeplay.local>'),
});

const uploadSchema = z.object({
  UPLOAD_MAX_COMPRESSED_MB: z.coerce.number().int().min(1).default(50),
  UPLOAD_MAX_UNCOMPRESSED_MB: z.coerce.number().int().min(1).default(250),
  UPLOAD_MAX_FILES: z.coerce.number().int().min(1).default(5000),
  UPLOAD_MAX_SINGLE_FILE_MB: z.coerce.number().int().min(1).default(50),
});

const betaSchema = z.object({
  INVITE_ONLY: booleanish.default(true),
  SENTRY_DSN: z.string().optional().default(''),
});

export const apiEnvSchema = baseSchema
  .extend(originsSchema.shape)
  .extend(databaseSchema.shape)
  .extend(redisSchema.shape)
  .extend(secretsSchema.shape)
  .extend(storageSchema.shape)
  .extend(scanSchema.shape)
  .extend(emailSchema.shape)
  .extend(uploadSchema.shape)
  .extend(betaSchema.shape)
  .extend({
    API_PORT: z.coerce.number().int().default(3000),
    API_HOST: z.string().default('0.0.0.0'),
    TRUST_PROXY: booleanish.default(false),
    QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
    TEST_MAILBOX: booleanish.default(false),
  });

export const workerEnvSchema = baseSchema
  .extend(databaseSchema.shape)
  .extend(redisSchema.shape)
  .extend(storageSchema.shape)
  .extend(scanSchema.shape)
  .extend(uploadSchema.shape)
  .extend({
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
    WORKER_HEALTH_PORT: z.coerce.number().int().default(3002),
  });

export const gameHostEnvSchema = baseSchema
  .extend(databaseSchema.shape)
  .extend(storageSchema.shape)
  .extend({
    GAME_HOST_PORT: z.coerce.number().int().default(8080),
    GAME_HOST_HOST: z.string().default('0.0.0.0'),
    WEB_ORIGIN: z.url(),
    PREVIEW_URL_SECRET: z.string().min(32),
    REDIS_URL: z.string().optional().default(''),
    /** Positive lookup cache TTL; hidden games stop serving within this window. */
    ACCESS_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(120).default(15),
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type GameHostEnv = z.infer<typeof gameHostEnvSchema>;

let dotenvLoaded = false;

function ensureDotenv(): void {
  if (!dotenvLoaded) {
    // Loads .env from CWD if present; real deployments use actual env vars.
    loadDotenv({ quiet: true });
    dotenvLoaded = true;
  }
}

function parseOrExit<T>(schema: z.ZodType<T>, source: NodeJS.ProcessEnv, service: string): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    console.error(
      `[${service}] Refusing to start: invalid environment configuration:\n${lines.join('\n')}\n` +
        'See .env.example for the full list of variables.',
    );
    process.exit(1);
  }
  return result.data;
}

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  ensureDotenv();
  return parseOrExit(apiEnvSchema, env, 'api');
}

export function loadWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  ensureDotenv();
  return parseOrExit(workerEnvSchema, env, 'worker');
}

export function loadGameHostEnv(env: NodeJS.ProcessEnv = process.env): GameHostEnv {
  ensureDotenv();
  return parseOrExit(gameHostEnvSchema, env, 'game-host');
}
