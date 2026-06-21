# VibePlay Readiness Audit Report

Audit date: 2026-06-21  
Scope: non-destructive review of the current repository at `/Users/maksymmikolenko/MyProjects/VibePlay`  
Verdict: **NOT READY until blockers fixed**

## Audit method and limits

This audit inspected the npm workspaces, React application, Fastify API, worker,
game host, Prisma schema and all 11 migrations, shared schemas/protocols, SDK,
storage abstraction, Docker/Caddy variants, CI, Playwright harness, backup
scripts, environment templates, and operational/security documentation.

Backend, database, worker, and hosting enforcement were treated as authoritative.
A UI element alone was not counted as implementation. No secrets were printed,
no `.env` file was read, no database was reset, no Docker volume was removed, and
nothing was committed or pushed. Production infrastructure was not accessed, so
all live DNS, TLS, provider, webhook, email, backup, and observability claims are
marked for production verification.

Status vocabulary:

- **IMPLEMENTED**: backed by real code and persistence/enforcement; tests may still
  have gaps.
- **PARTIALLY IMPLEMENTED**: a meaningful real path exists, but an important part
  is incomplete or inconsistent.
- **MOCKED / DEMO ONLY**: works only in the explicit browser-local demo build or is
  a visible non-functional affordance.
- **MISSING**: no implementation was found.
- **BLOCKED / BROKEN**: the current path or its required release test is proven to
  fail.
- **NEEDS MANUAL PROD CHECK**: code/config exists, but the external deployment was
  not verified.

## 1. Executive summary

VibePlay is substantially beyond a visual prototype. It has real session auth,
CSRF and RBAC, a PostgreSQL domain model, a real creator upload pipeline, archive
validation, BullMQ processing, ClamAV integration, moderation records, HMAC preview
URLs, database-gated game serving, per-version origins, a sandboxed player, cloud
saves, social features, Stripe subscription state, admin workflows, and an
explicitly separated demo bundle.

The project is nevertheless not ready for a responsibly operated beta in its
current state. The largest gaps are not cosmetic:

1. Railway explicitly disables malware scanning, and environment validation
   allows scanning to be disabled in production.
2. The Oracle deployment publishes MinIO and anonymously exposes the bucket that
   already contains extracted pre-moderation builds, bypassing game-host access
   checks.
3. Creators can change published metadata and media without re-review.
4. Google OAuth creates accounts while invite-only mode is enabled.
5. The documented Hostinger game domain is not a separate registrable domain;
   Railway incorrectly describes wildcard hosting as optional even though the
   code requires per-version subdomains.
6. Hostinger defaults to memory-only email, which makes password registration,
   verification, and reset unusable without manual database intervention.
7. The E2E release suite is stale: 13 of 27 tests fail, including every upload,
   moderation, and launch-isolation scenario.

### Readiness scores

| Target | Score | Assessment |
| --- | ---: | --- |
| Demo readiness | **86%** | The explicit demo build is broad, honest about local-only behavior, builds successfully, and real bundles exclude demo credentials. The failing format/CI gate and stale E2E still reduce confidence. |
| Private beta readiness | **58%** | Core player/creator/admin flows exist, but invite bypass, email defaults, disabled scanning paths, deployment contradictions, and broken critical-path E2E must be fixed first. A tightly controlled local/staging test is viable; inviting external users is not yet justified. |
| MVP readiness | **64%** | Most MVP product capabilities are implemented, including cloud saves and billing. Moderation integrity, deployability, operational verification, and truthful documentation lag the feature set. |
| Public production readiness | **32%** | Public launch is blocked by UGC security/deployment variants, re-review bypass, admin hierarchy weaknesses, incomplete monitoring/privacy/SEO, dependency findings, and unverified backups/TLS/email/Stripe. |

The scores estimate proven capability, not percentage of files completed. Security,
moderation, and deployability carry more weight than UI breadth.

## 2. Feature matrix

### A. Authentication and user accounts

| Area | Feature | Status | Evidence | Risk | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| Auth | Password registration | IMPLEMENTED | `apps/api/src/routes/auth.ts:46-130`; strict schema in `packages/shared/src/schemas.ts:83-92`; integration/E2E auth tests | Low | Normalizes email/username, hashes password, records acceptance, creates verification token and session. |
| Auth | Invite-only registration | PARTIALLY IMPLEMENTED | Password gate and single-use transaction at `auth.ts:49-109`; public config at `auth.ts:43`; Google path at `googleOAuth.ts:106-152` has no invite check | High | Enforce invite mode in every account-creation path, especially Google OAuth, and add an integration test. |
| Auth | Login/logout/logout-all | IMPLEMENTED | `auth.ts:133-170`; session revocation in `lib/sessions.ts:96-109` | Low | Dummy hash limits account-timing differences; suspended/banned accounts are rejected. |
| Auth | Google OAuth | PARTIALLY IMPLEMENTED | State cookie and callback at `googleOAuth.ts:156-212`; provider token verification at `lib/googleOAuth.ts:17-52`; 7 integration tests | High | Real OAuth is implemented, but it bypasses `INVITE_ONLY`; live consent-screen and redirect configuration need verification. |
| Auth | Sessions/cookies/CSRF | IMPLEMENTED | `lib/sessions.ts:19-94`; global CSRF hook `app.ts:162-187`; CORS allowlist `app.ts:107-120` | Medium | Opaque hashed tokens, HttpOnly session cookie, host-only cookies, session-bound double-submit CSRF. Confirm live `Set-Cookie` and proxy origin behavior. |
| Auth | Password hashing | IMPLEMENTED | Argon2id + pepper in `lib/crypto.ts:28-49` | Low | Parameters match the documented minimum; add an upgrade/rehash policy before scale. |
| Auth | Email verification/reset | PARTIALLY IMPLEMENTED | Token flows at `auth.ts:199-314`; SMTP implementation at `lib/mailer.ts:19-56`; Hostinger memory default at `docker-compose.hostinger.yml:196` | High | Works with real SMTP, but a documented production path silently stores email in memory and cannot verify/reset users. Make production SMTP fail-closed. |
| Auth | Player vs creator onboarding | PARTIALLY IMPLEMENTED | Invite role is server-controlled at `auth.ts:64-90`; real UI says creator access is invite-based at `useAuth.tsx:196-205`; onboarding card at `Creator/Overview.tsx` | Medium | Appropriate for private beta, but there is no request/waitlist flow and the public CTA ends in a toast/contact instruction. |
| Auth | Profile/avatar upload | IMPLEMENTED | Profile API `profiles.ts:94-115`; signed raster upload `profiles.ts:117-264`; magic-byte validation `lib/avatar.ts:15-47`; integration tests | Low | MinIO remains private in the supported path. External avatar URLs remain allowed and can act as third-party trackers. |
| Auth | Account sessions/security UI | IMPLEMENTED | Sessions API `auth.ts:179-197`; settings UI in `SettingsPage.tsx` | Low | Session list and revocation exist. No MFA, login alerts, or breached-password check. |
| Auth | Account deletion | PARTIALLY IMPLEMENTED | Manual request at `profiles.ts:266-301`; runbook manual procedure `docs/PRIVATE_BETA_RUNBOOK.md:35-43` | Medium | Not a complete deletion workflow; no admin completion action, SLA tracking, or automated object/data cleanup. |
| Auth | Data export | PARTIALLY IMPLEMENTED | Immediate export at `profiles.ts:304-477` | Medium | Broad export works, but cloud saves, subscription state, and OAuth account links are omitted. Documentation also still describes admin processing. |

