import type { FastifyInstance } from 'fastify';
import type { HealthDto } from '@vibeplay/shared';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/live', async () => ({ status: 'ok' }));

  app.get('/ready', async (req, reply) => {
    const checks: HealthDto['checks'] = {};

    const time = async (name: string, fn: () => Promise<void>) => {
      const start = Date.now();
      try {
        await fn();
        checks[name] = { ok: true, latencyMs: Date.now() - start };
      } catch (err) {
        checks[name] = { ok: false, detail: (err as Error).message?.slice(0, 200) };
      }
    };

    await time('database', async () => {
      await app.prisma.$queryRaw`SELECT 1`;
    });
    await time('storage', async () => {
      await app.storage.healthCheck(app.env.S3_QUARANTINE_BUCKET);
    });
    if (app.redisPing) {
      await time('redis', async () => {
        await app.redisPing!();
      });
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    const body: HealthDto = { status: allOk ? 'ok' : 'degraded', checks };
    reply.status(allOk ? 200 : 503).send(body);
  });
}
