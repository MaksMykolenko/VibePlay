# VibePlay MVP Implementation Plan

Date: 2026-06-12. Baseline: commit `4642b04` (frontend prototype, clean tree).
Goal: convert the frontend prototype into an invite-only private-beta MVP where the
server controls users, roles, files, game versions, moderation and sandboxed game launch.

Input audit: `VIBEPLAY_PRODUCTION_READINESS_AUDIT.md` (verdict: demo 72%, private beta 12%).

## Target architecture

npm-workspaces monorepo:

```
VibePlay/
├── apps/
│   ├── web/          # existing React + Vite frontend (moved, then API-integrated)
│   ├── api/          # Fastify 5 + TypeScript REST API (single trust boundary)
│   ├── worker/       # BullMQ worker: ZIP quarantine pipeline (validate → scan → extract → publish prefix)
│   └── game-host/    # separate-origin static game server with strict CSP, DB-backed access control
├── packages/
│   ├── shared/       # enums, error codes, zod DTO schemas, moderation state machine, limits, SDK message protocol
│   ├── database/     # Prisma 7 schema, offline-generated SQL migrations, seed, grant-admin script
│   ├── config/       # zod-validated environment loading (fail-fast per service)
│   └── sdk/          # zero-dependency postMessage SDK (game side) + host bridge (player side)
├── infra/            # Dockerfiles, Caddy reverse proxy config, scripts
├── fixtures/         # hello-vibeplay.zip + malicious archive fixtures + generator
├── docs/             # architecture, auth, pipeline, sandbox, moderation, deployment, backup, security, runbook
├── docker-compose.yml
├── docker-compose.production.example.yml
└── .env.example
```

## Key technical decisions

| Area | Decision | Why |
| --- | --- | --- |
| Backend | Fastify 5 + TypeScript + zod | spec-recommended, schema validation, fast |
| ORM | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`) | Rust-free TS client; offline `migrate diff` SQL migrations |
| Sessions | Opaque 256-bit token, sha256 hash in DB, HttpOnly `vp_session` cookie, SameSite=Lax, rotation on login | spec §10 |
| Passwords | Argon2id + server-side pepper | spec §10 |
| CSRF | Double-submit cookie (`vp_csrf`) + `x-csrf-token` header on all mutations | cookie auth |
| Queue | BullMQ + Redis; `inline` driver for tests | spec §6 |
| Storage | Provider-neutral `ObjectStorage` interface: `s3` driver (MinIO/R2/S3/B2) + `fs` driver (dev/test) | spec §6 «не прив'язуй до provider» |
| Malware scan | ClamAV clamd INSTREAM client; `off` driver allowed only outside production and recorded honestly in scan report | spec §6 |
| Email | nodemailer SMTP (Mailpit local) + memory driver for tests | spec §6 |
| Game origin | `GAME_ORIGIN` (e.g. `http://games.localhost:8080` locally; separate registrable domain in prod). game-host checks DB (published + not hidden) with short TTL cache + Redis invalidation → hide kills new loads ≤15 s | spec §25, §30 |
| Game access model | Buckets fully private; game-host is the only reader; admin preview via short-lived HMAC-signed preview token | documented in docs/GAME_SANDBOX.md |
| Frontend state | TanStack Query + single `ApiClient` interface with `http` (real) and `demo` (localStorage, GitHub Pages) implementations | one set of pages, honest demo |
| Demo role switcher | only when `VITE_APP_MODE=demo` AND `VITE_ENABLE_DEMO_ROLES=true`; real bundle contains no demo accounts (CI greps dist) | spec §12 |

## Database entities

User, Session, EmailVerificationToken, PasswordResetToken, Invite, Game, GameVersion,
ModerationDecision, GameScreenshot, Like, Favorite, PlaySession, Comment, Report,
Notification, AuditLog (append-only at API level) — fields per spec §9, with FKs,
uniques (`Like`/`Favorite` composite PK), indexes and timestamps.

## Moderation state machine (GameVersion)

```
UPLOADING → QUARANTINED → VALIDATING → READY_FOR_REVIEW → APPROVED → PUBLISHED → ARCHIVED
VALIDATING → SCAN_FAILED            READY_FOR_REVIEW → REJECTED
```

Implemented as a pure transition table in `packages/shared`; enforced transactionally
(`UPDATE … WHERE status = expected`, 409 on conflict). Admin cannot approve own game.

## Phases & commits

One commit per phase, after `lint + typecheck + tests + build`:

- **Phase 0** — monorepo restructure (git mv web), packages scaffold, Prisma schema +
  migrations + seed, .env.example, docker-compose (postgres, redis, minio,
  create-minio-buckets, clamav, mailpit, api, worker, web, game-host, caddy), CI skeleton.
- **Phase 1** — real auth (register/invite/login/logout/logout-all/verify/reset/sessions),
  RBAC middleware, profile API, web auth integration, demo switch gating.
- **Phase 2** — games/catalog API, likes/favorites/recently-played, comments, reports,
  notifications; web pages on TanStack Query.
- **Phase 3** — creator games CRUD, immutable GameVersion records, submit-for-review,
  re-review rules.
- **Phase 4** — presigned upload (quarantine bucket), BullMQ job, worker ZIP pipeline
  (signature/limits/traversal/symlink/encryption/allowlist/index.html/ClamAV/safe
  extract/content hash/immutable prefix), honest upload statuses in UI.
- **Phase 5** — admin moderation queue, approve/reject (transactional, idempotent-safe),
  hide/restore, users suspend/ban, reports workflow, audit log + admin UI.
- **Phase 6** — game-host with CSP/security headers, sandboxed iframe player, SDK
  handshake, launch authorization endpoint, play sessions, hide kill behavior.
- **Phase 7** — error boundary + error states, route lazy loading, accessibility fixes,
  legal pages, security headers on main app, health/logging, backup & deployment docs.
- **Phase 8** — unit/integration tests (embedded Postgres in sandbox; services in CI),
  Playwright E2E spec, fixtures, CI hardening, `VIBEPLAY_MVP_PRIVATE_BETA_READINESS.md`,
  final report.

## Environment constraints of this working session

No Docker daemon, Redis, ClamAV binaries available in the build sandbox. Therefore:
unit + integration tests run here against embedded PostgreSQL + fs storage + inline
queue + memory mailer + stub scanner; BullMQ/MinIO/ClamAV/Mailpit paths are exercised
via docker-compose + GitHub Actions CI. The final report states explicitly which
checks ran where. Nothing is reported as verified unless it actually ran.
