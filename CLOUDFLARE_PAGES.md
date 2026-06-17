# VibePlay demo → Cloudflare Pages

Deploys the **demo build** (`VITE_APP_MODE=demo`): a static SPA with localStorage
mock data, mock accounts, and **no backend**. Free, no card, no limits.

## Settings (Cloudflare Pages → Create project → Connect to GitHub → `MaksMykolenko/VibePlay`)

| Setting | Value |
|---|---|
| **Production branch** | `main` |
| **Build command** | `npm run build -w @vibeplay/shared -w @vibeplay/sdk && npm run build:demo -w @vibeplay/web` |
| **Build output directory** | `apps/web/dist` |
| **Root directory** | *(leave as repo root)* |

Cloudflare auto-installs dependencies (`npm ci`) before the build command.

### Environment variables (Settings → Environment variables → Production)

| Variable | Value | Why |
|---|---|---|
| `NODE_VERSION` | `22` | repo requires Node `>=22 <23` (Cloudflare defaults lower) |
| `VITE_BASE_PATH` | `/` | serve assets from the domain root (default is `/VibePlay/` for GitHub Pages) |
| `VITE_ENABLE_DEMO_ROLES` | `true` | enables the one-click demo role-switch buttons (player/creator/admin) |

> The build command + `VITE_BASE_PATH` require the latest `vite.config.ts` and the
> two-step build — both are on `main` after you push the changes below.

## Domain

- **Easiest (recommended):** use the free `https://<project>.pages.dev` Cloudflare
  gives you — instant, HTTPS, perfect for a demo.
- **Custom:** if you have a domain on Cloudflare DNS, add a subdomain like
  `demo.yourdomain.com` under Pages → **Custom domains** (free, auto-HTTPS).
  Keep the demo on its own subdomain (not the apex) so it stays separate from the
  real app.

## Post-deploy verification

1. Open the URL — the VibePlay landing page renders (no blank/white screen).
2. Navigate to a deep route and **hard-refresh** (e.g. `…/#/discover`, `…/#/admin`)
   — it still loads. (Demo uses HashRouter, so refresh always works.)
3. **DevTools → Console:** no red errors.
4. **DevTools → Network:** only static assets, Google Fonts and dicebear avatars —
   **no calls to any real API/backend**.
5. **Log in** (mock accounts, password `demo123` or anything):
   `admin@vibeplay.demo`, `creator@vibeplay.demo`, `player@vibeplay.demo`.
   The role-switch buttons should appear (from `VITE_ENABLE_DEMO_ROLES`).
6. Try **register** (creates a demo player), browse games, like/favorite.
7. Backend-only actions (game **build upload**, admin **moderation queue/reports**)
   correctly show *"not available in the demo build"* — that's expected, not a bug.

## Notes from the verification pass

- ✅ `npm run build:demo` builds cleanly (the slow part is the `tsc` typecheck, not bundling).
- ✅ Demo never touches a real API — the demo client + mock data have zero
  `fetch`/`axios`/`VITE_API_URL`; CI even guards against it.
- ✅ Routes survive refresh (HashRouter); no `_redirects` file needed.
- ✅ Asset/base paths fixed (`/assets/…`, was `/VibePlay/assets/…`).
- ✅ Mock accounts + login/register work; creator/admin pages degrade gracefully.
- Large main JS chunk (~600 kB) — fine for a demo; could be code-split later.