### B. Player experience

| Area | Feature | Status | Evidence | Risk | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| Player | Browse/catalog/search/categories | IMPLEMENTED | `catalog.ts:27-113`; `GamesPage.tsx`, `SearchPage.tsx`, `LandingPage.tsx` | Low | Real pagination/filtering exists. Homepage recommendations are simple client-side slices, not personalized ranking. |
| Player | Game detail page | IMPLEMENTED | `catalog.ts:67-101`; `GameDetailPage.tsx` | Low | Published-only lookup, metadata, controls, changelog, likes/favorites and comments. |
| Player | Play page and guest play | IMPLEMENTED | Anonymous launch at `catalog.ts:351-386`; iframe at `GamePlayerPage.tsx:621-632`; game-host gating at `game-host/src/app.ts:137-232` | Medium | Guest play is real. Current E2E launch proof is broken by its upload helper and must be restored. |
| Player | Cloud saves/progress sync | IMPLEMENTED | Prisma `GameSave` at `schema.prisma:426-452`; API `gameSaves.ts`; SDK bridge `packages/sdk/src/host.ts`; play UI adapter | Medium | Per-user/game JSON with size/depth/key validation is real. No player-facing save-management screen uses `listGameSaves`. |
| Player | Guest-to-account save transfer | PARTIALLY IMPLEMENTED | SDK protocol and prompt in `GamePlayerPage.tsx:132-180,647-657`; adapter tests pass | Medium | Works only for games integrating the SDK/local-save provider; there is no platform fallback for non-integrated games. |
| Player | Favorites and likes | IMPLEMENTED | Models `schema.prisma:362-382`; API `catalog.ts:115-187`; library UI | Low | Game likes/favorites persist and are ownership-scoped. |
| Player | Comments | IMPLEMENTED | Model `schema.prisma:401-420`; API `catalog.ts:206-283`; `CommentsSection.tsx` | Medium | Create/delete/report work. UI enforces 300 chars while API permits 2,000, and success toasts are shown before async completion. |
| Player | Comment likes | MOCKED / DEMO ONLY | Visible button `CommentsSection.tsx:174-185`; real provider only shows a notice at `RealGamesProvider.tsx:235-237`; no DB/API model | Low | Remove/disable the affordance in real mode or implement a real comment-like model/API. |
| Player | Feedback | IMPLEMENTED | API `catalog.ts:285-306`; UI `FeedbackModal.tsx`; admin workflow `admin.ts:486-539` | Low | Real persistence exists; one E2E test is stale because button copy changed. |
| Player | Reports | IMPLEMENTED | API `catalog.ts:308-320`; admin handling `admin.ts:422-484`; UI report actions | Medium | Target existence is validated. No duplicate-report suppression or automated priority/abuse heuristics. |
| Player | Notifications | IMPLEMENTED | Model `schema.prisma:502-526`; API `catalog.ts:322-349`; notifications page/hook | Low | In-app only. Notification preferences currently do not govern any delivery paths. |
| Player | Play history | IMPLEMENTED | `PlaySession` model; launch/end and recent API at `catalog.ts:189-204,351-409`; library UI | Low | Anonymous session ending is not ownership-bound, affecting analytics integrity if an ID leaks. |
| Player | Achievements/profile benefits | MISSING | No achievement model/API/UI; SDK `progress` only drives the cloud-save CTA | Low | Defer until core retention is measured. Creator Plus badge is implemented, but player achievements are not. |

### C. Creator experience

