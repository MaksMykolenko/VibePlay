# Deploy VibePlay on a single Hostinger VPS (KVM-2, Ubuntu 24.04)

Runs the whole stack with Docker Compose on one Hostinger VPS. Everything is
local and Hostinger-only: **Hostinger DNS**, **Caddy + Let's Encrypt** for HTTPS,
and a **local MinIO** for storage. Domain: **vibeplay.games**.

```
https://vibeplay.games          → web SPA  (+ /api proxied to api, same-origin)
https://api.vibeplay.games      → api      (direct API endpoint)
https://*.games.vibeplay.games  → game-host (one isolated origin per game version)
```

**Security model (do not weaken):** auth/session/CSRF cookies are HttpOnly +
Secure + SameSite=Lax and **host-only on vibeplay.games**, so the game subdomains
can never receive them. The SPA calls the API same-origin (`/api`) so the
JS-readable CSRF cookie works. Uploaded games run only on `*.games.vibeplay.games`,
never on the frontend origin. CSRF, origin isolation and ClamAV scanning stay ON.

Files used: `docker-compose.hostinger.yml`, `infra/caddy/hostinger.Caddyfile`,
`.env.hostinger.example`.

---

## 1. DNS — Hostinger DNS Zone Editor

In **hPanel → Domains → vibeplay.games → DNS / Nameservers → DNS Zone Editor**,
make sure the domain uses **Hostinger nameservers** (ns1/ns2.dns-parking.com),
then add these **A records** pointing at your VPS IP `<VPS_IP>`:

| Type | Name (Host) | Points to | TTL |
|---|---|---|---|
| A | `@`        | `<VPS_IP>` | 300 |
| A | `api`      | `<VPS_IP>` | 300 |
| A | `games`    | `<VPS_IP>` | 300 |
| A | `*.games`  | `<VPS_IP>` | 300 |

Notes:
- `@` is the root `vibeplay.games`. `*.games` is a wildcard — Hostinger's Zone
  Editor accepts `*.games` as the Name; it covers every `<x>.games.vibeplay.games`.
- Delete any pre-filled parking/`A @` record that points elsewhere.
- If the VPS has IPv6, add the same four as `AAAA` records too.

Verify propagation before deploying:

```bash
dig +short vibeplay.games api.vibeplay.games games.vibeplay.games anything.games.vibeplay.games
# every line should print <VPS_IP>
```

---

## 2. Install Docker (Ubuntu 24.04)

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker
docker compose version
```

## 3. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH        # 22
sudo ufw allow 80/tcp         # HTTP (Let's Encrypt HTTP-01 + redirect)
sudo ufw allow 443/tcp        # HTTPS
sudo ufw enable
sudo ufw status
```

Postgres/Redis/MinIO/ClamAV have **no published ports** — they're internal to the
Docker network, so only 22/80/443 are open. If your Hostinger plan has a panel
firewall, allow 80 + 443 there as well.

## 4. Clone the repo

```bash
git clone https://github.com/MaksMykolenko/VibePlay.git
cd VibePlay
```

## 5. Create `.env` and generate secrets

```bash
cp .env.hostinger.example .env
```

Generate one value per secret and paste into `.env`:

```bash
for k in SESSION_SECRET PASSWORD_PEPPER PREVIEW_URL_SECRET POSTGRES_PASSWORD \
         S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
  echo "$k=$(openssl rand -base64 48)"
done
```

Then edit `.env`: paste those values and confirm the origins/domains:

```
WEB_ORIGIN=https://vibeplay.games
API_ORIGIN=https://vibeplay.games
PUBLIC_API_ORIGIN=https://api.vibeplay.games
GAME_HOST_BASE_DOMAIN=games.vibeplay.games
ACME_EMAIL=you@vibeplay.games        # real address for Let's Encrypt notices
S3_ENDPOINT=http://minio:9000        # local MinIO (internal)
S3_FORCE_PATH_STYLE=true
```

