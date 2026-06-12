/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected via vite.config define: 'real' | 'demo'. Statically folded per module. */
  readonly APP_MODE: 'real' | 'demo';
  readonly VITE_API_URL?: string;
  readonly VITE_GAME_ORIGIN?: string;
  readonly VITE_ENABLE_DEMO_ROLES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