| Area | Feature | Status | Evidence | Risk | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| Creator | Creator Hub/my games | IMPLEMENTED | `creator.ts:30-48`; `Creator/Overview.tsx`, `Creator/MyGames.tsx` | Low | Real API-backed inventory and status rendering. |
| Creator | Create/edit metadata | PARTIALLY IMPLEMENTED | Create/update at `creator.ts:50-170`; `Creator/PublishGame.tsx`, `Creator/EditGame.tsx` | High | Real and ownership-checked, but published metadata can be changed without moderation or status transition. |
| Creator | Cover upload | IMPLEMENTED | Signed direct raster path in `gameCover.ts`; magic-byte validation; integration tests | Medium | Secure storage path exists, but changing a published cover also bypasses re-review. |
| Creator | Screenshots | PARTIALLY IMPLEMENTED | URL-only array in `schemas.ts:178-180` and `creator.ts:76-78,151-156` | Medium | No first-party upload, magic-byte validation, proxying, or re-review. Remote hosts see player IPs and can change content. |
| Creator | Supported devices | IMPLEMENTED | DB `schema.prisma:244`; schemas `schemas.ts:168-173`; edit UI; integration tests | Low | Server-normalized and serialized with desktop fallback. |
| Creator | Structured controls | IMPLEMENTED | JSON DB field, migration `20260620000000_structured_game_controls`, schema `schemas.ts:146-158`, editor/card tests | Low | Implemented end-to-end. |
| Creator | ZIP upload flow | IMPLEMENTED | Intent/direct upload `creator.ts:243-408`; real UI `PublishGame.tsx:276-306`; version manager | Medium | Browser never receives MinIO URL. API buffers up to 100 MB in memory despite comments saying it streams, which limits concurrency. |
| Creator | Upload limits | IMPLEMENTED | Env hard caps `config/src/index.ts:98-117`; plan caps `lib/entitlements.ts`; rechecked by API and worker | Medium | Limits are real, but simultaneous requests can race plan-count checks. |
| Creator | Versioning/history | IMPLEMENTED | `GameVersion` model; create/read routes `creator.ts:173-232`; `GameVersionManager.tsx` | Low | Only one active workflow is intended; active-check/create is not transactional and can race. |
| Creator | Immutable published versions | IMPLEMENTED | Version-scoped object prefix `constants.ts:177-188`; worker guard `processVersion.ts:77-98`; publish/archive transaction `admin.ts:169-217` | Medium | Application workflow is immutable, but object storage does not enforce write-once/conditional put. Enable provider versioning/object lock where possible. |
| Creator | Draft/review/rejected/published state | IMPLEMENTED | Prisma enums `schema.prisma:193-212`; worker transitions; admin approve/reject; status UI | Low | `PENDING_REVIEW` and `APPROVED` are barely used/transient, creating state/documentation complexity. |
| Creator | Ownership checks | IMPLEMENTED | `lib/guards.ts:51-58`; creator/upload/media routes | Low | IDOR defenses are consistently present in reviewed creator routes. |
| Creator | Unverified creator restrictions | IMPLEMENTED | `requireVerifiedEmail` in create/edit/version/upload/cover routes | Medium | Enforcement is real, but memory-only production email can permanently block legitimate creators. |
| Creator | Analytics | PARTIALLY IMPLEMENTED | Totals and paid 30-day detail `creator.ts:503-576`; `Creator/Analytics.tsx` | Medium | Useful basics exist; no impressions, conversion, retention cohorts, geography/device, export, or data-quality tooling. |
| Creator | Creator Plus limits/benefits | PARTIALLY IMPLEMENTED | Entitlements `lib/entitlements.ts`; API limits; badge/analytics/priority label | Medium | Core caps work. `enhancedStorefront` is returned but no distinct storefront implementation was found; race-safe quota enforcement is absent. |

### D. Moderation/admin

| Area | Feature | Status | Evidence | Risk | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| Admin | Moderation queue | IMPLEMENTED | `admin.ts:41-71`; `Admin/Moderation.tsx` | Low | Queue includes validating and failed items in addition to review-ready items; UI must distinguish non-actionable states. |
| Admin | Preview links/HMAC | IMPLEMENTED | Mint at `admin.ts:284-300`; verify and state check at `game-host/src/app.ts:211-231,275-297`; tests | Low | Five-minute version-bound tokens and dedicated preview origins are sound. Verify clock synchronization and live no-store headers. |
| Admin | Approve/reject | IMPLEMENTED | `admin.ts:131-281`; immutable decisions model | Medium | Scan/status gate and self-review rule exist. Metadata can be changed after approval, undermining the decision. |
| Admin | Admin/owner permissions | PARTIALLY IMPLEMENTED | Role hierarchy `guards.ts:32-49`; owner override tests; user actions `admin.ts:366-420` | High | Any ADMIN can suspend, ban, restore, or demote another ADMIN/OWNER. Add target-role hierarchy checks and owner-only sensitive actions. |
| Admin | Reports handling | IMPLEMENTED | `admin.ts:422-484`; `Admin/Reports.tsx` | Low | Status/assignment/resolution and reporter notification exist. |
| Admin | Users management | PARTIALLY IMPLEMENTED | `admin.ts:339-420`; `Admin/Users.tsx` | High | Suspend/ban revokes sessions and suspends games, but equal/higher-role protection and comprehensive audit entries are missing. |
| Admin | Audit logs | PARTIALLY IMPLEMENTED | Model/read API; `lib/audit.ts`; admin UI | Medium | Many sensitive actions are logged, but suspend/ban/restore/promote/feature/report resolution are not consistently audited. Append-only is an application convention, not a DB permission. |
| Admin | Priority moderation | IMPLEMENTED | Active Plus sorting `admin.ts:41-70`; entitlement flag | Low | A label/sort exists; no SLA timer or operational queue metrics. |
| Admin | Abuse/security response | PARTIALLY IMPLEMENTED | Hide/suspend/invalidation, reports, `docs/INCIDENT_RESPONSE.md` | Medium | Core containment exists. No bulk kill switch, automated quarantine retention hold, appeal workflow, or tested incident automation. |

### E. Game hosting and UGC security

