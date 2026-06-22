# Registration Conversion Report

## Summary

VibePlay already had a secure cloud-save foundation on `main`: a per-user/per-game `GameSave`
model and migration, authenticated save endpoints, SDK messages, a host-side play-page bridge,
guest localStorage fallback guidance, and a local-progress sync/conflict prompt. Guest launch was
already unauthenticated and remains unchanged.

This change polishes conversion around that foundation without putting authentication inside game
iframes or blocking play. Guests now get actionable, dismissible account prompts near Play and in
the play overlay, plus a compact home-page explanation of account benefits. Auth flows preserve a
validated internal return path through password login/registration, verification links, and Google
OAuth.

## Verification Blockers Fixed

- Formatted the seven baseline files previously reported by Prettier. These changes are formatting
  only.
- Updated the E2E upload helper to recognize the same-origin
  `/api/uploads/:uploadId/direct` route, include its required auth/CSRF headers, and avoid calling the
  legacy separate completion endpoint after the direct route has already stored, quarantined, and
  queued the upload. External presigned-upload support remains separate and unchanged.
- Updated the feedback E2E selector to the current accessible button name, "Send to NeoFlux
  Software".
- Updated the cross-game origin-isolation fixture to use two free creators, keeping the security
  assertion intact without bypassing the one-published-game free-plan limit.
- Ran the full integration suite against a real Redis 7 instance at `redis://localhost:6379`.

## What Already Existed

- SDK `save.get`, `save.set`, `save.delete`, `save.status`, local-save announcement, and progress
  messages.
- A `GameBridge` on the play page with a same-origin authenticated API adapter outside the iframe.
- Authenticated cloud-save list/read/upsert/delete endpoints with ownership isolation, structural
  JSON validation, size limits, hashing, rate limits, and CSRF protection.
- The `GameSave` Prisma model and `20260621000000_game_saves` migration.
- Guest localStorage fallback guidance and a standalone Fat Dima adapter that always writes locally
  first.
- A delayed/dismissible play-page cloud-save CTA and local-vs-cloud conflict prompt.
- Email/password auth, email verification, Google OAuth, English/Ukrainian i18n, and production GA4
  initialization.
- A guest launch integration test proving a published game launches without authentication.

## Added Or Changed

- Added a dismissible game-detail CTA beside the Play action with Create account, Log in, and
  Continue playing actions. Play remains an independent immediate button.
- Added Log in to the existing delayed play-page CTA and retained the session plus 24-hour
  localStorage dismissal cooldown.
- Added a compact home-page "Why create an account?" section covering cloud saves, another device,
  favorites, comments/feedback, and future creator access.
- Added all new copy in English and Ukrainian.
- Added a shared strict `returnTo` sanitizer. It accepts only single-slash internal paths and rejects
  absolute, protocol-relative, encoded-slash, backslash, malformed-encoding, control-character, and
  over-length targets.
- Preserved safe return paths through login, registration, verification emails/pages, Google OAuth,
  and header auth actions.
- Replaced the broad conversion analytics API with an event and parameter allowlist. Unknown,
  personal, session, object-key, error-stack, and save-data fields are dropped.
- Changed GA4 page views to pathname-only so verification tokens, invite codes, searches, and other
  query data cannot be sent.
- Added focused CTA rendering, dismissal, sync eligibility, redirect safety, analytics privacy, and
  OAuth return-path tests.

## Cloud Save Status

Cloud saves are complete for games that adopt the SDK save contract. Authenticated state is handled
by the host page and API; the game iframe receives only typed save results and never receives cookies
or tokens. Guests continue to use game-owned localStorage. A sync prompt appears only for a logged-in
player when the game reports actual local progress. Existing cloud progress triggers the safe
keep-cloud/replace-cloud/keep-local conflict choice.

No new database migration was added. Save payloads are never sent to analytics, and local saves are
never deleted automatically.

## Analytics Events

- `view_home`
- `view_game`
- `click_play_game`
- `play_started`
- `signup_cta_shown`
- `signup_cta_clicked`
- `login_cta_clicked`
- `signup_started`
- `signup_success`
- `email_verify_success`
- `cloud_save_cta_shown`
- `cloud_save_sync_prompt_shown`
- `cloud_save_sync_accepted`
- `cloud_save_sync_skipped`
- `creator_access_clicked`

Allowed GA4 parameters are normalized to `game_id`, `game_slug`, `source`, `cta_location`, `role`,
and `logged_in`.

## Files Changed

