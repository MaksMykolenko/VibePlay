import { expect, test } from '@playwright/test';
import {
  adminAgent,
  authHeaders,
  registerVerifiedCreator,
  uniq,
  uploadVersion,
} from './helpers.js';
import { E2E } from './stack/env.js';

/**
 * Moderation (spec §31): queue → preview on the dedicated preview origin
 * (relative assets must load) → approve → PUBLISHED in the public catalog.
 * Rejection must deliver the reason to the creator.
 */
test.describe('moderation', () => {
  test('queue → preview with relative assets → approve → PUBLISHED', async ({ page }) => {
    const admin = await adminAgent();
    const { agent: creator } = await registerVerifiedCreator(admin);
    const title = uniq('Reviewable ');
    const upload = await uploadVersion(creator, 'hello-vibeplay.zip', title);
    expect(upload.status).toBe('READY_FOR_REVIEW');

    // The version is in the admin moderation queue.
    const queue = await admin.ctx.get('/api/admin/moderation');
    expect(queue.ok()).toBeTruthy();
    const entries = (await queue.json()).queue as { version: { id: string } }[];
    expect(entries.some((entry) => entry.version.id === upload.versionId)).toBe(true);

    // Preview URL points at the per-version PREVIEW origin and works in a real
    // browser, including the relative game.js asset (token stays in the path).
    const previewRes = await admin.ctx.post(
      `/api/admin/game-versions/${upload.versionId}/preview-url`,
      { headers: authHeaders(admin), data: {} },
    );
    expect(previewRes.ok()).toBeTruthy();
    const previewUrl = (await previewRes.json()).url as string;
    expect(new URL(previewUrl).hostname).toBe(
      `${upload.versionId}--preview.${new URL(E2E.gameOrigin).hostname}`,
    );

    const assetResponse = page.waitForResponse(
      (res) => res.url().endsWith('/game.js') && res.status() === 200,
      { timeout: 15_000 },
    );
    const cssResponse = page.waitForResponse(
      (res) => res.url().endsWith('/styles.css') && res.status() === 200,
      { timeout: 15_000 },
    );
    await page.goto(previewUrl);
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15_000 });
    await assetResponse; // relative JS asset resolved on the preview origin
    await cssResponse; // relative CSS asset resolved on the preview origin

    // Approve → version becomes PUBLISHED and appears in the public catalog.
    const approve = await admin.ctx.post(`/api/admin/game-versions/${upload.versionId}/approve`, {
      headers: authHeaders(admin),
      data: { notes: 'E2E moderation approval' },
    });
    expect(approve.status(), await approve.text()).toBe(204);

    const detail = await admin.ctx.get(`/api/games/${upload.slug}`);
    expect(detail.ok()).toBeTruthy();
    const game = (await detail.json()).game as { id: string; status: string };
    expect(game.status).toBe('PUBLISHED');

    const launch = await creator.ctx.post(`/api/games/${upload.gameId}/launch`, {
      headers: authHeaders(creator),
      data: {},
    });
    expect(launch.ok(), await launch.text()).toBeTruthy();
    expect((await launch.json()).gameUrl).toContain(upload.versionId);

    const audit = await admin.ctx.get('/api/admin/audit-log?action=game_version.approved');
    expect(audit.ok()).toBeTruthy();
    const auditItems = (await audit.json()).items as { targetId: string }[];
    expect(auditItems.some((entry) => entry.targetId === upload.versionId)).toBe(true);

    const notifications = await creator.ctx.get('/api/notifications');
    expect(notifications.ok()).toBeTruthy();
    const notificationItems = (await notifications.json()).notifications as {
      type: string;
      metadata: { versionId?: string };
    }[];
    expect(
      notificationItems.some(
        (entry) => entry.type === 'GAME_APPROVED' && entry.metadata.versionId === upload.versionId,
      ),
    ).toBe(true);

    const approveAgain = await admin.ctx.post(
      `/api/admin/game-versions/${upload.versionId}/approve`,
      { headers: authHeaders(admin), data: { notes: 'must not mutate state twice' } },
    );
    expect(approveAgain.status()).toBe(409);

    // The preview token/origin must stop serving once the version left review.
    const previewAfter = await page.request.get(previewUrl);
    expect(previewAfter.status()).toBe(404);
  });

  test('reject delivers the reason to the creator', async () => {
    const admin = await adminAgent();
    const { agent: creator } = await registerVerifiedCreator(admin);
    const upload = await uploadVersion(creator, 'hello-vibeplay.zip', uniq('Rejectable '));
    expect(upload.status).toBe('READY_FOR_REVIEW');

    const reject = await admin.ctx.post(`/api/admin/game-versions/${upload.versionId}/reject`, {
      headers: authHeaders(admin),
      data: { reason: 'E2E: gameplay loop is broken', notes: 'internal note' },
    });
    expect(reject.status(), await reject.text()).toBe(204);

    const version = await creator.ctx.get(`/api/creator/game-versions/${upload.versionId}`);
    expect(version.ok()).toBeTruthy();
    const body = (await version.json()).version as { status: string; rejectReason: string | null };
    expect(body.status).toBe('REJECTED');
    expect(body.rejectReason).toContain('gameplay loop is broken');

    const rejectedLaunch = await creator.ctx.post(`/api/games/${upload.gameId}/launch`, {
      headers: authHeaders(creator),
      data: {},
    });
    expect(rejectedLaunch.status()).toBe(404);

    // Creator can upload a NEW version after rejection (re-upload flow).
    const again = await creator.ctx.post(`/api/creator/games/${upload.gameId}/versions`, {
      headers: authHeaders(creator),
      data: { version: '1.0.1', changelog: 'fixed' },
    });
    expect(again.ok(), await again.text()).toBeTruthy();
  });

  test('admin cannot moderate a game they own', async () => {
    const admin = await adminAgent();
    const upload = await uploadVersion(admin, 'hello-vibeplay.zip', uniq('Self-owned '));
    expect(upload.status).toBe('READY_FOR_REVIEW');

    const approve = await admin.ctx.post(`/api/admin/game-versions/${upload.versionId}/approve`, {
      headers: authHeaders(admin),
      data: {},
    });
    expect(approve.status()).toBe(403);

    const reject = await admin.ctx.post(`/api/admin/game-versions/${upload.versionId}/reject`, {
      headers: authHeaders(admin),
      data: { reason: 'must not be accepted' },
    });
    expect(reject.status()).toBe(403);
  });
});