| Area | Feature | Status | Evidence | Risk | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| Hosting | Game-host routing | IMPLEMENTED | Host parser `packages/shared/src/gameOrigin.ts`; routing `game-host/src/app.ts:185-232` | Medium | Bare/unknown hosts fail closed. Requires wildcard DNS/TLS; the Railway guide incorrectly treats this as optional. |
| Hosting | Per-version isolation | IMPLEMENTED | One-label `{version}--{game}` origin helper and host checks; iframe launch validation | High | Code is correct, but Hostinger uses the same registrable domain as the app, contrary to the threat model. |
| Hosting | CSP/sandbox/Permissions-Policy | IMPLEMENTED | Game CSP `app.ts:53-70`; headers `app.ts:125-135`; iframe `GamePlayerPage.tsx:621-632`; SPA Caddy CSP | Medium | Strong containment for static games. Live headers and wildcard substitution need verification. |
| Hosting | Block pending/rejected access | IMPLEMENTED in service; BROKEN in Oracle config | DB gate `game-host/src/app.ts:137-152,222-231`; Oracle anonymous bucket `docker-compose.oracle.yml:69-91` | Critical | Game-host blocks them, but Oracle exposes the underlying bucket containing extracted review builds. Retire/fix that deployment file. |
| Hosting | No direct MinIO exposure | PARTIALLY IMPLEMENTED | Direct API upload `creator.ts:290-306`; Hostinger internal-only compose; Oracle publishes port 9000 and anonymous bucket | Critical | Safe in Hostinger/staging design, unsafe in Oracle. Add CI policy checks for public storage ports/policies. |
| Upload | ZIP validation/path traversal/types/limits | IMPLEMENTED | `worker/src/pipeline/zipValidator.ts`; `extract.ts`; archive/unit/integration tests | Low | Encrypted entries, traversal, absolute paths, symlinks, collisions, forbidden/unknown types, bombs, size and count are rejected. |
| Upload | ClamAV flow | PARTIALLY IMPLEMENTED | Real client `pipeline/clamav.ts`; fail on error/infection `processVersion.ts:160-174`; Railway `SCAN_DRIVER:none` | Critical | The pipeline is sound when enabled, but production can disable it and test E2E uses the disabled scanner. Fail startup in production unless ClamAV is enabled/healthy. |
| Upload | Worker processing | IMPLEMENTED | BullMQ worker `worker/src/index.ts`; guarded processing and stuck recovery | Medium | Retries/recovery exist. No dead-letter dashboard/alerting; error report shape in final retry differs from the normal scanner DTO. |
| Upload | Object layout/cache invalidation | IMPLEMENTED | `storageKeys`; Redis channel in queue/game-host; 15-second TTL fallback | Low | Published prefixes are version-scoped. Restore does not publish invalidation, and some restore/hide paths rely on TTL. |

### F. Billing/monetization

| Area | Feature | Status | Evidence | Risk | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| Billing | Stripe environment validation | IMPLEMENTED | `config/src/index.ts:130-155` | Medium | Fail-fast, but Stripe and Google are mandatory even for deployments that want those features disabled. Add explicit feature flags rather than placeholder keys. |
| Billing | Checkout session | IMPLEMENTED | `billing.ts:43-84`; integration tests | Medium | Verified creator only and server-selected price. Add idempotency/concurrency protection to customer/session creation. |
| Billing | Customer portal | IMPLEMENTED | `billing.ts:86-101`; integration tests | Low | Server uses stored customer ID. Live portal configuration needs verification. |
| Billing | Webhook raw-body verification | IMPLEMENTED | Scoped buffer parser and signature verification `billing.ts:104-126`; invalid-signature test | Low | Correct raw-byte handling. Verify the live endpoint and secret. |
| Billing | Webhook idempotency | IMPLEMENTED | `StripeWebhookEvent` model; transactional dedupe `billing.ts:128-205`; unique-race handling | Low | Good baseline. Add retry/out-of-order event tests and operational replay tooling. |
| Billing | Subscription model/status/cancellation | IMPLEMENTED | Prisma subscription model; webhook upsert; `hasActiveCreatorPlus` | Medium | Cancellation at period end retains access while active. Out-of-order webhook handling is not timestamp/version guarded. |
| Billing | Free vs Plus plan limits | IMPLEMENTED | `lib/entitlements.ts`; version/upload/approval enforcement | Medium | Enforced on backend, but count-and-create/approve is not serialized and can race. Existing games remain live after downgrade by design. |
| Billing | Billing UI | IMPLEMENTED | `BillingPanel.tsx` and settings route | Medium | Real redirect flows and state display. Price is hard-coded as `$3`; confirm it always matches the Stripe price/currency. |
| Billing | Paid entitlement activation security | IMPLEMENTED | Only signed Stripe subscription events update persisted subscription; API never accepts plan from client | Medium | Sound direction. Add explicit test that checkout completion alone cannot activate Plus and that unrelated price IDs cancel entitlement. |

### G. Analytics, SEO, and marketing

| Area | Feature | Status | Evidence | Risk | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| Analytics | GA4/page views | PARTIALLY IMPLEMENTED | Hard-coded measurement ID and dynamic loader `web/src/lib/analytics.ts:10-45`; route tracker | Medium | Production-only page views exist. No consent control was found despite EU deployment context, and the ID is not environment-configurable. |
| Analytics | Conversion/funnel events | PARTIALLY IMPLEMENTED | Cloud-save CTA/sync events only `analytics.ts:48-86`; player calls | Medium | Missing registration start/success/verification, login, creator CTA, draft/upload, checkout, and core play-start/completion funnel events. |
| SEO | Metadata/OpenGraph/Twitter/canonical | MISSING | Only static title/description in `apps/web/index.html:7-11`; no OG/Twitter/canonical/robots/sitemap found | Medium | Add public page metadata and server/prerender strategy; an SPA-only static head is weak for game discovery. |
| Growth | Landing/player registration value | PARTIALLY IMPLEMENTED | Cloud-save tagline and timed/progress CTA in `LandingPage.tsx` and `GamePlayerPage.tsx` | Medium | Cloud saves finally provide a reason to register. Catalog empty states, invite-only messaging, and missing funnel events can still obscure conversion. |
| Growth | Creator benefit/CTA clarity | PARTIALLY IMPLEMENTED | Creator banner `LandingPage.tsx:220-244`; invite-only toast in `useAuth.tsx` | Medium | CTA does not produce an application/waitlist or upload-first onboarding path for non-creators. |

### H. Deployment readiness

