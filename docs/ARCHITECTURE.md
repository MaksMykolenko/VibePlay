# Architecture

VibePlay is an npm-workspaces monorepo with four deployable services and six
shared packages. Everything is TypeScript on Node 22.

## Services

| Service | Tech | Responsibility |
| --- | --- | --- |
| `apps/web` | React 19 + Vite SPA | player/creator/admin UI; real mode talks to the API, demo mode is the GitHub Pages localStorage build |
| `apps/api` | Fastify | sessions & auth, RBAC, CSRF, catalog/social, creator drafts/versions, upload intents, moderation, invites, feedback, health, Redis rate limits |
| `apps/worker` | BullMQ consumer | quarantine pipeline: checksum → ZIP validation → ClamAV → safe extraction → publish files → status/report |
| `apps/game-host` | Fastify | the ONLY reader of published game files; routes by Host header — one origin per published version; strict game CSP; short-lived preview tokens |

## Packages

| Package | Responsibility |
| --- | --- |
| `@vibeplay/shared` | zod schemas, DTOs, error envelope, version state machine, archive path/extension rules, **gameOrigin helpers** (per-version origin minting/parsing), SDK message protocol |
| `@vibeplay/config` | per-service env schemas; services exit(1) with readable errors on bad config |
| `@vibeplay/database` | Prisma schema (17+ models), migrations, seed, grant-admin script |
| `@vibeplay/storage` | provider-neutral object storage: `s3` (MinIO/S3/R2/B2) and `fs` (tests/dev) |
| `@vibeplay/sdk` | game-side SDK (IIFE bundle served by game-host at `/sdk/vibeplay-sdk.js`) + host-side `GameBridge` |

## Data flow: publish & play

1. Creator creates a game draft + version (`UPLOADING`).
2. API issues an upload intent → authenticated same-origin PUT through the API
   into the private **quarantine** bucket
   (fs driver falls back to a direct upload endpoint in dev/test).
3. `complete` flips the version to `QUARANTINED` and enqueues a BullMQ job.
4. Worker validates and extracts to the **published** bucket under the
   immutable prefix `games/{gameId}/{versionId}/`, sets `READY_FOR_REVIEW`
   (or `SCAN_FAILED` with a persisted report).
5. Admin previews the real build on `{versionId}--preview.<game base>` with a
   5-minute HMAC token, then approves → `PUBLISHED` (previous published
   version becomes `ARCHIVED`).
6. Player hits `POST /api/games/:id/launch` → PlaySession row + launch
   descriptor whose `gameUrl` is the per-version origin
   `{versionId}--{gameId}.<game base>/index.html`.
7. The web app validates the launch URL shape, mounts the sandboxed iframe,
   and `GameBridge` performs the SDK handshake over `postMessage`.

## Process boundaries & state

- **PostgreSQL** is the single source of truth (users, sessions, games,
  versions, uploads, moderation, reports, notifications, audit, feedback).
- **Redis**: BullMQ queue, rate-limit counters, game-host cache invalidation
  pub/sub. Reconstructible — not backed up.
- **Object storage**: quarantine (7-day expiry) and published (immutable
  version trees) buckets.
- The game-host keeps a 15s in-memory access cache per (gameId, versionId),
  invalidated via Redis pub/sub when a game is hidden.

## Mode switch (web)

`import.meta.env.APP_MODE` is statically folded by Vite (`define`), so demo
code (mock data, role switcher, demo client) is dead-code-eliminated from
real builds — verified in CI by `infra/scripts/check-real-bundle.sh` and by a
Playwright test that greps the served bundle.

## Diagrams

See README.md for the top-level diagram; sandbox details in
`GAME_SANDBOX.md`; pipeline details in `GAME_UPLOAD_PIPELINE.md`.
