# Real Creator Analytics Report

## Implementation Summary

Creator Analytics now reads aggregated production records through an authenticated API. The page no longer derives analytics from catalog state or displays local demo analytics. It supports UTC-aligned 7, 30, and 90 day ranges, honest loading/error/empty states, responsive summary and trend views, top games, recent activity, and Creator Plus advanced metrics.

The Creator Overview headline cards now use the same analytics endpoint instead of calculating totals from the browser's currently loaded game list.

## API Endpoint

- `GET /api/creator/analytics?range=7d|30d|90d`

The existing endpoint was upgraded to a stable aggregate DTO. Invalid or extra query values return HTTP 400. Authentication and `CREATOR` or higher role checks use the existing active-user guards. A creator's query is always scoped to `Game.creatorId`; Admin and Owner bypass subscription gating but still receive analytics for games they own because no cross-creator inspection parameter exists.

## Database Sources

- `PlaySession`: all-time and in-range plays, UTC daily buckets, completed duration, signed-in/guest split, returning signed-in players, game/version breakdowns, and duration percentiles.
- `Game`: ownership, public game metadata, and published/moderation/draft/rejected counts.
- `GameVersion`: public version label for aggregated version-level play counts.
- `Like`: all-time game likes and in-range recent activity count.
- `Comment`: visible comment totals and in-range recent activity count.
- `GameSave`: distinct cloud-save users and per-game cloud-save adoption aggregates. Save payloads are never selected.
- `Subscription`: active Creator Plus entitlement through the existing billing helpers.

No database migration was needed. Existing indexes and records support the bounded 90-day queries, so no analytics event table or invasive tracking fields were added.

## Metrics Implemented

Basic analytics for all creators:

- Total games and published/moderation/draft/rejected counts.
- All-time plays from `PlaySession` records.
- Plays in the selected range and zero-filled UTC daily time series.
- Average duration across sessions with recorded durations.
- All-time likes and visible comments.
- Top ten games by plays in the selected range, with aggregated likes/comments.
- In-range play, like, and visible-comment activity summaries.

Advanced analytics for active Creator Plus, Admin, and Owner:

- Unique signed-in players.
- Guest and signed-in play counts.
- Returning signed-in players with an earlier play before the selected period.
- Distinct cloud-save users and adoption among all-time signed-in players.
- Median and 90th-percentile recorded session duration.
- Previous-period totals, percent change, and aligned day-by-day comparison data.
- Per-game signed-in/guest mix, unique signed-in players, duration, cloud-save users, and version-level plays.

## Intentionally Unavailable Metrics

- Registration CTA conversion is shown as "Not enough internal data yet." CTA events exist only in external analytics and are not stored in the production database.
- Country, device, referrer, IP-based, and user-agent analytics are not computed because the required privacy-reviewed source data does not exist.
- Guest "unique player" counts are not claimed. Guest plays are counted, but no unstable client identifier is presented as a person.

## Creator Plus Gating

- Free creators receive every basic metric and an advanced analytics upgrade prompt.
- Active or trialing Creator Plus subscriptions receive advanced metrics.
- Admin and Owner bypass the advanced analytics subscription gate.
- Cancellation or expiry does not delete analytics records; it only omits the advanced response section while entitlement is inactive.
- Analytics does not affect publishing, launching, guest play, saves, or registration flows.

## Privacy And Security

- Queries are scoped through creator-owned games.
- Player, guest, suspended, and banned access is rejected by existing server guards.
- Responses contain aggregates and public game/version metadata only.
- The API never selects or returns email, username, IP, session ID, client session ID, token, object key, save payload, or save hash data.
- Hidden/deleted comments are excluded from creator analytics.
- The integration suite recursively checks response keys for private fields and verifies Creator A cannot observe Creator B counts or game IDs.

## Files Changed

- `packages/shared/src/schemas.ts`
- `packages/shared/src/dto.ts`
- `apps/api/src/lib/creatorAnalytics.ts`
- `apps/api/src/routes/creator.ts`
- `apps/api/src/routes/creatorAnalytics.integration.test.ts`
- `apps/web/src/lib/api/types.ts`
- `apps/web/src/lib/api/http.ts`
- `apps/web/src/lib/api/http.test.ts`
- `apps/web/src/lib/api/demo/index.ts`
- `apps/web/src/pages/Creator/Analytics.tsx`
- `apps/web/src/pages/Creator/Analytics.test.tsx`
- `apps/web/src/pages/Creator/Overview.tsx`
- `apps/web/src/i18n/en.ts`
- `apps/web/src/i18n/uk.ts`
- `REAL_CREATOR_ANALYTICS_REPORT.md`

## Tests Added

API integration tests cover real session counts, UTC grouping, top-game ordering, creator isolation, Free/Plus gating, Admin/Owner bypass, cloud-save aggregation, returning players, duration percentiles, response privacy, invalid ranges, inactive accounts, player/guest rejection, and empty responses.

Frontend tests cover loading, real summary rendering, no-data rendering without a fake graph, Free upgrade prompting, Creator Plus advanced metrics, and selected-range request URLs.

## Verification Results

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed for every workspace.
- `npm run test`: passed, 118 tests.
- `npm run build`: passed. Vite reported the existing large-chunk warning only.
- `node apps/web/scripts/i18n-hardcoded-scan.mjs`: passed with zero findings.
- Targeted creator analytics integration: passed, 7 tests.
- Full API integration: eight files and 93 tests passed; the Redis rate-limit file could not run because Docker, Redis, and `REDIS_URL` were unavailable. Its missing-client teardown also produced a secondary error.
- `npm run test:e2e`: passed, 27 Playwright tests on the local real stack.

## Manual QA Checklist

- [ ] Free creator opens Analytics and sees real basic metrics.
- [ ] Creator Plus/Admin/Owner sees advanced analytics.
- [ ] New creator with no plays sees the empty state.
- [ ] Date range switching works.
- [ ] Fat Dima Simulator plays appear in analytics after launch.
- [ ] Creator cannot access another creator's analytics by changing IDs.
- [ ] Player/guest cannot access analytics.
- [ ] Ukrainian and English UI are both correct.
- [ ] No demo analytics text remains.
- [ ] Guest play still works.
- [ ] Cloud save CTA and guest exit warning still work.

## Follow-Up Tasks

- Add an allowlisted, privacy-reviewed internal conversion event only if product requirements make database-backed registration CTA conversion necessary.
- Move high-volume distinct and percentile calculations to database-native aggregate queries if production session volume makes the current bounded reads too expensive.
- Rerun the Redis rate-limit integration file with `REDIS_URL=redis://localhost:6379` when Redis is available.