| Area | Feature | Status | Evidence | Risk | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| Deploy | Docker Compose syntax | IMPLEMENTED | `docker compose config -q` passed for local, staging example, Hostinger, Oracle, and Railway with placeholders | Low | Syntax validity does not prove runtime health. Docker daemon was unavailable for stack startup/build verification. |
| Deploy | Environment validation | PARTIALLY IMPLEMENTED | Zod schemas in `packages/config`; production scan/email/origin relationships are not enforced | High | Add cross-field rules: scan required in production, SMTP required for password auth, distinct registrable game domain, no fs storage in production. |
| Deploy | Caddy/security headers | PARTIALLY IMPLEMENTED | `infra/caddy/*.Caddyfile`; staging wildcard TLS block is only a commented placeholder | High | Live DNS-01/wildcard certificate and substituted CSP must be proven before beta. |
| Deploy | Wildcard game domains | BLOCKED / BROKEN in documented variants | Required by `gameOrigin.ts`; Railway guide calls it optional; Hostinger uses `games.vibeplay.games` | High | Use a truly separate registrable domain and make wildcard DNS/TLS a hard deployment prerequisite. |
| Deploy | Cookie domain rules | IMPLEMENTED in code; NEEDS MANUAL PROD CHECK | No `Domain` attribute in `sessions.ts:43-71`; Secure in production | Medium | Confirm reverse proxy preserves the intended host and cookies never reach game domains. |
| Deploy | Backups/restore scripts | PARTIALLY IMPLEMENTED | PostgreSQL and storage scripts/docs exist; `backup-storage.sh:18-20` backs up published/quarantine only | High | Avatars and game covers share `S3_AVATARS_BUCKET` and are omitted. Add that bucket and run/record an off-host restore drill. |
| Deploy | Logs/monitoring | PARTIALLY IMPLEMENTED | Pino logs and request IDs; `SENTRY_DSN` parsed but never used | High | No error reporting, metrics, alerting, queue-depth/disk/cert/payment/email monitoring was implemented. |
| Deploy | Health checks | PARTIALLY IMPLEMENTED | API DB/storage/Redis, worker DB/Redis/scanner, game-host DB/storage | Medium | API readiness does not verify SMTP/Stripe/Google; Docker checks often hit liveness rather than readiness. |
| Deploy | Internal/public route exposure | PARTIALLY IMPLEMENTED | Supported stacks keep data services internal; Oracle exposes MinIO; Hostinger exposes a direct API hostname | Critical | Retire unsafe legacy configs and decide whether the direct API hostname is needed. |
| Deploy | Build/package exclusions | IMPLEMENTED | `.dockerignore`, `.gitignore`, multistage images, non-root app runtimes | Low | Images and GitHub actions use moving tags/major tags; pin digests/commits for stronger supply-chain control. |
| Deploy | CI/release gates | BLOCKED / BROKEN | `.github/workflows/ci.yml`; format, forbidden scan, audit, and E2E currently fail locally | High | Restore a green, reproducible pipeline before release. |
| Deploy | Documentation | PARTIALLY IMPLEMENTED | Broad docs exist, but `README.md:154-160` still says presigned uploads; README known limitations and Railway bootstrap are stale | Medium | Update docs from current code and remove unsafe/obsolete deployment instructions. |

## 3. Implemented features

### Player

- Real password auth, Google OAuth mechanics, sessions, logout-all, email
  verification/reset, profiles, raster avatars, preferences, and a broad data
  export (with completeness gaps noted above).
- Published-only catalog, search/filter/sort, game detail, guest launch, likes,
  favorites, comments, reports, feedback, notifications, and play history.
- Per-user/per-game cloud saves with a game-side SDK, save validation, guest CTA,
  and an SDK-mediated local-save transfer path.

### Creator

- Creator Hub, draft creation/editing, cover upload, structured controls and
  devices, ZIP selection, client SHA-256, direct same-origin upload, status
  polling, version history, and immutable version-scoped storage layout.
- Backend ownership/email/role checks, free/Plus upload/version/published-game
  limits, basic analytics, paid advanced analytics, badge, and priority queue flag.

### Admin/moderator

- Moderation queue, validation reports, HMAC preview origin, approve/reject,
  immutable moderation decisions, owner override, game hide/restore/feature,
  user actions, reports, feedback, invitations, statistics, and audit-log views.

### Billing

- Stripe customer/checkout/portal integration, raw signed webhooks, event
  idempotency, subscription persistence, cancellation state, backend entitlement
  checks, and billing UI.

### Security

- Argon2id + pepper, hashed opaque tokens, host-only secure cookies, session-bound
  CSRF, strict input schemas, Redis rate limiting, ownership guards, log redaction,
  safe raster upload checks, archive hardening, and fail-on-scan-error behavior when
  ClamAV is enabled.
- Per-version UGC origins, published-state DB checks, preview-state checks, launch
  URL validation, iframe sandbox, game CSP, Permissions-Policy, no-referrer, and
  exact source/origin SDK messaging.

### Deployment

- Multistage non-root application images, migration service, health endpoints,
  private-service reference compose, Caddy SPA fallback/security headers,
  PostgreSQL/storage backup and restore scripts, incident/runbook documentation,
  CI jobs, secret scans, and bundle guards.

### Analytics

- GA4 page views and cloud-save conversion events; creator play/like/session
  analytics; platform admin counts.

## 4. Partially implemented or mocked features

- **Comment likes** look interactive but the real provider only displays “not part
  of the private beta API”; all real comments serialize with zero likes.
- **Notification preferences** persist, but no moderation/social/platform email
  delivery consults them. Approval/rejection/suspension email templates are unused.
- **Creator Plus enhanced storefront** is an entitlement flag with no proven UI or
  backend behavior.
- **Homepage recommendations** are client-side sorting/slicing, not user-specific.
- **Screenshot handling** accepts external URLs only; there is no secure upload or
  immutable serving path.
- **Cloud-save transfer** requires the game to integrate the SDK and expose its
  local save. It cannot migrate arbitrary browser storage for legacy games.
- **Monitoring** is configuration-shaped only: `SENTRY_DSN` is parsed/documented but
  unused.
- **Demo mode** contains browser-local users, comments, reports, gameplay canvas,
  upload progress, and moderation data. It is clearly labeled and correctly absent
  from the real production bundle, so it is not itself a production vulnerability.
- **UI success feedback** for comments, reports, and delete actions is emitted before
  asynchronous API completion in `CommentsSection.tsx`, allowing a success toast
  followed by a server error.
- **Account deletion** is a recorded request and manual runbook, not a completed
  product workflow.

## 5. Critical blockers

Only security, auth, upload, payment, hosting, moderation, and public-trust blockers
are listed here.

### 5.1 Production malware scanning is not fail-closed - Critical

Evidence: `packages/config/src/index.ts:78-85` permits `off`/`none` in production;
`docker-compose.railway.yml:88,124` selects `none`. This directly contradicts
`.env.example:75-79` and the platform claim that every build is malware scanned.

Impact: an uploaded build can reach `READY_FOR_REVIEW` with a disabled scan and can
be approved. Human review and CSP are not replacements for the promised malware
gate.

