# VibePlay

VibePlay is an invite-only platform for publishing and playing browser games.
Independent creators upload static HTML5 game builds as ZIP archives; every
build goes through automated validation, malware scanning and human
moderation before players can launch it in a hardened, per-version sandbox.

**Status: private beta.** Features and data may change; see the in-product
`/terms` (beta draft) and `VIBEPLAY_BETA_MVP_READINESS.md` for the current
readiness assessment.

## Beta scope

- **Players** — invite registration, email verification, profile, catalog,
  search, launching published games, likes, favorites, recently played,
  comments, reports, notifications.
- **Creators** — creator profile, game drafts, metadata editing, ZIP upload
  with real validation status and reject reasons, re-uploading new versions,
  publication strictly after moderation.
- **Admins** — moderation queue with real build preview and scan report,
  approve/reject, hide/suspend games, reports, user suspension, audit log,
  featured games, invites.

Out of scope for the beta (deliberately): payments, internal currency,
revenue sharing, item marketplace, multiplayer backend, voice chat, friends,
parties, AI game generator, desktop launcher, native mobile apps, avatar
economy, advertising.

## Architecture

```text
                      ┌────────────────────────┐
        players ────► │  web (React + Vite SPA)│
                      └──────────┬─────────────┘
                                 │ /api (cookies: HttpOnly, host-only)
                      ┌──────────▼─────────────┐     ┌──────────────┐
                      │  api (Fastify)         │ ──► │ PostgreSQL   │
                      │  auth · RBAC · CSRF    │     │ (Prisma)     │
                      │  rate limits (Redis)   │     └──────────────┘
                      └───┬───────────┬────────┘
              BullMQ jobs │           │ presigned PUT
                      ┌───▼────┐  ┌───▼────────┐
                      │ worker │  │ MinIO / S3 │  quarantine + published buckets
                      │ ZIP    │  └───┬────────┘
                      │ checks │      │ published files (read-only)
                      │ ClamAV │  ┌───▼────────────────────────────────┐
                      └────────┘  │ game-host (Fastify)                │
                                  │ one ORIGIN per published version:  │
   player iframe ───────────────► │ {versionId}--{gameId}.<game base>  │
                                  └────────────────────────────────────┘
```

Monorepo (npm workspaces, Node 22):

| Path | What it is |
| --- | --- |
| `apps/web` | React + Vite SPA (real mode talks to the API; demo mode is the GitHub Pages build) |
| `apps/api` | Fastify REST API: auth, sessions, RBAC, catalog, creator, admin, uploads |
| `apps/worker` | BullMQ consumer: ZIP validation, extraction, ClamAV scan |
| `apps/game-host` | serves published game files, one origin per version, strict CSP |
| `packages/shared` | zod schemas, DTOs, state machine, archive checks, origin helpers, SDK protocol |
| `packages/config` | fail-fast env validation per service |
| `packages/database` | Prisma schema, migrations, seed |
| `packages/storage` | S3-compatible + fs object storage drivers |
| `packages/sdk` | iframe SDK (`postMessage`, versioned, validated both sides) |
| `infra/` | Dockerfiles, Caddy configs (dev proxy, web, staging) |
| `tests/e2e` | Playwright suite against a fully real, isolated stack |

## Prerequisites

- **Node.js 22** (`engines` enforced) and npm 10+
- **Docker** (Compose v2) for the full stack
- macOS/Linux; Apple Silicon works (ClamAV image runs under emulation)

## Quick start (full Docker stack)

```bash
cp .env.example .env          # fill SESSION_SECRET, PASSWORD_PEPPER, PREVIEW_URL_SECRET
docker compose up --build -d
docker compose ps             # wait until everything is healthy
```

- Web app: <http://localhost:8088>
- Game host (per-version origins): `http://{versionId}--{gameId}.games.localhost:8080`
- Mailpit (emails): <http://localhost:8025>
- MinIO console: <http://localhost:9001>

Browsers resolve any `*.localhost` name to `127.0.0.1`, so per-version game
origins work locally with zero DNS setup. For curl, pass an explicit
`--resolve` or `Host:` header; see `docs/GAME_SANDBOX.md`.

