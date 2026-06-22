import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    'packages/database/src/generated/**',
    'playwright-report/**',
    'test-results/**',
    '.data/**',
  ]),
  // Frontend (browser)
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'apps/web/src/hooks/useAuth.tsx',
      'apps/web/src/hooks/useGames.tsx',
      'apps/web/src/hooks/useTheme.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // SDK (browser, no react)
  {
    files: ['packages/sdk/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Shared package (isomorphic)
  {
    files: ['packages/shared/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  // Backend / node
  {
    files: [
      'apps/api/**/*.ts',
      'apps/worker/**/*.ts',
      'apps/game-host/**/*.ts',
      'packages/config/**/*.ts',
      'packages/database/src/**/*.ts',
      'packages/database/prisma.config.ts',
      'packages/storage/**/*.ts',
      'e2e/**/*.ts',
      'playwright.config.ts',
    ],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Plain JS scripts
  {
    files: ['infra/**/*.mjs', 'fixtures/**/*.mjs', 'apps/web/scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
