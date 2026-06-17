# VibePlay — free deploy on an Oracle Cloud Always Free VM

Runs the **whole app** (Postgres, Redis, MinIO/S3, mail, api, worker, game-host,
web) on one always-free VM with `docker compose`. No per-service limits, free
forever. Plain HTTP via the VM's IP (no domain needed); the game host uses
[sslip.io](https://sslip.io) for free wildcard subdomains.

> **Honest heads-up:** "free" still means a card at Oracle signup (identity only,
> no charge for Always Free), creating a VM, and opening a few firewall ports.
> The scripts below do everything inside the VM in two commands.

---

## 0. Push these deploy files to GitHub (once, from your Mac)

```bash
cd ~/MyProjects/VibePlay
git add docker-compose.oracle.yml deploy-oracle.sh admin-bootstrap.sh ORACLE_DEPLOY.md
git commit -m "Add Oracle/VM self-host deploy"
git push origin main
```

## 1. Create the VM (Oracle Cloud Console)

1. Sign up at <https://www.oracle.com/cloud/free/> (card required for identity; Always Free is not charged).
2. **Create Instance** → Image: **Ubuntu 22.04** → Shape: **Ampere A1 (Arm)**,
   e.g. 2 OCPU / 12 GB (up to 4 OCPU / 24 GB is free). Add/download your SSH key.
   - If you see *"Out of capacity"*, try another Availability Domain or region, or retry later — common with free Arm.
3. **Networking → Virtual Cloud Network → Security List → Add Ingress Rules**
   (Source `0.0.0.0/0`, TCP) for ports **80**, **8080**, **9000**.

## 2. Deploy (on the VM)

SSH in (`ssh ubuntu@<VM_PUBLIC_IP>`), then:

```bash
git clone https://github.com/MaksMykolenko/VibePlay.git
cd VibePlay
./deploy-oracle.sh
```

This installs Docker, generates `.env` (random secrets + your IP-based origins),
opens the in-VM firewall, and builds + starts the stack. First build takes a few
minutes (it compiles the monorepo).

## 3. Create your admin login

```bash
./admin-bootstrap.sh 'YourStrongPassw0rd!'
```

Then open **http://<VM_PUBLIC_IP>.sslip.io** and log in as
`admin@vibeplay.local` with the password you chose. Generate invite links from
the admin panel for everyone else (registration is invite-only).

---

## What you get

| URL | What |
|---|---|
| `http://<IP>.sslip.io` | The app (SPA + `/api`) |
| `http://games.<IP>.sslip.io:8080` | Game host (per-version subdomains) |
| `http://<IP>:9000` | MinIO S3 (browser upload target) |

## Useful commands (on the VM, from the repo root)

```bash
docker compose -f docker-compose.oracle.yml ps          # status
docker compose -f docker-compose.oracle.yml logs -f api  # logs for one service
docker compose -f docker-compose.oracle.yml --env-file .env up -d --build   # redeploy after `git pull`
docker compose -f docker-compose.oracle.yml down          # stop (data is kept in volumes)
```

## Notes & limits

- **HTTP only.** Cookies run non-secure (`NODE_ENV=development`) because there's
  no TLS. Fine for a private beta. For HTTPS, point a real domain at the VM and
  switch the `NODE_ENV` values in `docker-compose.oracle.yml` to `production`
  (Caddy can then auto-issue certificates).
- **No malware scanning.** `SCAN_DRIVER=none` (ClamAV has no Arm image). Add a
  ClamAV sidecar before opening uploads to the public.
- **Can't reach the ports?** Check both layers: the Oracle **Security List**
  ingress rules *and* the in-VM firewall (the script handles `iptables`; if your
  image uses `ufw`, run `sudo ufw allow 80,8080,9000/tcp`).
- **Data** lives in Docker volumes (`pgdata`, `redisdata`, `miniodata`) and
  survives restarts.
