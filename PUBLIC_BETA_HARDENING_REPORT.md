# Public Beta Hardening Report

Date: 2026-06-21  
Branch: `hardening/public-beta-blockers`  
Source audit: `READINESS_AUDIT_REPORT.md`

## 1. Executive summary

This sprint fixed the repository-level critical/high beta blockers identified by
the readiness audit:

- production configuration now rejects disabled scanning, memory email,
  filesystem storage, and unsafe app/game origin overlap;
- production API readiness verifies ClamAV and SMTP in addition to database,
  Redis, and storage;
- supported deployment manifests keep MinIO private, require ClamAV/SMTP, use a
  separate registrable UGC domain, and no longer create anonymous buckets;
- invite-only mode now blocks first-time Google account creation while allowing
  linked users to log in; open OAuth signup creates `PLAYER` only;
- admin user actions enforce `OWNER > ADMIN > CREATOR > PLAYER`, block self and
  equal/higher-role actions, and create audit entries;
- published catalog edits and cover changes now create review-gated metadata
  revisions. Live approved data remains public until an atomic admin decision;
- the direct API upload E2E helper and feedback selector were updated; the full
  27-test browser suite passes;
- Nodemailer was upgraded to the fixed `9.0.1` release, clearing the high
  production audit gate;
- backups now include published games and the mandatory private avatars/media
  bucket, optionally quarantine, over the private Compose network;
- documentation now reflects guest play, cloud saves, creator access, Stripe,
  direct uploads, metadata re-review, private storage, required wildcard DNS/TLS,
  and the actual logging-only observability baseline.

**Verdict:** repository code is ready for production-like staging and a
controlled private-beta acceptance run. It is **not yet approved for public
beta** because live production checks listed below were not possible here. No
production DNS, TLS, SMTP, OAuth consent screen, Stripe endpoint, ClamAV database,
bucket policy, off-host backup, or restore target was accessed. The Docker daemon
was unavailable, so image startup and container health remain unverified.

Updated readiness estimates (proven capability, not completion percentage):

| Target | Audit | After sprint | Assessment |
| --- | ---: | ---: | --- |
| Demo readiness | 86% | **95%** | Builds and bundle separation pass; remaining risk is ordinary browser/product QA. |
| Private beta readiness | 58% | **85%** | Repository blockers are fixed; live infrastructure acceptance and real Redis run remain. |
| MVP readiness | 64% | **82%** | Core flows and release gates are trustworthy; lower-priority product/ops gaps remain. |
| Public production readiness | 32% | **68%** | Security defaults are fail-closed, but live provider, backup, monitoring, and operational evidence is mandatory before launch. |

## 2. Blocker status

| Blocker from audit | Status | Files changed | Tests added/updated | Risk after fix |
| --- | --- | --- | --- | --- |
| Production scanning could be disabled | FIXED | `packages/config/src/index.ts`, compose templates, `apps/api/src/routes/health.ts` | config production/dev/test cases | Low in code; ClamAV availability needs prod check |
| Hostinger memory email default | FIXED | Hostinger compose/env/docs, config schema | config SMTP/memory cases | Low in code; delivery needs prod check |
| App and game-host shared registrable domain | FIXED | config schema, Hostinger/Railway env and docs | same-host/domain rejection tests | DNS/TLS needs prod check |
| Oracle public MinIO and anonymous policy | FIXED | `docker-compose.oracle.yml`, forbidden scan | forbidden scan and compose config | Oracle is explicitly local evaluation only |
| Railway disabled scan / optional wildcard guidance | FIXED | Railway compose/env comments | compose config, forbidden scan | Unsupported until private ClamAV and wildcard domain are configured |
| Google OAuth bypassed `INVITE_ONLY` | FIXED | `googleOAuth.ts`, auth UI copy | first-time block, linked login, PLAYER creation | Real Google redirect/consent needs prod check |
| ADMIN could act on ADMIN/OWNER | FIXED | `guards.ts`, `admin.ts` | `adminHierarchy.integration.test.ts` | Low; offline owner recovery remains an ops responsibility |
| User role/status actions lacked audit coverage | FIXED | `admin.ts` | hierarchy audit assertions | Low |
| Published metadata/media bypassed review | FIXED | Prisma revision model/migration, creator/admin/cover APIs, admin/creator UI | 5 metadata revision integration tests | Low; first-party screenshot upload deferred |
| Published cover could change immediately | FIXED | `gameCover.ts`, metadata revision queue | metadata revision tests plus existing cover tests | Pending cover is authenticated/private until approval |
| External screenshot URLs could change after approval | FIXED | creator revision path and docs | published metadata visibility tests | Option 2 used: published URL changes require review; remote tracking remains a documented limitation |
| Stale E2E upload helper / feedback copy | FIXED | `tests/e2e/helpers.ts`, feedback spec, isolation fixture | full Playwright suite | Low |
| Format and forbidden-scan gates failed | FIXED | formatted baseline files, `forbidden-scan.sh` | both commands pass | Low |
| Redis suite failed locally without Redis | FIXED | `rateLimit.integration.test.ts` | skips only when no real URL; CI still supplies Redis | NEEDS PROD CHECK with real Redis |
| High production dependency advisory | FIXED | API package and lockfile | API typecheck/unit tests; audit high gate | Three Prisma CLI transitive moderate advisories remain |
| Backups omitted avatars/covers/media | FIXED | storage backup/restore scripts and docs | shell syntax and dry-run/list checks | Full encrypted off-host restore needs prod check |
| Sentry DSN was documented but unused | FIXED | config/templates/deployment docs | typecheck/config tests | Logging exists; alerting/log shipping remains manual |
| README/deployment claims were stale | FIXED | README and deployment/runbook docs | documentation review, format check | Low |

