# VibePlay Analytics v2 Report

## Implementation Summary

VibePlay now has a privacy-safe first-party event collector specialized for browser games. Platform events originate in the trusted parent web app; SDK events cross the existing exact-origin and exact-iframe `postMessage` bridge before the parent submits them. The API validates a fixed event union, verifies game/version/play context, derives actor identity and source, and writes bounded records directly to PostgreSQL.

Existing `PlaySession` Creator Analytics remains intact. Event metrics complement it with launch, SDK, save, CTA, exit-warning, and auth-return insights.

## Architecture

```text
Game iframe
  -> VibePlay SDK (strict ready/error/custom API)
  -> versioned postMessage envelope
  -> GameBridge exact source + exact origin validation
  -> parent Play Page attaches game/version/play context
  -> POST /api/analytics/events (or bounded batch)
  -> Fastify origin + Zod + context + actor validation
  -> direct PostgreSQL AnalyticsEvent write
  -> bounded Creator Analytics aggregation
```

Writes are direct for MVP. Existing BullMQ infrastructure is specific to upload validation, event volume is currently low, and a new worker queue would require unnecessary deployment changes. Client delivery is fire-and-forget, uses `keepalive` for cleanup events, and silently ignores collector failures.

## Events Implemented

Game/session:

- `game_page_view`
- `game_launch_requested`
- `game_launch_success`
- `game_launch_failed`
- `play_session_started`
- `play_heartbeat`
- `play_session_ended`

Cloud saves:

- `cloud_save_cta_shown`
- `cloud_save_cta_signup_clicked`
- `cloud_save_cta_login_clicked`
- `cloud_save_sync_prompt_shown`
- `cloud_save_sync_accepted`
- `cloud_save_sync_dismissed`
- `cloud_save_set_success`
- `cloud_save_set_failed`
- `cloud_save_get_success`
- `cloud_save_get_failed`

Guest exit warning:

- `guest_exit_warning_shown`
- `guest_exit_warning_keep_playing`
- `guest_exit_warning_leave_anyway`
- `guest_exit_warning_signup_clicked`
- `guest_exit_warning_login_clicked`

Game auth conversion:

- `register_from_game_clicked`
- `login_from_game_clicked`
- `registration_completed_from_game`
- `login_completed_from_game`

SDK/runtime:

- `sdk_ready`
- `sdk_error`
- `game_custom_event`

Custom events accept only `name`, optional finite `value`, and optional `label`. Names/codes use `[a-z0-9_.-]`, names are capped at 40 characters, and labels at 80 characters. Extra keys, arrays, and nested objects are rejected.

## Database Migration

Migration: `20260622000000_vibeplay_analytics_events`

The new `AnalyticsEvent` model stores:

- allowlisted type;
- required game relation;
- optional verified game-version relation;
- optional server-derived user relation;
- server-derived actor type and source;
- allowlisted JSON metadata;
- server timestamp.

Indexes cover `(gameId, createdAt)`, `(versionId, createdAt)`, `(type, createdAt)`, and `(userId, createdAt)`. No rollup table was added. Submitted play-session IDs are used only for verification and are never persisted.

## API Endpoints

- `POST /api/analytics/events`
- `POST /api/analytics/batch` with 1-20 events

Both accept guests and authenticated users, use the existing CSRF behavior for authenticated mutations, apply the dedicated `analyticsEvents` rate limit, enforce 16/32 KB route body limits, and return HTTP 202 with an accepted count.

Browser `Origin` and `Referer` must match the configured web origin when present. Session-bound events require a real `PlaySession` whose game, version, and user/guest actor match the request. Client-provided identity and mismatched context are rejected.

## SDK API

`VibePlay.analytics` now provides:

```ts
VibePlay.analytics.ready();
VibePlay.analytics.error('sdk_timeout', 'startup');
VibePlay.analytics.trackCustomEvent({
  name: 'level_started',
  value: 1,
  label: 'level_1',
});
```

These APIs only use `postMessage`. They do not expose cookies, auth state, API credentials, user identity, or play-session context to the iframe. Invalid metadata returns `false` and is not posted.

## Privacy And Security Guarantees

