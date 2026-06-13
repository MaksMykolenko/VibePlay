import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { adminAgent, registerVerifiedCreator, uiLogin } from './helpers.js';

test.describe('account controls and beta feedback', () => {
  test('preferences persist, feedback reaches admins, and data export downloads', async ({
    page,
  }) => {
    const admin = await adminAgent();
    const creator = await registerVerifiedCreator(admin);
    await uiLogin(page, creator.email, creator.password);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    const platformUpdates = page
      .locator('label')
      .filter({ hasText: 'News and Platform Updates' })
      .locator('input');
    await platformUpdates.check();
    const prefsResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/profile/notification-preferences') && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Save Preferences' }).click();
    await prefsResponse;

    await page.reload();
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(platformUpdates).toBeChecked();

    await page.getByRole('button', { name: 'Beta feedback' }).click();
    await page.getByRole('button', { name: 'Bug report' }).click();
    await page
      .getByPlaceholder(/What happened/)
      .fill('The account feedback E2E flow verifies real persistence.');
    const feedbackResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/feedback') && response.status() === 204,
    );
    await page.getByRole('button', { name: 'Send to the team' }).click();
    await feedbackResponse;
    await expect(page.getByText(/Bug report sent/)).toBeVisible();

    const adminFeedback = await admin.ctx.get('/api/admin/feedback?status=OPEN');
    expect(adminFeedback.ok()).toBeTruthy();
    const feedbackItems = (await adminFeedback.json()).items as { message: string }[];
    expect(feedbackItems.some((item) => item.message.includes('feedback E2E flow'))).toBeTruthy();

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download data export' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^vibeplay-data-export-\d{4}-\d{2}-\d{2}\.json$/);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const exported = JSON.parse(await readFile(downloadPath!, 'utf8')) as {
      account: { email: string; notificationPrefs: { platformNews: boolean } };
      feedback: { message: string }[];
    };
    expect(exported.account.email).toBe(creator.email);
    expect(exported.account.notificationPrefs.platformNews).toBe(true);
    expect(exported.feedback.some((item) => item.message.includes('feedback E2E flow'))).toBe(true);
    expect(JSON.stringify(exported)).not.toContain('passwordHash');
    expect(JSON.stringify(exported)).not.toContain('tokenHash');
  });
});
