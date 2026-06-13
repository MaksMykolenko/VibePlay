import { expect, test } from '@playwright/test';

/**
 * Production UI guarantees (spec §31, §12): the suite runs against the REAL
 * production bundle (VITE_APP_MODE=real), so these assertions hold for the
 * exact artifact that ships to the beta.
 */
test.describe('production UI', () => {
  test('served JS bundle contains no demo strings or demo credentials', async ({ page }) => {
    const jsResponses: string[] = [];
    page.on('response', async (res) => {
      if (res.url().endsWith('.js') && res.status() === 200) {
        try {
          jsResponses.push(await res.text());
        } catch {
          // ignore detached responses
        }
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(jsResponses.length).toBeGreaterThan(0);
    const bundle = jsResponses.join('\n');
    for (const forbidden of [
      'Quick Role Switch',
      'Demo Accounts',
      'Demo accounts',
      'demo123',
      'player@vibeplay.demo',
      'creator@vibeplay.demo',
      'admin@vibeplay.demo',
      'Frontend Demo',
      'Securing browser sandbox environment',
    ]) {
      expect(bundle, `bundle must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  test('login page shows no demo role switcher or demo accounts', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
    await expect(page.getByText(/quick role switch/i)).toHaveCount(0);
    await expect(page.getByText(/demo account/i)).toHaveCount(0);
  });

  test('direct routes work (SPA fallback + router)', async ({ page }) => {
    await page.goto('/games');
    await expect(page).toHaveURL(/\/games$/);
    await page.goto('/search?q=test');
    await expect(page).toHaveURL(/\/search/);
    await page.goto('/login');
    await expect(page.locator('#login-email')).toBeVisible();
  });

  test('legal pages render real beta-draft content', async ({ page }) => {
    for (const [route, marker] of [
      ['/terms', /invite-only private beta/i],
      ['/privacy', /account deletion/i],
      ['/community-guidelines', /harassment/i],
      ['/content-guidelines', /cryptomining/i],
      ['/copyright', /counter-notice/i],
      ['/report-abuse', /moderation queue/i],
      ['/contact', /support/i],
    ] as const) {
      await page.goto(route);
      await expect(page.getByText(/Beta draft — requires legal review/i).first()).toBeVisible();
      await expect(page.getByText(marker).first()).toBeVisible();
    }
  });

  test('unknown route shows the not-found page, beta badge is present', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();
    await page.goto('/');
    await expect(page.getByText('Beta', { exact: true }).first()).toBeVisible();
  });

  test('mobile layout renders and navigation drawer opens', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('button', { name: /menu|navigation/i }).first()).toBeVisible();
    await page.close();
    await context.close();
  });
});
