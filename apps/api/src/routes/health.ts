import type { FastifyInstance } from 'fastify';
import net from 'node:net';
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
    if (app.env.NODE_ENV === 'production') {
      await time('clamav', () => pingClamAv(app.env.CLAMAV_HOST, app.env.CLAMAV_PORT));
      await time('smtp', () => app.mailer.verify());
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    const body: HealthDto = { status: allOk ? 'ok' : 'degraded', checks };
    reply.status(allOk ? 200 : 503).send(body);
  });
}

function pingClamAv(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => socket.destroy(new Error('ClamAV readiness timed out')), 5_000);
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      clearTimeout(timer);
      const response = Buffer.concat(chunks).toString('utf8').replaceAll('\0', '').trim();
      if (response === 'PONG') resolve();
      else reject(new Error('ClamAV readiness returned an invalid response'));
    });
    socket.on('connect', () => socket.end('zPING\0'));
  });
}
