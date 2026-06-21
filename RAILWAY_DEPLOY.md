# VibePlay — Railway Deployment Guide

This guide describes the Railway deployment shape. It is **unsupported for
production UGC** until a private ClamAV endpoint and a separate registrable
wildcard game domain with TLS are configured and verified.
All four application services (api, worker, game-host, web) are defined in
`docker-compose.railway.yml` and deploy automatically when you push to GitHub.

---

## Architecture on Railway

```
Internet
  │
  ├─► web (Caddy · port 80 · Railway public URL)
  │     ├─ serves the React SPA from /srv
  │     └─ reverse-proxies /api/* → api:3000  (internal network, no CORS)
  │
  ├─► game-host (port 8080 · wildcard custom domain *.games.YOURDOMAIN.com)
  │     └─ serves per-version game content; each version gets its own subdomain
  │
  └─► worker (BullMQ · no public port · background service)

Railway plugins (managed, outside your compose):
  PostgreSQL plugin → DATABASE_URL
  Redis plugin      → REDIS_URL

External storage (free):
  Cloudflare R2     → S3_* env vars

External security service:
  private clamd     → CLAMAV_HOST / CLAMAV_PORT
```

---

## Prerequisites

- GitHub repository with the VibePlay source
- Railway account (free tier is sufficient for a private beta)
- Cloudflare account (for R2 object storage — free 10 GB)
- A separately registered domain for the wildcard game subdomain (required)
- A clamd service reachable only over the private service network (required)

---

## §1 — Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project**.
2. Choose **Deploy from GitHub repo** → select your VibePlay repository.
3. When asked "Add a service?", click **Add service → GitHub repo** and select the same repo.
   Railway creates one service from the repo — you'll configure the compose file next.
4. In **Project Settings → General**, set the project name (e.g. `vibeplay-beta`).

---

## §2 — Add database plugins

Inside the project, click **+ New** → **Database**:

1. Add **PostgreSQL** — Railway injects `DATABASE_URL` into all services automatically.
2. Add **Redis** — Railway injects `REDIS_URL` into all services automatically.

No further configuration is needed for either plugin.

---

## §3 — Set up Cloudflare R2

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com) → **R2** → **Create bucket**.
2. Create three private buckets:
   - `vibeplay-quarantine` (stores uploaded ZIPs before processing)
   - `vibeplay-published` (stores processed, live game files)
   - `vibeplay-avatars` (stores private avatars and moderated game covers/media)
3. In R2 → **Manage R2 API Tokens** → **Create API Token**.
   - Select **Object Read & Write** permission for both buckets.
   - Save the **Access Key ID** and **Secret Access Key**.
4. Your R2 endpoint is: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   (Find your Account ID in the Cloudflare dashboard URL or the R2 overview page.)

---

## §4 — Configure environment variables

In Railway → your project → **Variables** tab, add every variable from
`.env.railway.template` (skip the `(auto)` ones — Railway sets them for you).

**Generate secrets from your terminal:**

```bash
# SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# PASSWORD_PEPPER
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# PREVIEW_URL_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Minimum required variables before first deploy:**

| Variable | Example value |
|---|---|
| `SESSION_SECRET` | `<64-byte hex>` |
| `PASSWORD_PEPPER` | `<32-byte hex>` |
| `PREVIEW_URL_SECRET` | `<32-byte hex>` |
| `WEB_ORIGIN` | `https://beta.vibeplay.example` |
| `GAME_ORIGIN` | `https://games.vibeplayusercontent.example` |
| `GAME_FRAME_SRC` | `https://*.games.vibeplayusercontent.example` |
| `S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | `<R2 token key ID>` |
| `S3_SECRET_ACCESS_KEY` | `<R2 token secret>` |
| `CLAMAV_HOST` | `<private clamd hostname>` |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_FROM` | `VibePlay <no-reply@yourdomain.com>` |

`GAME_ORIGIN` must not use the shared Railway service URL or a subdomain of the
app's registrable domain. Production startup rejects an unsafe origin pair.

---

## §5 — Configure the compose file in each service

For each service (api, worker, game-host, web, migrate) in Railway:

1. Open the service → **Settings** → **Source**.
2. Set **Docker Compose File** to `docker-compose.railway.yml`.
3. Set **Service Name** to match the service name in the compose file
   (`api`, `worker`, `game-host`, `web`, `migrate`).

Railway will now build and run each service from the compose definition.

---

## §6 — Required wildcard domain for game-host

Without wildcard DNS and TLS, game versions cannot use their required unique
origins. Do not launch UGC or mark this deployment supported without it.

To enable full isolation:

1. Register a separate domain (for example `vibeplayusercontent.com`).
2. In Railway → `game-host` service → **Settings** → **Networking** →
   **Custom Domain** → add `*.games.yourdomain.com`.
3. Railway shows you a CNAME target (e.g. `xxx.railway.app`).
4. In your DNS provider, add:
   ```
   *.games.yourdomain.com  CNAME  xxx.railway.app
   ```
5. Update Railway variables:
   ```
   GAME_ORIGIN=https://games.yourdomain.com
   GAME_FRAME_SRC=https://*.games.yourdomain.com
   ```
6. Redeploy the `web` service (it re-bakes `VITE_GAME_ORIGIN` into the JS bundle).

---

## §7 — First deploy

Once all variables are set:

1. Push to `main` — Railway triggers a build for every service automatically.
2. Watch the **Deploy Logs** for each service.
3. The `migrate` service runs `prisma migrate deploy` and exits (status 0).
4. `api`, `worker`, `game-host`, and `web` start after migration completes.

**Verify the deploy:**

```bash
# Health checks (replace with your Railway URLs)
curl https://vibeplay.up.railway.app/api/health/live    # → {"status":"ok"}
curl https://vibeplay.up.railway.app/api/health/ready   # → {"status":"ok"}
curl https://games.vibeplayusercontent.example/health/live # → {"status":"ok"}
```

---

## §8 — Create the first admin account

The app runs with `INVITE_ONLY=true` by default, so registration is gated.
Create the first account through the normal Argon2id/pepper registration path,
then grant ADMIN through the existing script:

1. Temporarily set `INVITE_ONLY=false`, redeploy API, and register through the UI.
2. In the Railway shell run `npm run grant-admin -- admin@yourdomain.com`.
3. Immediately restore `INVITE_ONLY=true` and redeploy API.
4. Log in and create email-bound, expiring invites from the admin panel.

---

## §9 — Redeploys and updates

Push to `main` → Railway rebuilds all services automatically.

The `migrate` service runs on every deploy, so new Prisma migrations are applied
before the API starts. If a migration fails, Railway stops the deploy and keeps
the previous version running.

---

## Troubleshooting

**`migrate` service keeps restarting**
Railway may retry `migrate` if it exits non-zero. Check the logs — a Prisma
migration error (e.g. conflicting schema) will be shown there. Fix the migration
and push again.

**`web` shows a blank page / API 502**
The Caddy proxy depends on `api:3000` being reachable on the internal network.
Confirm the `api` service is healthy and that `API_INTERNAL_URL=http://api:3000`
is set on the `web` service.

**Game iframes fail to load**
Check that `GAME_FRAME_SRC` matches the actual game-host domain. The value is
baked into the CSP header at container start time — after changing it, restart
the `web` service.

**`service_completed_successfully` not supported**
If Railway does not honour the `depends_on` condition, trigger migrations manually:
```bash
railway run --service migrate npx prisma migrate deploy
```
Then restart api, worker, and game-host.
