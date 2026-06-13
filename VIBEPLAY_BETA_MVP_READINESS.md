# VibePlay Beta MVP Readiness

Last updated: 2026-06-12

Status values: `DONE`, `PARTIAL`, `MISSING`, `BLOCKED`, `NOT VERIFIED`.

## Recovery inventory

| Phase | Implementation | Tests | Commit | Remaining work |
| --- | --- | --- | --- | --- |
| Demo leakage | DONE | PARTIAL | `5c56e1c`, `02a41bd` | Re-run real/demo builds, bundle guard and production UI E2E |
| Origin isolation | PARTIAL | PARTIAL | `70cf10e` plus uncommitted single-label wildcard fix | Run browser storage/launch/SDK suite and HTTP header checks |
| Playwright | PARTIAL | PARTIAL | Uncommitted | Auth was previously 3/3; RBAC is now 3/3; complete remaining specs |
| Redis rate limiting | PARTIAL | PARTIAL | `82168da` plus uncommitted integration test | Remove runtime fail-open behavior and verify real Redis failure semantics |
| Backup/restore | PARTIAL | NOT VERIFIED | Uncommitted | Perform PostgreSQL and object-storage backup/restore drill |
| Logging/monitoring | PARTIAL | NOT VERIFIED | Spread across existing service commits | Verify redaction, required fields and optional Sentry behavior |
| Legal pages | DONE | PARTIAL | `ac1970c` | Run direct-route, mobile and footer regression tests |
| Account controls | PARTIAL | PARTIAL | `c58a65b` | Current export/deletion actions only create manual requests; verify beta scope and tests |
| Beta feedback | PARTIAL | PARTIAL | `c58a65b`, `02a41bd` | Verify API/UI flow; admin listing and resolution workflow are not yet proven |
| Security headers | PARTIAL | PARTIAL | Uncommitted | Verify main app/game-host headers over HTTP and production HTTPS config |
| Documentation | PARTIAL | NOT VERIFIED | Mostly uncommitted | Reconcile docs with verified behavior and final verdict |

## Recovery evidence

| Check | Result |
| --- | --- |
| Git branch | `main`, 15 commits ahead of `origin/main` at recovery start |
| Working tree | 20 modified files plus untracked E2E, scripts, Caddy and docs; no staged changes |
| Diff validation | `git diff --check` passed |
| Node toolchain | Node `v22.22.3`, npm `10.9.8` |
| Playwright | `1.60.0`, Chromium 148 installed for macOS arm64 |
| Dependency install | `npm ci` passed; npm reported 9 audit findings |
| Migrations in E2E clean DB | All 3 migrations applied successfully |
| RBAC E2E | `3 passed` on 2026-06-12 |

## Current verdict

`PRIVATE BETA WITH BLOCKERS`

This is a recovery checkpoint, not the final verdict. Upload/moderation,
origin isolation, restore, Docker health and the critical quality matrix are
still pending verification.
