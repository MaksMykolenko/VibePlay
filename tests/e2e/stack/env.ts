/** Shared E2E stack configuration (single source of truth for ports/origins). */

const webUrl = process.env.E2E_WEB_URL ?? 'http://localhost:8088';
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8089';
const gameOrigin = process.env.E2E_GAME_ORIGIN ?? 'http://games.localhost:8090';
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://vibeplay:vibeplay@127.0.0.1:55434/vibeplay_e2e';

function portOf(url: string, defaultPort: number): number {
  const port = new URL(url).port;
  return port ? Number(port) : defaultPort;
}

export const E2E = {
  webPort: portOf(webUrl, 80),
  apiPort: portOf(apiUrl, 80),
  gameHostPort: portOf(gameOrigin, 80),
  pgPort: portOf(databaseUrl, 5432),
  webUrl,
  apiUrl,
  gameOrigin,
  databaseUrl,
  adminEmail: 'admin@e2e.vibeplay.local',
  adminPassword: 'admin-e2e-password-1',
  sessionSecret: 'e2e-session-secret-0123456789abcdef0123456789abcdef',
  passwordPepper: 'e2e-pepper-0123456789abcdef',
  previewSecret: 'e2e-preview-secret-0123456789abcdef0123456789ab',
} as const;
