import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Modes:
// - default/real: talks to the VibePlay API (VITE_API_URL), BrowserRouter, no demo helpers
// - demo: GitHub Pages localStorage demo (HashRouter, demo banner, no backend)
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'demo' ? '/VibePlay/' : '/',
  define: {
    // Statically folded per importing module → guaranteed dead-code elimination
    // of all demo-only paths in the real bundle (verified by CI).
    'import.meta.env.APP_MODE': JSON.stringify(mode === 'demo' ? 'demo' : 'real'),
  },
  build: {
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
}));
