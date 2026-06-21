# Deployment (staging / private beta)

Provider-neutral, Docker-based. GitHub Pages hosts ONLY the frontend demo;
the beta runs on its own staging deployment.

## Domain model

```text
beta.vibeplay.example                       → web SPA + /api (same origin)
api.beta.vibeplay.example                   → optional split API origin
*.games-beta.vibeplayusercontent.example    → per-version game origins
```

Rules:

- the game domain is a **different registrable domain** from the app domain
  (cookie + permission isolation — see `GAME_SANDBOX.md`);
- per-version origins are ONE label under the game base
  (`{versionId}--{gameId}.games-beta…`), so a single wildcard certificate
  `*.games-beta.vibeplayusercontent.example` covers all of them;
- wildcard certificates require a **DNS-01** ACME challenge: use a Caddy
  build with your DNS provider module (`caddy-dns/*`), or terminate TLS at a
  load balancer that supports wildcards.

## Files

- `docker-compose.production.example.yml` — full staging stack (copy, point
  an untracked `.env.production` at it, never commit real secrets);
- `infra/caddy/staging.Caddyfile` — TLS termination, HSTS, app + wildcard
  game-host sites;
- application security headers ship from the services themselves
  (`infra/caddy/web.Caddyfile` for the SPA; the API and game-host set their
  own headers in code).

## Bring-up

```bash
# on the staging host
git clone … && cd VibePlay
cp .env.example .env.production            # fill ALL values with real secrets
docker compose --env-file .env.production -f docker-compose.production.example.yml up -d --build
docker compose -f docker-compose.production.example.yml ps   # all healthy
curl -fsS https://beta.vibeplay.example/api/health/ready
```

DNS records: `A/AAAA beta.vibeplay.example`, `A/AAAA
games-beta.vibeplayusercontent.example`, `A/AAAA
*.games-beta.vibeplayusercontent.example` → staging host / LB.

## Verification checklist (run after every deploy)

| Check | How |
| --- | --- |
| HTTPS + HSTS | `curl -sI https://beta… \| grep -i strict-transport` |
| wildcard TLS | `openssl s_client -connect any--label.games-beta…:443` |
| Secure, host-only cookies | login, inspect `Set-Cookie` (HttpOnly; Secure; SameSite=Lax; no Domain=) |
| CORS allowlist | request `/api` with a foreign Origin → no ACAO header |
| CSRF | authenticated mutation without `x-csrf-token` → 403 |
| CSP main app | `curl -sI https://beta…/ \| grep -i content-security` (frame-ancestors 'none', frame-src wildcard game base) |
| CSP game host | `curl -sI https://v--g.games-beta…/index.html` (no external connect-src, frame-ancestors app origin) |
| upload limits | intent with oversize fileSize → 413 |
| persistent volumes | `docker volume ls` (pgdata, redisdata, miniodata) survive `compose down && up` |
| health checks | `/api/health/live`, `/api/health/ready`, game-host `/health/ready`, worker `:3002/health/ready` |
| backups | cron installed per `BACKUP_AND_RESTORE.md`; restore drill recorded |

## Secrets

Inject via `.env.production` (chmod 600, untracked) or the host's secret
manager. Required: `SESSION_SECRET`, `PASSWORD_PEPPER`, `PREVIEW_URL_SECRET`,
`POSTGRES_PASSWORD`, S3 credentials, SMTP credentials, `ACME_EMAIL`.
Rotate `SESSION_SECRET` only with a maintenance window (it invalidates all
sessions and hashed tokens).

## Updating

```bash
git pull
docker compose --env-file .env.production -f docker-compose.production.example.yml build
docker compose --env-file .env.production -f docker-compose.production.example.yml up -d
# migrations run via the migrate one-shot service before api/worker start
```

Rollback: `git checkout <previous tag>` and re-run the same two commands;
database migrations are forward-only — restore from backup for schema
rollbacks (`BACKUP_AND_RESTORE.md`).

## Observability

Structured JSON logs (service field, request ids, user ids, no secrets) go
to stdout → `docker logs` / your log shipper. Sentry is not integrated; do not
set a DSN and assume capture is active. Alerting/log shipping remains an
operator responsibility for beta.
