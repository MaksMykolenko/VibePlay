import { loadApiEnv } from '@vibeplay/config';
import { buildApp } from './app.js';

const env = loadApiEnv();
const app = await buildApp({ env });

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(`VibePlay API listening on ${env.API_HOST}:${env.API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}