First admin: register with an invite (or set `INVITE_ONLY=false` locally),
then `npm run grant-admin -- you@example.com`.

## Local development (host processes + infra containers)

```bash
docker compose up -d postgres redis minio create-minio-buckets clamav mailpit
npm ci
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev:api        # :3000
npm run dev:worker
npm run dev:game-host  # :8080
npm run dev:web        # :5173
```

## Environment variables

Everything is documented in [.env.example](.env.example) and validated at
startup by `packages/config` (services refuse to boot with bad config; secret
values are never printed). Key groups: origins (`WEB_ORIGIN`, `API_ORIGIN`,
`GAME_ORIGIN`), database/redis URLs, session/pepper/preview secrets, S3
storage, ClamAV, SMTP, upload limits, `INVITE_ONLY`, optional `SENTRY_DSN`.

## Database

```bash
npm run db:generate   # Prisma client
npm run db:migrate    # prisma migrate deploy
npm run db:seed       # local demo data (never run against production)
```

Migrations live in `packages/database/prisma/migrations`; CI fails on drift
between `schema.prisma` and the migrations directory.

## Tests & quality gates

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test               # unit (shared, sdk, api, worker, game-host)
npm run test:integration   # real Postgres (embedded or CI service); Redis for rate-limit suite
npm run test:e2e           # Playwright against an isolated REAL stack (see tests/e2e)
npm run build              # all packages + apps
npm run build:demo         # GitHub Pages demo bundle
```

The E2E suite boots embedded PostgreSQL + the real API (inline worker
pipeline) + game-host + the real production web bundle, then drives a real
Chromium. Point it at a running Docker stack instead with
`E2E_EXTERNAL_STACK=true E2E_WEB_URL=... E2E_API_URL=... E2E_GAME_ORIGIN=...`.

## Demo mode vs real mode

- `VITE_APP_MODE=real` (default) — talks to the API; **no demo code ships in
  the bundle** (dead-code-eliminated and CI-verified by
  `infra/scripts/check-real-bundle.sh`).
- `VITE_APP_MODE=demo` — the GitHub Pages build
  (<https://maksmykolenko.github.io/VibePlay/>): localStorage-only data, a
  visible "Frontend Demo" banner, optional role switcher. Never deploy demo
  mode against real users.

## Upload pipeline (what happens to a ZIP)

```text
upload intent → presigned PUT to quarantine bucket → complete
→ BullMQ job → size/structure checks → safe extraction (path traversal,
  forbidden extensions, limits) → ClamAV scan → publish files to the
  published bucket → READY_FOR_REVIEW → admin preview → approve → PUBLISHED
```

Full details: `docs/GAME_UPLOAD_PIPELINE.md`. Reject reasons are persisted
and shown to the creator verbatim.

## Sandbox model

Every published version runs on its own origin
(`{versionId}--{gameId}.<game host base>`) behind an iframe with
`sandbox="allow-scripts allow-same-origin allow-pointer-lock"`, a strict CSP
(no external network, no frames, no forms) and no cookies. Cross-game storage
isolation is enforced by the browser origin model and verified by an E2E
test. See `docs/GAME_SANDBOX.md`.

## Moderation

Immutable versions move through an explicit state machine
(`packages/shared/src/stateMachine.ts`); admins preview real builds on a
dedicated preview origin with short-lived HMAC tokens; self-moderation is
blocked; every decision is audited. See `docs/MODERATION_STATE_MACHINE.md`.

## Operations

- Deployment & staging domains: `docs/DEPLOYMENT.md`
- Backups & restore drills: `docs/BACKUP_AND_RESTORE.md`
- Security model: `docs/SECURITY.md`
- Beta runbook: `docs/PRIVATE_BETA_RUNBOOK.md`
- Incidents: `docs/INCIDENT_RESPONSE.md`

## Known limitations (beta)

- Email change, avatar uploads and screenshot uploads are disabled (honest
  501s) — metadata URLs only.
- Account deletion / data export are admin-processed requests (30-day SLA),
  not instant self-service.
- Single API instance assumed for cache invalidation timing; rate limits are
  Redis-backed and replica-safe.
- Legal pages are beta drafts pending professional review.
- GitHub Pages demo is a separate, localStorage-only artifact — not the beta.
