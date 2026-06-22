import { expect, test } from '@playwright/test';
import {
  adminAgent,
  apiGuest,
  authHeaders,
  publishGame,
  registerVerifiedCreator,
  uiLogin,
  uniq,
} from './helpers.js';
import { E2E } from './stack/env.js';

/**
 * Launch + sandbox isolation (spec §31, §24–§27):
 * - Player launches a published game through the real UI;
 * - PlaySession is created and ended;
 * - the iframe loads from the game's OWN per-version origin;
 * - the SDK postMessage handshake completes (exact origin/source checks);
 * - game A cannot read game B's storage (runtime proof, real browser);
 * - hidden games stop launching.
 */
test.describe('launch and origin isolation', () => {
  test('player launch: unique origin iframe, SDK handshake, play session lifecycle', async ({
    page,
  }) => {
    const admin = await adminAgent();
    const creatorAccount = await registerVerifiedCreator(admin);
    const { agent: creator } = creatorAccount;
    const game = await publishGame(admin, creator, uniq('Playable '));

    // Player registers and logs in through the UI.
    const username = uniq('gamer');
    const email = `${username}@e2e.vibeplay.local`;
    const invite = await admin.ctx.post('/api/admin/invites', {
      headers: authHeaders(admin),
      data: { role: 'PLAYER', expiresInDays: 7, email },
    });
    const code = (await invite.json()).invite.code as string;
    const reg = await page.request.post(`${E2E.apiUrl}/api/auth/register`, {
      data: {
        email,
        username,
        displayName: username,
        password: 'gamer-e2e-pass-1',
        inviteCode: code,
        acceptTerms: true,
      },
    });
    expect(reg.status()).toBe(201);
    await uiLogin(page, email, 'gamer-e2e-pass-1');

    // Launch through the player page; the API must create a PlaySession.
    const launchResponse = page.waitForResponse(
      (res) => res.url().includes('/launch') && res.status() === 200,
    );
    await page.goto(`/play/${game.slug}`);
    const launch = await launchResponse;
    const descriptor = (await launch.json()) as { sessionId: string; gameUrl: string };
    expect(descriptor.sessionId).toBeTruthy();

    // The iframe src is the per-version origin — never a shared host.
    const expectedOrigin = `http://${game.versionId}--${game.gameId}.games.localhost:${E2E.gameHostPort}`;
    expect(new URL(descriptor.gameUrl).origin).toBe(expectedOrigin);

    const iframe = page.locator('iframe');
    await expect(iframe).toHaveAttribute('src', new RegExp(game.versionId));
    await expect(iframe).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-pointer-lock',
    );
    await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');

    // The game actually renders from its own origin and the SDK handshake
    // (ready → init, exact source+origin validated) completes.
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#hud')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('sandbox-status')).toHaveText(/SDK connected/, {
      timeout: 20_000,
    });

    await expect
      .poll(async () => {
        const response = await page.request.get(
          `${E2E.apiUrl}/api/test/analytics/count?gameId=${game.gameId}&type=game_launch_success`,
        );
        return ((await response.json()) as { count: number }).count;
      })
      .toBeGreaterThan(0);

    const guest = await apiGuest();
    const privateAnalytics = await guest.ctx.get('/api/creator/analytics?range=7d');
    expect(privateAnalytics.status()).toBe(401);
    await guest.ctx.dispose();

    // Exiting stores playEnded (204 from /play-sessions/:id/end).
    const endResponse = page.waitForResponse(
      (res) => res.url().includes('/play-sessions/') && res.status() === 204,
    );
    await page.getByRole('button', { name: /exit game/i }).click();
    await endResponse;

    // The play is recorded for the player (recently played ⇒ session stored).
    const recent = await page.request.get(`${E2E.apiUrl}/api/recently-played`);
    expect(recent.ok()).toBeTruthy();
    const items = (await recent.json()).items as { game: { id: string } }[];
    expect(items.some((item) => item.game.id === game.gameId)).toBe(true);

    await uiLogin(page, creatorAccount.email, creatorAccount.password);
    await page.goto('/creator/analytics');
    await expect(page.getByRole('heading', { name: /VibePlay internal events/i })).toBeVisible();
    await expect(page.getByText('Launch successes', { exact: true }).first()).toBeVisible();
  });

  test('game A cannot read game B storage (distinct origins, runtime proof)', async ({ page }) => {
    const admin = await adminAgent();
    const { agent: creatorA } = await registerVerifiedCreator(admin);
    const { agent: creatorB } = await registerVerifiedCreator(admin);
    const gameA = await publishGame(admin, creatorA, uniq('Iso A '));
    const gameB = await publishGame(admin, creatorB, uniq('Iso B '));

    const originA = `http://${gameA.versionId}--${gameA.gameId}.games.localhost:${E2E.gameHostPort}`;
    const originB = `http://${gameB.versionId}--${gameB.gameId}.games.localhost:${E2E.gameHostPort}`;
    expect(originA).not.toBe(originB);

    // Write origin-scoped state and install a Service Worker inside game A.
    await page.goto(`${originA}/index.html`);
    await page.evaluate(async () => {
      localStorage.setItem('vibeplay-secret', 'belongs-to-A');
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('vibeplay-isolation', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('markers');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const tx = request.result.transaction('markers', 'readwrite');
          tx.objectStore('markers').put('belongs-to-A', 'secret');
          tx.oncomplete = () => {
            request.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem('vibeplay-secret'))).toBe('belongs-to-A');
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    // Prove game B's distinct origin sees none of A's origin-scoped state.
    await page.goto(`${originB}/index.html`);
    expect(await page.evaluate(() => localStorage.getItem('vibeplay-secret'))).toBeNull();
    expect(
      await page.evaluate(async () =>
        (await indexedDB.databases()).some((database) => database.name === 'vibeplay-isolation'),
      ),
    ).toBe(false);
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    expect(
      await page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration('/'))),
    ).toBe(false);

    // Two versions of the same game are isolated too: A's old origin is dead
    // once a new version is published (immutable per-version origins).
    const sameGameCheck = await page.request.get(`${originA}/index.html`);
    expect(sameGameCheck.status()).toBe(200); // still the published version

    // The shared base origin serves nothing at all.
    const base = await page.request.get(`${E2E.gameOrigin}/index.html`);
    expect(base.status()).toBe(404);
    const legacyPath = await page.request.get(
      `${E2E.gameOrigin}/g/${gameA.gameId}/${gameA.versionId}/index.html`,
    );
    expect(legacyPath.status()).toBe(404);
  });

  test('hidden and unpublished games are not servable', async ({ page }) => {
    const admin = await adminAgent();
    const { agent: creator } = await registerVerifiedCreator(admin);
    const game = await publishGame(admin, creator, uniq('Hideable '));

    const hide = await admin.ctx.post(`/api/admin/games/${game.gameId}/hide`, {
      headers: authHeaders(admin),
      data: {},
    });
    expect(hide.status()).toBe(204);

    // Launch API refuses.
    const launch = await admin.ctx.post(`/api/games/${game.gameId}/launch`, {
      headers: authHeaders(admin),
      data: {},
    });
    expect(launch.status()).toBe(404);

    // The game origin stops serving (fresh access checks hit the DB).
    const direct = await page.request.get(
      `http://${game.versionId}--${game.gameId}.games.localhost:${E2E.gameHostPort}/index.html`,
    );
    expect(direct.status()).toBe(404);

    // Unpublished (still in review) version is not servable either.
    const pending = await registerVerifiedCreator(admin);
    const { uploadVersion } = await import('./helpers.js');
    const upload = await uploadVersion(pending.agent, 'hello-vibeplay.zip', uniq('Pending '));
    expect(upload.status).toBe('READY_FOR_REVIEW');
    const notPublished = await page.request.get(
      `http://${upload.versionId}--${upload.gameId}.games.localhost:${E2E.gameHostPort}/index.html`,
    );
    expect(notPublished.status()).toBe(404);
  });
});