- Shared validation: `packages/shared/src/returnTo.ts`, `packages/shared/src/returnTo.test.ts`,
  `packages/shared/src/index.ts`, `packages/shared/src/schemas.ts`.
- API auth: `apps/api/src/routes/auth.ts`, `apps/api/src/routes/auth.integration.test.ts`,
  `apps/api/src/routes/googleOAuth.ts`, `apps/api/src/routes/googleOAuth.integration.test.ts`,
  `apps/api/src/lib/mailer.ts`.
- Web auth/analytics helpers: `apps/web/src/hooks/useAuth.tsx`, `apps/web/src/lib/api/types.ts`,
  `apps/web/src/lib/returnTo.ts`, `apps/web/src/lib/returnTo.test.ts`,
  `apps/web/src/lib/analytics.ts`, `apps/web/src/lib/analytics.test.ts`,
  `apps/web/src/components/AnalyticsRouteTracker.tsx`.
- Conversion UI: `apps/web/src/components/AccountBenefits.tsx`,
  `apps/web/src/components/CloudSaveCTA.tsx`, `apps/web/src/components/CloudSaveCTA.test.tsx`,
  `apps/web/src/pages/LandingPage.tsx`, `apps/web/src/pages/GameDetailPage.tsx`,
  `apps/web/src/pages/GamePlayerPage.tsx`, `apps/web/src/layouts/AppShell.tsx`,
  `apps/web/src/index.css`.
- CTA logic/i18n: `apps/web/src/lib/cloudSaveCta.ts`,
  `apps/web/src/lib/cloudSaveCta.test.ts`, `apps/web/src/i18n/en.ts`,
  `apps/web/src/i18n/uk.ts`.
- Verification fixes: `tests/e2e/helpers.ts`, `tests/e2e/account-feedback.spec.ts`,
  `tests/e2e/launch-isolation.spec.ts`.
- Formatting-only baseline cleanup: `apps/api/src/routes/avatarVersions.integration.test.ts`,
  `apps/web/src/components/FeedbackModal.tsx`, `apps/web/src/components/GameCarousel.tsx`,
  `apps/web/src/components/GameVersionManager.tsx`, `apps/web/src/pages/Admin/Dashboard.tsx`,
  `apps/web/src/pages/Creator/PublishGame.tsx`, and `apps/worker/src/index.ts`.

## Test Results

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed across all workspaces.
- `npm run test`: passed, 82 tests across 15 files.
- `REDIS_URL=redis://localhost:6379 npm run test:integration`: passed, 89 tests across 8 files. The
  Redis rate-limit suite ran fully with no skipped tests.
- `npm run build`: passed. Vite reports the existing frontend chunk-size warning.
- `npm run test:e2e`: passed, all 27 Playwright tests. The E2E stack used its approved filesystem
  storage driver and same-origin API direct-upload route; MinIO was not exposed or reconfigured.

## Manual QA Checklist

- [ ] As a guest, open a game detail page and confirm Play starts immediately without auth.
- [ ] Confirm Create account, Log in, Continue playing, and close are visible near Play.
- [ ] Dismiss the detail CTA, reload, and confirm it stays hidden during the cooldown.
- [ ] Log in and confirm guest conversion UI is absent on home, detail, and play pages.
- [ ] From detail and play CTAs, complete login/registration and confirm return to the original path.
- [ ] Open a verification link created from a game CTA and confirm it returns to that internal path.
- [ ] Try `returnTo=https://example.com`, `//example.com`, encoded slashes, and backslashes; confirm
  navigation falls back to `/`.
- [ ] Play as a guest, create local progress, then log in and confirm sync appears only when the game
  reports local progress.
- [ ] Exercise no-cloud and cloud-conflict choices; confirm local progress is never deleted.
- [ ] Check English and Ukrainian layouts on desktop and mobile widths.
- [ ] In production GA4 debug view, confirm event names/allowed metadata and pathname-only page views.

## Risks And Follow-Up

- Sync discovery depends on each game implementing the SDK local-save announcement; the host does not
  inspect iframe storage by design.
- Consider route-level code splitting separately to address the existing Vite chunk-size warning.
- The integration/E2E logs include an existing `pg` client deprecation warning; tests are green, but
  the database test harness should be updated before `pg` 9.
- Creator access remains invite-based; the benefits copy intentionally promises only the ability to
  request access later.

No secrets, environment files, credentials, tokens, logs, production domain settings, cookie-domain
settings, MinIO exposure, published game files, CSP, iframe sandbox, moderation, ClamAV, or upload
validation were changed. Nothing was committed, pushed, or deployed.