Leave `EMAIL_DRIVER=memory` unless you have SMTP. **Never commit `.env`** (already
covered by `.gitignore`).

## 6. Launch

```bash
docker compose --env-file .env -f docker-compose.hostinger.yml up -d --build
```

First build compiles the monorepo (a few minutes); ClamAV downloads its virus DB
(`start_period: 240s` — “starting” until then is normal).

```bash
docker compose -f docker-compose.hostinger.yml ps          # all healthy/running
docker compose -f docker-compose.hostinger.yml logs -f caddy   # watch cert issuance
```

Caddy automatically obtains Let's Encrypt certificates for `vibeplay.games`,
`api.vibeplay.games` and `games.vibeplay.games` (HTTP-01). Per-version game
subdomains get their certs on first request via on-demand TLS (see §10).

## 7. Database migrations

The one-shot **migrate** service runs `prisma migrate deploy` automatically before
api/worker/game-host start. To re-run after a `git pull`:

```bash
docker compose --env-file .env -f docker-compose.hostinger.yml run --rm migrate
```

## 8. Create the first admin

Registration is invite-only, so open it briefly, register, promote, re-lock.
(Login and admin actions need only the ADMIN role — not a verified email.)

```bash
# a) open registration temporarily
sed -i 's/^INVITE_ONLY=.*/INVITE_ONLY=false/' .env
docker compose --env-file .env -f docker-compose.hostinger.yml up -d api

# b) register your account in the browser at https://vibeplay.games (any password)

# c) promote it to ADMIN
docker compose --env-file .env -f docker-compose.hostinger.yml run --rm \
  -e DATABASE_URL="postgresql://vibeplay:$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)@postgres:5432/vibeplay" \
  migrate sh -lc 'cd /repo/packages/database && npx tsx src/grant-admin.ts you@vibeplay.games'

# d) re-lock registration
sed -i 's/^INVITE_ONLY=.*/INVITE_ONLY=true/' .env
docker compose --env-file .env -f docker-compose.hostinger.yml up -d api
```

Log in at https://vibeplay.games → admin panel + invite-link generation.

> To test the **creator/upload** flow you need a verified email. With
> `EMAIL_DRIVER=memory` no mail is sent, so either set real SMTP, or mark a test
> account verified once:
> ```bash
> docker compose --env-file .env -f docker-compose.hostinger.yml run --rm \
>   -e DATABASE_URL="postgresql://vibeplay:$(grep '^POSTGRES_PASSWORD=' .env|cut -d= -f2-)@postgres:5432/vibeplay" \
>   migrate sh -lc 'cd /repo/packages/database && npx tsx -e "import{createPrismaClient}from\"./src/index.js\";const db=createPrismaClient({databaseUrl:process.env.DATABASE_URL});await db.user.update({where:{email:\"you@vibeplay.games\"},data:{emailVerifiedAt:new Date()}});console.log(\"verified\");process.exit(0)"'
> ```

---

## 9. Post-deploy verification

**HTTPS + health endpoints**

```bash
curl -fsS https://vibeplay.games/api/health/live      # {"status":"ok"}
curl -fsS https://vibeplay.games/api/health/ready     # {"status":"ok"} (db+storage+redis)
curl -fsS https://api.vibeplay.games/api/health/ready # same, via the direct API host
curl -fsS https://games.vibeplay.games/health/live    # game-host {"status":"ok"}
# TLS cert sanity (issuer should be Let's Encrypt):
echo | openssl s_client -connect vibeplay.games:443 -servername vibeplay.games 2>/dev/null | openssl x509 -noout -issuer -dates
```

**MinIO (buckets created by minio-init)**

```bash
docker compose -f docker-compose.hostinger.yml logs minio-init   # "buckets ready"
```

`/api/health/ready` returning ok already confirms the API can reach MinIO.

**ClamAV**

```bash
docker compose -f docker-compose.hostinger.yml exec clamav clamdcheck.sh   # "... OK"
docker compose -f docker-compose.hostinger.yml logs worker | grep -i scan
```