Fix: reject non-`clamav` `SCAN_DRIVER` when `NODE_ENV=production`; make worker
readiness mandatory; remove scan-disabled public deployment paths; add a real
ClamAV EICAR/clean-file deployment smoke test.

### 5.2 Oracle exposes extracted unapproved files outside game-host - Critical

Evidence: `docker-compose.oracle.yml:69-71` publishes MinIO, and lines 86-91 make
`vibeplay-published` anonymously downloadable. The worker writes extracted files
to that bucket before moderation at `processVersion.ts:186-223`.

Impact: pending, rejected, or scan-disabled content can be fetched directly if its
key is discovered, bypassing DB status, CSP, Permissions-Policy, and HMAC previews.

Fix: remove/retire the Oracle config or make MinIO internal-only and all buckets
private. Serve every game byte through game-host. Add a CI configuration check that
forbids MinIO host ports and anonymous policies in non-development compose files.

### 5.3 Published metadata/media bypass moderation - High

Evidence: `creator.ts:123-170` updates published title, description, age rating,
tags, devices, controls, cover URL, and screenshots without status change;
`gameCover.ts:111-159` replaces a cover without re-review.

Impact: a creator can pass review with benign content, then replace public-facing
metadata/media with abusive, adult, deceptive, or tracking content. The immutable
build decision no longer represents the public game listing.

Fix: version or separately moderate trust-sensitive metadata/media. Edits to a
published game should create a review revision while the last approved revision
remains live; emergency-safe fields must be explicitly allowlisted.

### 5.4 Google OAuth bypasses invite-only access - High

Evidence: password registration checks `INVITE_ONLY` at `auth.ts:49-68`, but
`googleOAuth.ts:106-152` creates any new verified Google user without invite logic.

Impact: a private beta advertised as invite-only is open to anyone through Google,
invalidating capacity, moderation, and rollout controls.

Fix: require and consume an invite for first-time OAuth identities (preserve it
through signed state/session), or disable OAuth account creation in invite mode
while allowing login for already-linked users.

### 5.5 Game-domain deployment contract is inconsistent - High

Evidence: code and `docs/GAME_SANDBOX.md:6-15` require a separate registrable
domain and per-version wildcard. Hostinger sets `games.vibeplay.games` under
`vibeplay.games`; Railway says wildcard setup is optional at
`RAILWAY_DEPLOY.md:131-150`, but the code mints subdomains and refuses the base host.

Impact: Hostinger weakens the intended site/cookie/permission boundary; Railway
default domains will not resolve the generated per-version hostnames, so games do
not launch.

Fix: use a separate registrable domain such as `vibeplayusercontent.com`, require
wildcard DNS/TLS before deployment, and enforce distinct registrable domains in
production config/startup checks.

### 5.6 Production email defaults can block account recovery and creators - High

Evidence: `docker-compose.hostinger.yml:196` and `.env.hostinger.example:68-77`
default to `EMAIL_DRIVER=memory`. Verification and reset tokens are sent only
through the mailer; creators require verified email.

Impact: password users cannot obtain verification/reset links, creator invites
cannot publish, and lost-password accounts cannot recover without operator DB
access. Memory mail also disappears on restart.

Fix: require verified SMTP in production when password auth is enabled, include it
in readiness, and complete a delivered-email smoke test. If email is intentionally
disabled, disable password signup/reset and present an honest OAuth-only flow.

### 5.7 Admins can act on equal/higher privileged accounts - High

Evidence: `admin.ts:366-420` only prevents self-action. It does not stop ADMIN from
suspending/banning/demoting another ADMIN or the OWNER.

Impact: a compromised or malicious admin can remove the owner, disable all other
moderators, and suspend their games.

Fix: compare actor/target role rank server-side; reserve OWNER changes for owner-only
or offline tooling; prevent removal of the last active owner; audit every role and
status change.

### 5.8 Critical-path release tests are broken - High

Evidence: `npm run test:e2e` produced 13 failures/14 passes. Twelve failures use
`tests/e2e/helpers.ts:177-195`, which mistakes the new relative direct API upload
URL for a presigned URL, omits auth/CSRF, and would call obsolete completion after
the direct endpoint. The feedback test expects old button copy.

Impact: CI does not currently prove upload validation, moderation, publication,
origin isolation, hiding, or cross-game storage isolation. Regressions in the
highest-risk workflows can ship unnoticed.

Fix: update the helper to call `uploadZipDirect` semantics once with session+CSRF,
update stable accessible selectors/copy, and require all critical E2E jobs green.

## 6. Conversion and growth blockers

### Why a visitor may not register

- **Cloud saves are now a credible reason to register**, and the player shows a
  “play as guest, save with account” message plus time/progress/save-triggered CTA.
  This is the strongest current conversion asset.
- **Invite-only and Google behavior conflict**: password registration asks for an
  invite while Google can create an account without one. This creates confusing
  messaging and uncontrolled acquisition.
- **Email can be a dead end** on the documented Hostinger default. A user can sign
  up but never verify, recover, or become a functioning creator.
- **No registration funnel measurement** exists for form view/start/error/success,
  verification sent/completed, Google start/completed, or return-to-intent beyond
  one cloud-save return event.
- **Guest value transfer is integration-dependent**. Games without the SDK cannot
  promise local-to-cloud migration, so the CTA may over-promise across the catalog.
- **No save-management UI** makes the benefit less tangible after registration.
- **Empty/small catalog risk**: landing sections are repeated slices of the same
  first 50 games and can render many empty carousels/categories.

### Creator conversion blockers

- The creator banner exists but “Become a Creator” ends in a contact/invite toast;
  there is no creator application, waitlist, or measurable CTA event.
- “Upload ZIP -> get playable link” is not a simple onboarding promise. Creators
  must first get an invite, verify email, fill a multi-step form, wait for validation,
  and wait for moderation; no checklist persists across sessions.
- Screenshot URLs and metadata editing feel prototype-like compared with the secure
  cover/build upload flow.
- Creator Plus is implemented but price copy is hard-coded and advanced analytics
  remain basic. The enhanced-storefront promise is not demonstrated.

