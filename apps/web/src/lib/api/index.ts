import { createHttpClient } from './http';
import type { ApiClient } from './types';

export type { ApiClient } from './types';
export * from './errors';

/**
 * Singleton API client. `import.meta.env.APP_MODE` is statically folded by
 * Vite, so in the real build the demo branch (and its dynamic import) is
 * eliminated entirely — no demo accounts, no localStorage persistence
 * (verified by infra/scripts/check-real-bundle.sh in CI).
 */
export const api: ApiClient =
  import.meta.env.APP_MODE === 'demo'
    ? (await import('./demo/index')).createDemoClient()
    : createHttpClient();