**Upload pipeline** (as a verified creator): create a game → upload a small ZIP.
The worker scans it (ClamAV), unpacks, and publishes. Watch:

```bash
docker compose -f docker-compose.hostinger.yml logs -f worker
```

**Admin moderation**: in the admin panel, the moderation queue lists the uploaded
version → approve it → the audit log records the action.

**Game launch + isolation**: open the published game. It must load in an iframe
from `https://<versionId>--<gameId>.games.vibeplay.games` — confirm DevTools shows
that game origin, **not** vibeplay.games. First load of a new subdomain pauses ~1s
while Caddy issues its on-demand certificate.

**Quick security spot-checks**
- DevTools → Application → Cookies: `vp_session`/`vp_csrf` are on `vibeplay.games`,
  HttpOnly (session) + Secure, and **absent** on the game subdomain.
- A mutation without the `x-csrf-token` header returns `403 CSRF_FAILED`.

---

## 10. TLS details (and an optional later upgrade)

- `vibeplay.games`, `api.vibeplay.games`, `games.vibeplay.games` → Let's Encrypt
  HTTP-01, issued automatically by Caddy. No DNS API needed.
- `*.games.vibeplay.games` (per-version origins) → **on-demand TLS**: Caddy issues
  a Let's Encrypt cert the first time each game subdomain is requested. An internal
  ask-gate (`:5555`) ensures certs are only ever issued for hostnames ending in
  `.games.vibeplay.games`. This is the default and needs nothing beyond the A records.

> Optional later: a **DNS-01 wildcard** cert for `*.games.vibeplay.games` removes
> the ~1s first-load issuance delay. It requires building a Caddy image with the
> DNS plugin for whatever DNS provider you use and an API token for the zone, then
> swapping `tls { on_demand }` for `tls { dns <provider> <token> }` in
> `infra/caddy/hostinger.Caddyfile`. It is **not required** — on-demand works fully.

## Verification & Recovery Reference

Use these quick commands on the VPS or your local machine to verify the stack and troubleshoot images:

**1. Verify a Docker image tag before deployment:**
To ensure a pinned tag exists on Docker Hub and supports your architecture (e.g., `amd64` or `arm64`):
```bash
docker manifest inspect minio/minio:<TAG>
```

> ⚠️ `docker manifest inspect` only proves the tag **exists** and matches your
> architecture. It does **not** prove the image can read the existing production
> MinIO volume. For MinIO specifically, see **MinIO image policy (do not
> downgrade)** below before changing the pin.

**2. Check the container stack health:**
Verify that all containers are healthy or running on the VPS:
```bash
docker compose --env-file .env -f docker-compose.hostinger.yml ps
```

**3. Check production endpoints:**
Verify the routing and certificate health of core public endpoints:
```bash
# Verify database/redis/storage are healthy via Caddy
curl -i https://vibeplay.games/api/health/ready

# Verify API configuration is accessible
curl -i https://vibeplay.games/api/auth/config

# Verify Game Host is live
curl -i https://games.vibeplay.games/health/live
```

**4. Apply Caddyfile configuration updates:**
If `infra/caddy/hostinger.Caddyfile` is updated, recreate the Caddy container to load the changes:
```bash
docker compose --env-file .env -f docker-compose.hostinger.yml up -d --force-recreate caddy
```

---

## MinIO image policy (do not downgrade)

The MinIO image in `docker-compose.hostinger.yml` is intentionally pinned to
`minio/minio:latest`. This is a deliberate decision driven by a production
incident — **do not "fix" it by re-pinning an older tag.**

- **Do not downgrade MinIO after a production volume has been used by a newer
  MinIO version.** MinIO upgrades the on-disk format (`xl.meta`) of the
  `miniodata` volume. Once a newer release has written that volume, older
  releases can no longer read it.
- **`docker manifest inspect` only proves an image tag exists** (and matches your
  CPU architecture). It does **not** prove that image can read the existing
  production volume. A tag can be perfectly valid on Docker Hub and still be too
  old for your data.
