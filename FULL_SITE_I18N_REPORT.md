# Full-Site i18n Audit

## Scope and result

Branch: `feature/full-site-i18n`

The English/Ukrainian full-site pass is complete for application UI covered by the detector and the follow-up manual audit. The continuation started with 170 detector findings in six files and ended with zero findings. The ratchet baseline is now `[]`, so any newly introduced detector finding fails the web test suite.

The detector counts during this continuation were:

| Stage | Findings |
| --- | ---: |
| Resume point | 170 |
| Final | 0 |

The earlier WIP notes recorded approximately 388 findings before the first migration work and a 277-finding ratchet baseline. The authoritative before/after count for this continuation is 170 to 0.

## Completed areas

- Shared shell: desktop/mobile navigation, profile menus, roles, demo controls, notifications, access guards, beta labels, and accessibility labels.
- Authentication: login, registration, password recovery/reset, verification, demo copy, placeholders, and messages.
- Shared cards, carousels, comments, footer, language switcher, and not-found UI.
- Catalog, search, library, notifications, game detail, profile, landing categories, and guest-facing CTAs.
- Creator Overview, My Games, Analytics, Publish Game, Edit Game, cover controls, and version manager.
- Settings profile, account/session/data controls, password, notifications, privacy, appearance, language, and billing dates.
- Admin dashboard, activity log, featured games, moderation, reports, and users.
- Displayed roles, categories, game statuses, AI disclosures, and version-pipeline statuses are localized while their internal enum/API values remain unchanged.
- Visible dates and numbers in audited areas use the active locale where practical.

## Architecture and safeguards

- Supported locales remain `en` and `uk`; dictionaries have exact key and interpolation-token parity.
- Locale detection uses a stored preference first, then browser language, then English.
- The language switcher updates the document language and persists the selection.
- The AST detector covers JSX text, user-facing text attributes, and direct toast/confirm/alert/prompt literals.
- Runtime parity/quality tests verify key parity, placeholder parity, fallback/interpolation, locale detection, non-empty values, and the zero-findings ratchet.
- Product and technical names remain unchanged: VibePlay, Creator Plus, Fat Dima Simulator, ZIP, HTML5, WebGL, SDK, and API.

## Intentional exceptions and follow-ups

1. `apps/web/src/pages/legal/` is intentionally excluded from the hardcoded-text detector. Terms, privacy, copyright/takedown, content guidelines, and other long-form legal text remain canonical English until professional legal review approves localized versions. This is a narrow path exclusion, not a general UI allowlist.
2. Polish is not wired. Adding `pl` requires a complete reviewed dictionary and parity validation; it remains a documented follow-up rather than a partial or fallback-heavy release.
3. User-generated content and server-provided free-form error/rejection text are shown as received. Static UI around that content is localized.

## Verification

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed for all workspaces.
- `npm run test`: passed, 19 test files and 113 tests total across workspaces. Web: 9 files, 44 tests, including i18n parity/quality and detector ratchet tests.
- `npm run build`: passed for all packages and apps. Vite emitted the existing large-chunk advisory only.
- `REDIS_URL=redis://localhost:6379 npm run test:integration`: not run; Docker daemon was unavailable and `redis-cli` was not installed.
- `npm run test:e2e`: passed, 27/27 Chromium tests using the embedded PostgreSQL/local stack.
- `node apps/web/scripts/i18n-hardcoded-scan.mjs`: passed with zero findings.
- Manual Playwright smoke: language changed to Ukrainian immediately, `html.lang` and `vibeplay.language` updated, Ukrainian persisted after reload, and signed-out demo play reached the game launch route.

## Manual QA checklist

- [x] Switch English to Ukrainian from the header; verify copy updates immediately and remains Ukrainian after reload.
- [ ] Repeat language switching from the auth page and Settings, then switch back to English.
- [ ] Review desktop, mobile drawer, and mobile bottom navigation in both languages for clipping or overflow.
- [ ] Browse Landing, Games, Search, Library, Notifications, Game Detail, Profile, Settings, Creator, and Admin routes in both languages.
- [ ] Confirm category, role, moderation, game, AI-disclosure, billing, and version status labels are translated while API values remain unchanged.
- [x] Start a published game while signed out in demo mode; verify the guest launch route and demo game screen open.
- [ ] Repeat guest play against the reviewed real stack and inspect the isolated iframe manually.
- [ ] While playing as a guest, trigger navigation away and verify the translated guest exit warning still appears.
- [ ] Verify the translated cloud-save CTA offers registration/login and preserves `returnTo` back to the game.
- [ ] Complete registration from a game CTA and verify the registration conversion CTA flow and `returnTo` behavior.
- [ ] Verify creator publish/edit/version workflows and admin moderation actions in both languages.
- [ ] Review legal pages as intentionally English and confirm they are not presented as legally reviewed Ukrainian translations.

No merge, push to `main`, deployment, or production configuration change was performed.