- No IP address, user agent, email, username, auth/session ID, token, object key, save payload, or raw error stack is stored.
- The game iframe never calls authenticated VibePlay APIs.
- The parent supplies trusted game/version/play context.
- Actor type and `userId` are derived from the resolved API request, never accepted from event input.
- Event type and metadata use strict discriminated Zod schemas at the web/API boundary.
- SDK analytics metadata is independently checked in the game SDK and host protocol parser.
- Wrong-origin or wrong-window iframe messages are ignored before callbacks.
- Creator responses remain aggregated and contain no event-row identity.
- Analytics delivery failure never blocks launch, play, save, navigation, or auth conversion.

## Creator Analytics Changes

Basic analytics now adds:

- launch successes;
- launch failures;
- play sessions started;
- recent allowlisted event counts;
- top games by successful launch.

Creator Plus/Admin/Owner analytics adds:

- launch success rate;
- safe launch failure codes;
- cloud-save CTA/sync funnel;
- guest exit actions;
- registration/login click and completion counts;
- custom event summaries;
- version-level event and launch comparison.

The existing play counts, duration, signed-in/guest split, returning players, save adoption, and session-based comparisons are unchanged.

## Admin Analytics

No admin analytics API or UI was added in this pass. The collector and indexes support it, but keeping the scope on secure collection and creator-owned aggregation avoided expanding the admin surface without dedicated product requirements.

## Tests Added Or Updated

- Shared event schema allowlist, custom metadata, identity/private-key rejection, and batch limits.
- SDK message parsing, valid/invalid custom events, SDK safe errors, and game-side rejection.
- GameBridge exact-origin/source analytics callbacks.
- Web safe-event builder and silent network failure behavior.
- Auth-return intent type preservation.
- Collector guest/auth actor behavior, origin/referrer checks, context ownership, version matching, payload/batch limits, private metadata rejection, atomic writes, rate limiting, and Creator Analytics aggregation.
- Creator Analytics rendering for basic and gated event insights.
- E2E guest launch event persistence, guest analytics denial, creator visibility, iframe isolation, and normal play-session completion.

## Verification Results

- `npm run lint`: passed.
- `npm run typecheck`: passed for all workspaces.
- `npm run test`: passed, 128 tests.
- `npm run build`: passed; Vite emitted the existing large-chunk warning.
- `node apps/web/scripts/i18n-hardcoded-scan.mjs`: passed with zero findings.
- `bash infra/scripts/check-real-bundle.sh apps/web/dist`: passed.
- Non-Redis API integration suite: passed, 100 tests across 9 files.
- Collector plus Creator Analytics focused integration: passed, 14 tests.
- `E2E_FORCE_WEB_BUILD=true npm run test:e2e`: passed, 27 tests.
- Redis-backed integration was not run because Docker/Redis is unavailable in this environment. The collector's in-memory route rate-limit test passed.

## Manual QA Checklist

- [ ] Guest can launch Fat Dima Simulator normally.
- [ ] Game iframe still loads from isolated game host.
- [ ] Analytics failure does not break gameplay.
- [ ] Guest event submission works only through safe API.
- [ ] Guest cannot read creator analytics.
- [ ] Creator sees launch/play events after game launch.
- [ ] Creator Plus/Admin/Owner sees advanced event metrics.
- [ ] Free creator sees basic analytics and upgrade prompt.
- [ ] Cloud save CTA events appear.
- [ ] Guest exit warning events appear.
- [ ] EN/UK UI remains correct.
- [ ] No demo analytics text remains.
- [ ] No private data appears in API responses.

## Known Limitations

- Delivery is best effort; unload-time events can still be lost by the browser or network.
- Pre-session page-view, launch-request, and launch-failure events cannot be bound to a play session. They remain same-origin, game-validated, payload-limited, and rate-limited.
- Registration/login completion depends on a short-lived session-storage intent and a successful return to the play page. No cross-device attribution is attempted.
- Raw events are aggregated over bounded 7/30/90-day ranges. There are no daily rollups yet.
- Guest uniqueness is not inferred from invasive or unstable identifiers.

## Follow-Up Tasks

- Add an Admin/Owner event summary API and UI once the required operational questions are defined.
- Introduce UTC daily rollups if production event volume makes bounded raw aggregation too expensive.
- Add queue-backed ingestion only if write volume or API latency justifies the extra worker/deployment complexity.
- Add retention/deletion policy automation aligned with the platform privacy policy.
- Rerun Redis integration with `REDIS_URL=redis://localhost:6379` when Redis is available.