### Recommended conversion fixes

1. Fix invite/email correctness first; never optimize a broken funnel.
2. Add registration, verification, creator CTA, upload-start/success, moderation,
   play-start, and checkout funnel events with consent-aware analytics.
3. Make cloud saves visible in settings/library and label which games support sync.
4. Persist guest return intent through login/Google and test save conflict handling.
5. Replace the dead creator CTA with an invite/application/waitlist flow and an
   onboarding checklist: profile -> metadata -> ZIP -> scan -> preview -> review.
6. State the creator promise plainly: “Upload a static ZIP, pass automated checks,
   preview it safely, and receive a shareable playable page after review.”

## 7. Recommended next features

### Must-have before public beta

1. Moderated metadata/media revisions for published games.
2. Fail-closed ClamAV production policy and a tested real scanner deployment.
3. One canonical production deployment using a separate registrable wildcard game
   domain and private storage; retire unsafe variants.
4. Reliable SMTP or an explicitly OAuth-only account model; production email smoke
   tests and readiness checks.
5. Green critical E2E, integration-with-Redis, format, forbidden scan, dependency,
   migration-drift, and container build gates.
6. Privileged-target RBAC, last-owner protection, and complete audit coverage.
7. First-party screenshot upload/proxy plus cover/screenshot moderation.
8. Monitoring/alerting for API errors, queue depth/failures, ClamAV age/health,
   storage/disk, certificate expiry, SMTP failures, Stripe webhooks, and backups.
9. Automated account deletion and verified export completeness.
10. Legal/privacy review and analytics consent before EU public traffic.

### High-impact growth features

1. Cloud-save support badge/filter and a player save-management screen.
2. Registration/verification/play/creator funnel instrumentation.
3. Guest-to-account save transfer coverage and integration examples for common game
   engines.
4. Creator landing page with examples, limits, review SLA, and an application CTA.
5. Shareable, SEO-ready game pages with OG/Twitter cards and creator attribution.

### Monetization features

1. Race-safe quota enforcement and webhook ordering/reconciliation.
2. Server-provided price/currency copy and a tested subscription lifecycle matrix.
3. Complete the promised enhanced storefront and analytics value before pushing
   Creator Plus conversion.
4. Tips/donations later, after identity, refunds, tax, fraud, moderation, and payout
   responsibilities are designed.
5. Promoted games later, only with clear labeling, quality controls, and ranking
   transparency.

### Creator retention features

1. Persistent onboarding checklist and per-step recovery.
2. Validation diagnostics with file-level actionable errors.
3. Better analytics: impressions -> detail -> play conversion, retention, session
   distribution, device, version, and export.
4. Draft metadata revision history and scheduled/preserved publication rollback.
5. Moderation SLA/status timestamps and creator response/resubmission workflow.

### Player retention features

1. Cloud-save dashboard, support badge, and conflict history.
2. Better personalized recommendations after enough event volume exists.
3. Follow creators and opt-in release notifications.
4. Comment likes only after the real model/API/moderation implications are built.
5. Achievements/profiles later, driven by a signed/abuse-resistant event design.

### Nice-to-have later

- Tips/donations, promoted games, creator storefront themes, collections/playlists,
  social following, achievements, and richer discovery ranking.
- Do not add multiplayer backend, currency, marketplace, or advertising until UGC
  safety, moderation operations, and retention are proven.

## 8. Technical debt and cleanup

### TODO/FIXME and stale documentation

Few literal TODO/FIXME markers exist; the larger debt is contradictory prose:

- `README.md:24-27` says payments are out of scope although Stripe billing exists.
- `README.md:154-160` and architecture diagrams describe presigned uploads, but the
  current product uses a same-origin direct API upload.
- `README.md:190-197` says avatar upload is disabled and export is admin-processed;
  both statements are stale.
- README/runbook say self-moderation is blocked without documenting the OWNER
  exception.
- Railway first-admin instructions use `bcrypt`/`@prisma/client` even though the
  application uses Argon2 and a custom generated Prisma package; use supported
  `grant-admin`/bootstrap tooling instead.
- Railway documents two R2 buckets, but avatar and cover uploads require the third
  `vibeplay-avatars` bucket.
- `SENTRY_DSN` is documented/configured but unused.

### Mock/demo and misleading UI

- Demo data under `apps/web/src/data`, `hooks/demo`, and `lib/api/demo` is intentional
  and correctly isolated from real builds.
- Comment likes remain visible in real mode despite having no backend.
- Demo-only game canvas/upload/moderation must remain visibly labeled and must never
  be used for beta acceptance testing.

### Duplicated/risky logic

- Upload completion has both the new direct endpoint and obsolete presigned
  `complete` endpoint, increasing branch and test drift.
- Avatar and cover upload flows duplicate intent/token/upload/complete logic.
- Preview signing exists in both API crypto helpers and game-host helpers; formats
  currently match but should have one shared tested contract.
- Game status enums include transitions/states that are unused or transient.
- Count-based plan limits and active-version checks are not transactional/serialized.
- API direct ZIP upload buffers the full 50-100 MB body; switch to authenticated
  streaming with byte/hash limits before increasing concurrency.

### Weak or missing tests

- No test proves invite-only behavior for first-time Google OAuth.
- No test prevents published metadata/cover moderation bypass.
- No target-role hierarchy tests for ADMIN versus OWNER/ADMIN.
- E2E does not run a real ClamAV daemon; its scanner is explicitly disabled.
- No live S3/MinIO private-policy test, anonymous-access denial test, or published
  object write-once test.
- No SMTP delivery, Google provider, Stripe live/test-clock, DNS/TLS/Caddy, backup
  restore, or alerting test.
- No race tests for plan limits, active versions, checkout customers, or webhook
  ordering.
- Web component coverage is very small relative to the UI surface.
- Cloud-save adapter tests are outside `npm test` and must be invoked separately.

### Risky environment/deployment assumptions

- Production permits scanner disablement and memory email.
- Distinct registrable domains, wildcard DNS/TLS, and bucket existence/privacy are
  documentation-only assumptions.
- Hostinger uses moving `latest` MinIO/mc tags; Caddy and Node base images are not
  digest-pinned; GitHub Actions use movable major tags.
