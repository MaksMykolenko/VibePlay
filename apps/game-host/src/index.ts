import { loadGameHostEnv } from '@vibeplay/config';
import { buildGameHost } from './app.js';

const env = loadGameHostEnv();
const app = await buildGameHost({ env });

try {
  await app.listen({ port: env.GAME_HOST_PORT, host: env.GAME_HOST_HOST });
  app.log.info(`VibePlay game host listening on ${env.GAME_HOST_HOST}:${env.GAME_HOST_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.close().then(() => process.exit(0)));
}
