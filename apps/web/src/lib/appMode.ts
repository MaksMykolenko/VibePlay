/**
 * App mode (spec §12, §43):
 * - real  — talks to the VibePlay API; no demo helpers exist in the bundle.
 * - demo  — GitHub Pages build: localStorage data, demo banner, optional role switcher.
 *
 * IMPORTANT: for code that must be removed from the real bundle, gate it with
 * `import.meta.env.APP_MODE === 'demo'` INLINE in that module — Vite folds the
 * value per module, so the minifier eliminates the branch. These exported
 * constants are for runtime display logic only.
 */
export const APP_MODE: 'real' | 'demo' = import.meta.env.APP_MODE ?? 'real';

export const IS_DEMO = APP_MODE === 'demo';

/** Demo role switcher requires BOTH demo mode and the explicit env flag. */
export const DEMO_ROLES_ENABLED =
  IS_DEMO && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_ROLES === 'true');

export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';

export const GAME_ORIGIN: string =
  import.meta.env.VITE_GAME_ORIGIN ?? 'http://games.localhost:8080';
