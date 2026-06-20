import { request, type APIRequestContext, type Page, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { E2E } from './stack/env.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURES = path.join(repoRoot, 'fixtures/generated');

/**
 * Unique suffix short enough that `prefix + suffix` stays a valid username
 * (≤20 chars: a-z, 0-9, underscore) for prefixes up to ~12 chars.
 */
export function uniq(prefix: string): string {
  const stamp = Date.now().toString(36).slice(-6);
  const rand = Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0');
  return `${prefix}${stamp}${rand}`;
}

export interface ApiAgent {
  ctx: APIRequestContext;
  csrf: string;
}

async function csrfOf(ctx: APIRequestContext): Promise<string> {
  const state = await ctx.storageState();
  const cookie = state.cookies.find((c) => c.name === 'vp_csrf');
  return cookie?.value ?? '';
}

/** Login through the real API; returns a context carrying session cookies. */
export async function apiLogin(email: string, password: string): Promise<ApiAgent> {
  const ctx = await request.newContext({ baseURL: E2E.apiUrl });
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  if (!res.ok()) throw new Error(`apiLogin(${email}) failed: ${res.status()} ${await res.text()}`);
  return { ctx, csrf: await csrfOf(ctx) };
}

export async function apiGuest(): Promise<ApiAgent> {
  return { ctx: await request.newContext({ baseURL: E2E.apiUrl }), csrf: '' };
}

export function authHeaders(agent: ApiAgent): Record<string, string> {
  return agent.csrf ? { 'x-csrf-token': agent.csrf } : {};
}

export async function adminAgent(): Promise<ApiAgent> {
  return apiLogin(E2E.adminEmail, E2E.adminPassword);
}

/** Create a single-use invite as admin and return the code. */
export async function createInvite(
  admin: ApiAgent,
  role: 'PLAYER' | 'CREATOR',
  email?: string,
): Promise<string> {
  const res = await admin.ctx.post('/api/admin/invites', {
    headers: authHeaders(admin),
    data: { role, expiresInDays: 7, ...(email ? { email } : {}) },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).invite.code as string;
}

/** Read the newest mail for a recipient from the test mailbox. */
export async function latestMail(
  agent: ApiAgent,
  to: string,
): Promise<{ subject: string; text: string } | null> {
  const res = await agent.ctx.get(`/api/test/mailbox?to=${encodeURIComponent(to)}`);
  expect(res.ok()).toBeTruthy();
  const { messages } = (await res.json()) as { messages: { subject: string; text: string }[] };
  return messages.at(-1) ?? null;
}

export function extractToken(mailText: string, param = 'token'): string {
  const match = mailText.match(new RegExp(`[?&]${param}=([A-Za-z0-9_\\-%.]+)`));
  if (!match) throw new Error(`token not found in mail: ${mailText}`);
  return decodeURIComponent(match[1]!);
}

/**
 * Register a verified creator end-to-end through the API:
 * invite → register → read verification email → verify.
 */
export async function registerVerifiedCreator(admin: ApiAgent): Promise<{
  agent: ApiAgent;
  email: string;
  username: string;
  password: string;
}> {
  const username = uniq('creator');
  const email = `${username}@e2e.vibeplay.local`;
  const password = 'creator-e2e-password-1';
  const invite = await createInvite(admin, 'CREATOR', email);

  const ctx = await request.newContext({ baseURL: E2E.apiUrl });
  const reg = await ctx.post('/api/auth/register', {
    data: {
      email,
      username,
      displayName: username,
      password,
      inviteCode: invite,
      acceptTerms: true,
    },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const agent: ApiAgent = { ctx, csrf: await csrfOf(ctx) };

  const mail = await latestMail(agent, email);
  expect(mail, 'verification email should arrive in the test mailbox').toBeTruthy();
  const verify = await ctx.post('/api/auth/verify-email', {
    headers: authHeaders(agent),
    data: { token: extractToken(mail!.text) },
  });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return { agent, email, username, password };
}

export interface PublishedGame {
  gameId: string;
  versionId: string;
  slug: string;
  title: string;
}

/** Create game → version → upload ZIP → wait for a terminal pipeline status. */
export async function uploadVersion(
  creator: ApiAgent,
  zipFile: string,
  title = uniq('Game '),
): Promise<{ gameId: string; versionId: string; slug: string; status: string; report: unknown }> {
  const game = await creator.ctx.post('/api/creator/games', {
    headers: authHeaders(creator),
    data: {
      title,
      shortDescription: 'E2E build for the private beta pipeline',
      description: 'Uploaded automatically by the Playwright suite.',
      category: 'Arcade',
      tags: ['e2e'],
      devices: ['desktop'],
      controls: [{ action: 'Play', keys: 'Mouse' }],
      multiplayer: false,
      aiDisclosure: 'NONE',
      toolsUsed: [],
      screenshots: [],
    },
  });
  expect(game.ok(), await game.text()).toBeTruthy();
  const gameBody = (await game.json()).game as { id: string; slug: string };

  const version = await creator.ctx.post(`/api/creator/games/${gameBody.id}/versions`, {
    headers: authHeaders(creator),
    data: { version: '1.0.0', changelog: 'E2E' },
  });
  expect(version.ok(), await version.text()).toBeTruthy();
  const versionId = (await version.json()).version.id as string;

  const zip = readFileSync(path.join(FIXTURES, zipFile));
  const intent = await creator.ctx.post(`/api/creator/games/${gameBody.id}/upload-intent`, {
    headers: authHeaders(creator),
    data: {
      versionId,
      fileName: zipFile,
      fileSize: zip.byteLength,
      contentType: 'application/zip',
      sha256: createHash('sha256').update(zip).digest('hex'),
    },
  });
  expect(intent.ok(), await intent.text()).toBeTruthy();
  const intentBody = (await intent.json()) as { uploadId: string; uploadUrl: string };

  if (intentBody.uploadUrl) {
    const put = await creator.ctx.put(intentBody.uploadUrl, {
      headers: { 'content-type': 'application/zip' },
      data: zip,
    });
    expect(put.ok()).toBeTruthy();
  } else {
    const put = await creator.ctx.put(`/api/uploads/${intentBody.uploadId}/direct`, {
      headers: { ...authHeaders(creator), 'content-type': 'application/zip' },
      data: zip,
    });
    expect(put.status(), await put.text()).toBe(204);
  }

  const complete = await creator.ctx.post(`/api/uploads/${intentBody.uploadId}/complete`, {
    headers: authHeaders(creator),
    data: {},
  });
  expect(complete.ok(), await complete.text()).toBeTruthy();

  // Poll the real status endpoint until the pipeline reaches a terminal state.
  let status = '';
  let report: unknown = null;
  for (let i = 0; i < 60; i++) {
    const res = await creator.ctx.get(`/api/uploads/${intentBody.uploadId}/status`, {
      headers: authHeaders(creator),
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { versionStatus: string; validationReport: unknown };
    status = body.versionStatus;
    report = body.validationReport;
    if (status === 'READY_FOR_REVIEW' || status === 'SCAN_FAILED' || status === 'REJECTED') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { gameId: gameBody.id, versionId, slug: gameBody.slug, status, report };
}

/** Full happy path: creator uploads valid build, admin approves → PUBLISHED. */
export async function publishGame(
  admin: ApiAgent,
  creator: ApiAgent,
  title = uniq('Game '),
): Promise<PublishedGame> {
  const upload = await uploadVersion(creator, 'hello-vibeplay.zip', title);
  expect(upload.status).toBe('READY_FOR_REVIEW');
  const approve = await admin.ctx.post(`/api/admin/game-versions/${upload.versionId}/approve`, {
    headers: authHeaders(admin),
    data: { notes: 'E2E approval' },
  });
  expect(approve.status(), await approve.text()).toBe(204);
  return { gameId: upload.gameId, versionId: upload.versionId, slug: upload.slug, title };
}

/** Log into the web UI through the real login page. */
export async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}
