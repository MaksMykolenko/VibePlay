import { describe, expect, it } from 'vitest';
import { apiEnvSchema, gameHostEnvSchema, workerEnvSchema } from './index.js';

const common = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'http://minio:9000',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test-secret',
  SCAN_DRIVER: 'clamav',
};

const api = {
  ...common,
  WEB_ORIGIN: 'https://beta.vibeplay.example',
  API_ORIGIN: 'https://beta.vibeplay.example',
  GAME_ORIGIN: 'https://games.vibeplayusercontent.example',
  SESSION_SECRET: 'session-secret-that-is-at-least-32-characters',
  PASSWORD_PEPPER: 'password-pepper-long-enough',
  PREVIEW_URL_SECRET: 'preview-secret-that-is-at-least-32-characters',
  EMAIL_DRIVER: 'smtp',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  GOOGLE_REDIRECT_URI: 'https://beta.vibeplay.example/api/auth/google/callback',
  STRIPE_SECRET_KEY: 'sk_test_config',
  STRIPE_WEBHOOK_SECRET: 'whsec_config',
  STRIPE_CREATOR_PLUS_PRICE_ID: 'price_config',
  PUBLIC_APP_URL: 'https://beta.vibeplay.example',
};

describe('production safety validation', () => {
  it('accepts production with ClamAV, SMTP, S3, and a separate UGC domain', () => {
    expect(apiEnvSchema.safeParse(api).success).toBe(true);
    expect(workerEnvSchema.safeParse(common).success).toBe(true);
    expect(
      gameHostEnvSchema.safeParse({
        ...common,
        WEB_ORIGIN: api.WEB_ORIGIN,
        GAME_ORIGIN: api.GAME_ORIGIN,
        PREVIEW_URL_SECRET: api.PREVIEW_URL_SECRET,
      }).success,
    ).toBe(true);
  });

  it.each(['none', 'off'])('rejects production SCAN_DRIVER=%s', (scanDriver) => {
    expect(workerEnvSchema.safeParse({ ...common, SCAN_DRIVER: scanDriver }).success).toBe(false);
  });

  it.each([
    ['development', 'none'],
    ['development', 'off'],
    ['test', 'none'],
    ['test', 'off'],
  ])('allows %s SCAN_DRIVER=%s', (nodeEnv, scanDriver) => {
    expect(
      workerEnvSchema.safeParse({ ...common, NODE_ENV: nodeEnv, SCAN_DRIVER: scanDriver }).success,
    ).toBe(true);
  });

  it('rejects memory email and filesystem storage in production', () => {
    expect(apiEnvSchema.safeParse({ ...api, EMAIL_DRIVER: 'memory' }).success).toBe(false);
    expect(
      apiEnvSchema.safeParse({
        ...api,
        STORAGE_DRIVER: 'fs',
        S3_ENDPOINT: undefined,
        S3_ACCESS_KEY_ID: undefined,
        S3_SECRET_ACCESS_KEY: undefined,
      }).success,
    ).toBe(false);
  });

  it('rejects the same host or registrable domain for production UGC', () => {
    expect(apiEnvSchema.safeParse({ ...api, GAME_ORIGIN: api.WEB_ORIGIN }).success).toBe(false);
    expect(
      apiEnvSchema.safeParse({ ...api, GAME_ORIGIN: 'https://games.vibeplay.example' }).success,
    ).toBe(false);
  });
});