- **If logs show `decodeXLHeaders: Unknown xl header version 3`, the image is too
  old for the existing MinIO volume.** Symptom in production: the MinIO container
  goes unhealthy / crash-loops, and api / worker / game-host fail their
  `minio: condition: service_healthy` dependency, so `https://vibeplay.games`
  stops responding. The error to watch for:
  ```text
  ERROR Unable to initialize backend: decodeXLHeaders: Unknown xl header version 3
  ```
- **Do not delete the MinIO Docker volume to fix this.** The `miniodata` volume
  holds uploaded/published game files; deleting it (e.g. `docker compose down -v`
  or `docker volume rm`) would lose creator content. The fix is to run an image
  new enough to read the volume — not to wipe the volume.
- **Current confirmed-working production image is `minio/minio:latest`,** which on
  the VPS resolved to `RELEASE.2025-09-07T16-13-09Z`. After switching to it, MinIO
  started healthy and all three health checks returned `200`:
  `https://vibeplay.games/api/health/ready`, `https://vibeplay.games/api/auth/config`,
  and `https://games.vibeplay.games/health/live`.
- **Future pinning is allowed only after manual validation on the VPS against the
  existing production volume** — i.e. confirm a candidate tag starts healthy and
  reads `miniodata` on the VPS itself before committing a pinned tag. Until then,
  keep `latest`.

### VPS verification (to be run by the operator on VPS)

> These commands are for the **operator to run on the Hostinger VPS** after the
> repo fix is pushed. The agent that edits this repo has **no VPS access** and must
> not run them. They confirm `origin/main` carries `minio/minio:latest`, drop any
> local emergency edit, pull, rebuild, and re-check production health.

```bash
cd /opt/vibeplay
git fetch origin main
git show origin/main:docker-compose.hostinger.yml | grep -n "minio/minio"
# only after origin/main shows minio/minio:latest:
git restore docker-compose.hostinger.yml
git pull
docker compose --env-file .env -f docker-compose.hostinger.yml up -d --build
docker compose --env-file .env -f docker-compose.hostinger.yml up -d --force-recreate caddy
docker compose --env-file .env -f docker-compose.hostinger.yml ps
docker compose --env-file .env -f docker-compose.hostinger.yml logs --tail=80 minio
curl -i https://vibeplay.games/api/health/ready
curl -i https://vibeplay.games/api/auth/config
curl -i https://games.vibeplay.games/health/live
```

---

## Troubleshooting

- **Cert not issued / SSL errors:** DNS must resolve to the VPS (`dig`), and ports
  80+443 open in UFW (and the Hostinger panel firewall, if any). `docker compose logs caddy`.
- **Game subdomain won't get a cert:** the `:5555` ask-gate only allows
  `*.games.vibeplay.games`; confirm the host matches and `dig` resolves it.
- **api healthy but /ready is 503:** `/ready` checks db+storage+redis — check
  `logs api`, that `minio-init` finished, and DATABASE_URL/REDIS_URL.
- **Login works but mutations 403 CSRF_FAILED:** the SPA must be same-origin with
  the API — keep `VITE_API_URL=/api` and use `https://vibeplay.games` in the browser.
- **Upload rejected/stuck:** creator email must be verified; ClamAV must be healthy
  (`start_period` 240s on first boot); check `logs worker`.
- **ClamAV unhealthy / OOM:** the freshclam DB needs ~1–2 GB RAM; KVM-2 is fine.
- **Reset everything (DESTROYS data):** `docker compose -f docker-compose.hostinger.yml down -v`.

## Do NOT
- disable CSRF, HttpOnly cookies, or origin isolation;
- set a parent-domain cookie (`Domain=.vibeplay.games`) — it would leak auth to games;
- serve uploaded games on `vibeplay.games`;
- expose Postgres/Redis/MinIO/ClamAV ports publicly;
- commit `.env` or any secret.