- API readiness omits SMTP/OAuth/Stripe; Sentry/metrics/alerts are absent.
- The storage backup omits user-uploaded avatar and cover objects.

### Dependency findings

`npm audit --omit=dev --audit-level=high` reports one high Nodemailer advisory and
three moderate advisories through Prisma development tooling. VibePlay does not use
Nodemailer's vulnerable `raw` option with user-controlled inputs, reducing direct
exploitability, but the production dependency must still be upgraded/tested before
release. Do not apply `npm audit fix --force` blindly because it proposes breaking
version changes.

## 9. Suggested test plan and observed results

### Commands run

| Command | Result | Detail |
| --- | --- | --- |
| `npm run db:generate` | PASS | Prisma Client 7.8.0 generated. |
| `npm exec --workspace @vibeplay/database -- prisma validate` | PASS | Schema valid. |
| `bash infra/scripts/forbidden-scan.sh` | FAIL | Incorrectly rejects committed `.env.hostinger.example` and `.env.railway.template`; allowlist only recognizes exactly `.env.example`. This also breaks CI security job. |
| `npm run format:check` | FAIL | Eight files fail Prettier: API avatar integration test, FeedbackModal, GameCarousel, GameVersionManager, Admin Dashboard, PublishGame, LandingPage, worker index. |
| `npm run lint` | PASS | No ESLint errors. |
| `npm run typecheck` | PASS | All nine workspaces passed. |
| `npm run test` | PASS | 12 files, 67 unit/component tests passed: shared 32, SDK 6, API 4, worker 10, game-host 8, web 7. |
| `npm run test:integration` | FAIL | Seven suites/85 tests passed and three tests were skipped, but the Redis rate-limit suite fails its setup when no real `REDIS_URL` is available; teardown also dereferences an uninitialized Redis client. |
| `npm run build` | PASS with warning | All packages/apps built. Real web JS was 719.30 kB minified/195.75 kB gzip; Vite warns above 500 kB. |
| `bash infra/scripts/check-real-bundle.sh apps/web/dist` | PASS | No demo accounts/passwords/localStorage demo chunks in the real bundle. |
| `npm run build:demo` | PASS with warning | Demo bundle built; main JS 611.86 kB plus explicit demo/mock chunks. |
| `npm run test:e2e` | FAIL | 14 passed, 13 failed in 1.4 min. Twelve fail at stale upload helper; feedback test uses stale button name. Critical upload/moderation/isolation tests are not currently effective. |
| `node --test docs/fat-dima-cloud-save/vibeplay-save-adapter.test.mjs` | PASS | Seven adapter tests passed. Expected cloud-error fallback logs an error. |
| `npm audit --omit=dev --audit-level=high` | FAIL | 1 high Nodemailer and 3 moderate Prisma-tooling transitive advisories. |
| `docker compose -f <file> config -q` | PASS | Local, production example, Hostinger, Oracle, and Railway files parse with non-secret placeholders. |
| `docker ps` | NOT RUNNABLE | Docker CLI exists, but the Docker daemon socket was unavailable. No container runtime/health or image build was verified locally. |

The E2E stack did successfully apply all 11 migrations to a fresh embedded
PostgreSQL database, which proves clean migration deployment. A separate Prisma
migration drift comparison and a real Redis rate-limit run remain required.

### Required pre-beta test sequence

1. Fix the forbidden-scan allowlist, formatting, E2E helper/selectors, dependency
   advisory, and Redis suite setup/teardown.
2. Run `npm ci`, generate, format, lint, typecheck, unit, integration with real
   Redis, migration deploy+drift, real build+bundle guard, and E2E on a clean CI
   runner.
3. Build every Docker image and boot the canonical staging compose with private
   MinIO/S3 and real ClamAV/SMTP.
4. Run clean/infected/corrupt/traversal/oversize upload tests and verify no object is
   directly public before or after moderation.
5. Run auth matrix: password invite, Google invite, verification, reset, suspended,
   banned, CSRF, foreign origin, session revoke, admin/owner target hierarchy.
6. Run moderation matrix: metadata revision, cover/screenshot revision, preview
   expiry, approve/reject, hide/suspend cache invalidation, self-review rules.
7. Run Stripe test-mode lifecycle: checkout, duplicate delivery, out-of-order
   updates, failed payment, cancel-at-period-end, cancellation, unrelated price,
   portal, replay/reconciliation.
8. Verify wildcard DNS/TLS and response headers on app, API, published game, preview,
   hidden game, bare game host, and unknown host.
9. Perform and record encrypted off-host PostgreSQL plus published/avatar-cover
   object backup and restore drill.
10. Load-test concurrent 100 MB uploads, worker backpressure, storage streaming,
    game serving, Redis failure, and database connection limits before scaling.

### Manual production checks still required

- DNS registrable-domain separation and wildcard resolution.
- Wildcard TLS issuance/renewal and Caddy CSP environment substitution.
- Host-only Secure/SameSite cookies, CORS, CSRF, and proxy `TRUST_PROXY` IP behavior.
- S3/MinIO bucket existence, private ACL/policy, lifecycle, provider versioning, and
  inability to overwrite published keys.
- ClamAV database freshness, readiness, clean/EICAR behavior, and alerting.
- SMTP deliverability, SPF/DKIM/DMARC, verification/reset link origin, bounce/error
  monitoring.
- Google OAuth production consent/redirects and invite enforcement.
- Stripe price/currency, webhook endpoint/secret/retries, portal config, tax/refund
  policy, and entitlement reconciliation.
- Backup cron, encryption keys, off-host copies, restore results, disk capacity, log
  retention, metrics, and incident paging.
- Legal text/contact addresses and GA4 consent/privacy behavior.

## 10. Final verdict

**NOT READY until blockers fixed.**

The codebase contains a credible beta product and several strong security design
choices, especially around archive validation, session/CSRF handling, and
per-version game serving. The current repository does not yet provide one safe,
truthful, reproducibly tested production path. Fix the eight critical blockers,
select and harden one canonical deployment, restore a green critical-path CI suite,
and complete the manual production checklist before issuing external beta invites.
