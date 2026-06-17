import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ApiEnv } from '@vibeplay/config';

/** Job payload contract shared with the worker (apps/worker). */
export interface ValidateVersionJob {
  uploadId: string;
  gameVersionId: string;
}

export const VALIDATION_QUEUE_NAME = 'game-version-validation';

export interface ValidationQueue {
  readonly driver: 'bullmq' | 'inline';
  enqueueValidation(job: ValidateVersionJob): Promise<void>;
  /** Notify game-host to invalidate its access cache for a specific game. */
  publishGameInvalidation(gameId: string): Promise<void>;
  close(): Promise<void>;
}

export type InlineProcessor = (job: ValidateVersionJob) => Promise<void>;

/**
 * BullMQ-backed queue for real deployments; `inline` driver runs the supplied
 * processor immediately (used by integration tests and fs-only dev mode).
 */
export function createValidationQueue(
  env: ApiEnv,
  inlineProcessor?: InlineProcessor,
): { queue: ValidationQueue; redisPing: (() => Promise<void>) | null } {
  if (env.QUEUE_DRIVER === 'inline') {
    return {
      queue: {
        driver: 'inline',
        async enqueueValidation(job) {
          if (!inlineProcessor) {
            throw new Error('inline queue driver requires an inline processor');
          }
          // Fire and forget, like a real queue; errors surface via version status.
          void inlineProcessor(job).catch((err) => {
            console.error('inline validation job failed', err);
          });
        },
        async publishGameInvalidation() {
          // no-op: inline driver has no Redis and no separate game-host.
        },
        async close() {},
      },
      redisPing: null,
    };
  }

  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(VALIDATION_QUEUE_NAME, {
    connection: connection as unknown as NonNullable<
      ConstructorParameters<typeof Queue>[1]
    >['connection'],
  });

  return {
    queue: {
      driver: 'bullmq',
      async enqueueValidation(job) {
        await queue.add('validate', job, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        });
      },
      async publishGameInvalidation(gameId: string) {
        await connection.publish('vibeplay:game-host:invalidate', gameId);
      },
      async close() {
        await queue.close();
        connection.disconnect();
      },
    },
    redisPing: async () => {
      await connection.ping();
    },
  };
}