## 3. Security notes

- Production scanning cannot be disabled: `NODE_ENV=production` requires
  `SCAN_DRIVER=clamav`; API and worker readiness fail when clamd is unavailable.
- Production memory email is rejected: `EMAIL_DRIVER=smtp` is mandatory and API
  readiness calls SMTP verification without logging credentials.
- MinIO/S3 stays private in supported manifests. Browser ZIP uploads use the
  authenticated same-origin API endpoint. No production manifest publishes port
  9000 or configures anonymous bucket access.
- Google OAuth no longer bypasses the account policy. Existing provider links
  still work, invite-only first-time creation is blocked, and open creation uses
  the default `PLAYER` role.
- Admin hierarchy is server-enforced. ADMIN cannot act on ADMIN/OWNER, dangerous
  self-action is blocked, OWNER can manage ADMIN, and no endpoint can demote an
  OWNER through creator promotion.
- Published metadata/media cannot bypass review. One pending revision per game is
  enforced by a partial unique index; approve/reject uses a conditional atomic
  claim so concurrent decisions cannot both win. Live game detail stays approved.
- E2E covers authenticated direct ZIP upload, worker validation output,
  moderation preview, approval, publication, launch, hidden/unpublished denial,
  and runtime cross-game origin isolation. Game-host unit tests additionally cover
  bare/unknown/malformed hosts, rejected previews, and cross-version mismatch.
- CSP, iframe sandbox, Permissions-Policy, host-only cookies, immutable published
  game object prefixes, Stripe webhook verification/idempotency, guest play, and
  cloud saves were not weakened.

## 4. Test results

| Command | Result |
| --- | --- |
| `npm run db:generate` | PASS |
| `npx prisma validate --schema packages/database/prisma/schema.prisma` | PASS |
| `npm run format:check` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS, all workspaces |
| `npm run test` | PASS, 85 tests |
| `npm run test:integration` | PASS, 97 tests; 3 Redis tests skipped because no `REDIS_URL` was available |
| `npm run build` | PASS; Vite reported only the existing >500 kB chunk warning |
| `bash infra/scripts/check-real-bundle.sh apps/web/dist` | PASS |
| `npm run build:demo` | PASS; no separate demo guard script exists |
| `npm run test:e2e` | PASS, 27/27 |
| `npm audit --omit=dev --audit-level=high` | PASS; 3 moderate Prisma CLI transitive advisories remain |
| `bash infra/scripts/forbidden-scan.sh` | PASS |
| Compose `config -q` for local, production example, Hostinger, Railway, Oracle evaluation | PASS |
| backup/restore `bash -n` and dry-run bucket listing | PASS |
| `git diff --check` | PASS |
| `docker info` | FAIL: Docker daemon unavailable; no runtime image/health verification performed |

During repair, the first post-change E2E run passed 26/27. The isolation fixture
attempted to publish two games for one Free creator and correctly hit the
one-published-game plan limit. The test now uses two creators and the final full
run passes 27/27 without changing billing behavior.

The Redis tests now skip cleanly when no real Redis URL is configured. This is
not sufficient production evidence; CI or staging must rerun
`REDIS_URL=redis://... npm run test:integration` and show all 100 tests executed.

## 5. Manual production checklist

- [ ] Configure app and game-host on separate registrable domains; verify wildcard
      DNS and TLS for random `{versionId}--{gameId}` hosts.
- [ ] Validate Caddy/app/game-host CSP, HSTS, `frame-ancestors`, iframe sandbox,
      Permissions-Policy, unknown/bare host 404s, and no CSP relaxation.
- [ ] Inspect `Set-Cookie`: Secure, HttpOnly session, SameSite=Lax, host-only; prove
      game origins receive no auth/CSRF cookies.
- [ ] Run ClamAV clean and EICAR uploads; verify readiness, current signatures,
      rejection, quarantine behavior, and no public object access.
- [ ] Deliver verification and password-reset mail to an external mailbox; verify
      SMTP readiness while confirming logs contain no credentials.
- [ ] Send and replay a Stripe CLI webhook; verify signature rejection for invalid
      payloads and one idempotent event record for valid replay.
- [ ] Test Google OAuth redirect/consent, existing linked login, invite-only
      first-time rejection, and open PLAYER-only creation.
- [ ] From outside the private network, prove list/get denial for published,
      quarantine, and avatars/media buckets. Confirm no port 9000 exposure or
      anonymous policy.
- [ ] Run integration tests with real Redis and exercise API/worker readiness under
      Redis and ClamAV loss/recovery.
- [ ] Run encrypted off-host database and all-bucket backups; restore into clean
      targets, verify hashes/row counts/migrations/launch, and re-check private
      bucket policies before routing traffic.
- [ ] Start every image with the supported production Compose stack and record
      container readiness because the local Docker daemon was unavailable here.
- [ ] Configure log shipping/alerts for API 5xx, readiness failures, worker job
      failures, scan failures, disk capacity, certificate expiry, and backup age.

## 6. Next sprint recommendation

Start feature work only after the manual production checklist is recorded:

1. Improved creator onboarding and a creator landing/waitlist flow.
2. More GA4 funnel events with documented consent and data quality.
3. A player cloud-save dashboard.
4. First-party screenshot upload and moderation polish.
5. Creator Plus storefront and analytics polish.
6. Tips/donations only after billing, tax, refund, and abuse design review.
7. Promoted games only after ranking disclosure and moderation policy work.

No files were staged, committed, or pushed. Human review is required before any
push or deployment.
