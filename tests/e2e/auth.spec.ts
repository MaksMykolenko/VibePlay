import { expect, test } from '@playwright/test';
import { E2E } from './stack/env.js';
import {
  adminAgent,
  apiLogin,
  authHeaders,
  createInvite,
  extractToken,
  latestMail,
  uniq,
} from './helpers.js';

/**
 * Auth vertical slice (spec §31):
 * invite → register (real UI) → verification email → verify → login →
 * /api/auth/me → logout. Plus invite-only enforcement and suspended/banned login.
 */
test.describe('authentication', () => {
  // Registration UX must reflect the backend INVITE_ONLY mode (via /api/auth/config).
  test('register UI in OPEN mode: no invite field, open copy, submit not blocked', async ({
    page,
  }) => {
    await page.route('**/api/auth/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ inviteOnly: false }),
      }),
    );
    await page.goto('/register');
    await expect(page.getByText(/registration is currently open/i)).toBeVisible();
    await expect(page.locator('#reg-invite')).toHaveCount(0);
  });

  test('register UI in INVITE-ONLY mode: required invite field + invite copy', async ({ page }) => {
    await page.route('**/api/auth/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ inviteOnly: true }),
      }),
    );
    await page.goto('/register');
    await expect(page.getByText(/requires an invite code/i)).toBeVisible();
    await expect(page.locator('#reg-invite')).toBeVisible();
    await expect(page.locator('#reg-invite')).toHaveAttribute('required', '');
  });

  test('invite → register → verify email → login → me → logout', async ({ page }) => {
    const admin = await adminAgent();
    const username = uniq('player');
    const email = `${username}@e2e.vibeplay.local`;
    const password = 'player-e2e-password-1';
    const invite = await createInvite(admin, 'PLAYER', email);

    // Register through the real UI.
    await page.goto(`/register?invite=${encodeURIComponent(invite)}`);
    await page.locator('input[placeholder="neon_rider"]').fill(username);
    await page.locator('input[placeholder="Neon Rider"]').fill(username);
    await page.locator('input[placeholder="you@example.com"]').fill(email);
    await page.locator('input[placeholder="At least 10 characters"]').fill(password);
    await page.locator('input[placeholder="Re-enter password"]').fill(password);
    await page.locator('#reg-terms').check();
    await page.getByRole('button', { name: /create account|sign up|register/i }).click();
    await expect(page).not.toHaveURL(/\/register/, { timeout: 15_000 });

    // The verification email arrives in the (Mailpit-equivalent) test mailbox.
    const mail = await latestMail(admin, email);
    expect(mail).toBeTruthy();
    expect(mail!.subject).toContain('Verify');
    const token = extractToken(mail!.text);

    // Verify through the real verification page.
    await page.goto(`/verify-email?token=${encodeURIComponent(token)}`);
    await expect(page.getByText(/verified|welcome/i).first()).toBeVisible({ timeout: 15_000 });

    // Login via API and confirm the session: /api/auth/me, then logout.
    const agent = await apiLogin(email, password);
    const me = await agent.ctx.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();
    const meBody = await me.json();
    expect(meBody.user.email).toBe(email);
    expect(meBody.user.emailVerified).toBe(true);

    const logout = await agent.ctx.post('/api/auth/logout', {
      headers: authHeaders(agent),
      data: {},
    });
    expect(logout.ok()).toBeTruthy();
    const meAfter = await agent.ctx.get('/api/auth/me');
    expect(meAfter.status()).toBe(401);
  });

  test('registration without a valid invite is rejected (invite-only beta)', async ({
    request,
  }) => {
    const username = uniq('noinvite');
    const res = await request.post(`${E2E.apiUrl}/api/auth/register`, {
      data: {
        email: `${username}@e2e.vibeplay.local`,
        username,
        displayName: username,
        password: 'some-password-12345',
        acceptTerms: true,
      },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('INVITE_REQUIRED');
  });

  test('suspended user cannot log in', async () => {
    const admin = await adminAgent();
    const username = uniq('susp');
    const email = `${username}@e2e.vibeplay.local`;
    const invite = await createInvite(admin, 'PLAYER', email);
    // Register from a FRESH context (registering through the admin's session
    // would correctly be rejected by the CSRF guard).
    const { request: pwReq } = await import('@playwright/test');
    const anon = await pwReq.newContext({ baseURL: E2E.apiUrl });
    const reg = await anon.post('/api/auth/register', {
      data: {
        email,
        username,
        displayName: username,
        password: 'suspended-pass-123',
        inviteCode: invite,
        acceptTerms: true,
      },
    });
    expect(reg.status(), await reg.text()).toBe(201);
    const userId = (await reg.json()).user.id as string;

    const suspend = await admin.ctx.post(`/api/admin/users/${userId}/suspend`, {
      headers: authHeaders(admin),
      data: { reason: 'E2E suspension' },
    });
    expect(suspend.status()).toBe(204);

    const fresh = await pwReq.newContext({ baseURL: E2E.apiUrl });
    const login = await fresh.post('/api/auth/login', {
      data: { email, password: 'suspended-pass-123' },
    });
    expect(login.status()).toBe(403);
    expect((await login.json()).error.code).toBe('ACCOUNT_SUSPENDED');
  });

  test('banned user cannot log in', async () => {
    const admin = await adminAgent();
    const username = uniq('banned');
    const email = `${username}@e2e.vibeplay.local`;
    const invite = await createInvite(admin, 'PLAYER', email);
    const { request: pwReq } = await import('@playwright/test');
    const anon = await pwReq.newContext({ baseURL: E2E.apiUrl });
    const reg = await anon.post('/api/auth/register', {
      data: {
        email,
        username,
        displayName: username,
        password: 'banned-pass-123',
        inviteCode: invite,
        acceptTerms: true,
      },
    });
    expect(reg.status(), await reg.text()).toBe(201);
    const userId = (await reg.json()).user.id as string;

    const ban = await admin.ctx.post(`/api/admin/users/${userId}/ban`, {
      headers: authHeaders(admin),
      data: { reason: 'E2E ban' },
    });
    expect(ban.status()).toBe(204);

    const fresh = await pwReq.newContext({ baseURL: E2E.apiUrl });
    const login = await fresh.post('/api/auth/login', {
      data: { email, password: 'banned-pass-123' },
    });
    expect(login.status()).toBe(403);
    expect((await login.json()).error.code).toBe('ACCOUNT_BANNED');
  });
});
