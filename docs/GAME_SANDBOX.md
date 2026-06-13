# Game Sandbox & Origin Isolation

Third-party game code is the most hostile input VibePlay handles. The sandbox
stacks four independent layers; no single layer is trusted alone.

## Layer 1 — separate registrable domain

The game host lives on a different **registrable domain** from the app
(`games.localhost` locally; `games-beta.vibeplayusercontent.example` pattern
in staging/production). Consequences:

- main-app cookies are host-only on the app origin → the game host **never
  receives auth cookies**; nothing to steal, nothing to CSRF;
- site-scoped browser permissions never bleed between platform and games.

## Layer 2 — one origin per published version

Every published version is served from its own origin, one subdomain label
under the base:

```text
{versionId}--{gameId}.games.localhost:8080                       (local)
{versionId}--{gameId}.games-beta.vibeplayusercontent.example     (staging)
{versionId}--preview.<base>                                      (admin preview)
```

- The game-host routes **by Host header** (`parseGameHostName`); the bare
  base host and any unknown host shape serve nothing — there is no shared
  origin from which two games could ever be loaded.
- Browser storage (localStorage, IndexedDB, Cache Storage, Service Workers)
  is origin-scoped ⇒ game A cannot read game B, and version N+1 cannot read
  version N. A Service Worker registered by one version can never control
  another version or game.
- Single-label scheme (`--` separator, cuid ids are dash-free) is deliberate:
  a TLS wildcard `*.games-beta…` and Caddy/site wildcards cover exactly one
  label.
- Why `allow-same-origin` stays in the iframe sandbox: games need their OWN
  storage to save progress. With per-version origins that's safe — proven at
  runtime by `tests/e2e/launch-isolation.spec.ts` (writes a localStorage key
  on game A's origin, asserts it is invisible on game B's origin).

## Layer 3 — iframe sandbox + launch validation

The player mounts:

```html
<iframe
  sandbox="allow-scripts allow-same-origin allow-pointer-lock"
  allow="fullscreen"
  referrerpolicy="no-referrer"
  src="https://{versionId}--{gameId}.{base}/index.html"
/>
```

Deliberately NOT granted: top navigation, popups, forms, downloads, modals,
clipboard, camera/microphone/geolocation/payment/MIDI (also locked by the
game-host `Permissions-Policy` response header). Fullscreen is the single
product-approved capability, granted via `allow="fullscreen"` and mediated by
the SDK (user-gesture initiated).

Before mounting, the web app validates the launch URL with
`isAllowedGameLaunchUrl`: exact scheme+port of the configured base, host
exactly one label under it — never the base itself, never a foreign host.

## Layer 4 — game-host response policy

Every game response carries a strict CSP (see `buildGameCsp`):

- `default-src 'self' data: blob:` — **no external network**: no exfiltration
  of player IPs to third parties, no loading remote scripts, no phoning home;
- `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:` — WebGL/WASM
  engines work, but only from the version's own files;
- `frame-src 'none'`, `form-action 'none'`, `base-uri 'none'`,
  `object-src 'none'`;
- `frame-ancestors <WEB_ORIGIN>` — game pages embed ONLY in VibePlay;
- `cross-origin-resource-policy: cross-origin` (assets readable by the app
  origin), `x-content-type-options: nosniff`, `referrer-policy: no-referrer`;
- published content is immutable ⇒ `cache-control: immutable`.

Reserved paths on every game origin: `/health/*`, `/sdk/*` (cannot be
shadowed by game files).

## Access control

- Published content is served **only** while the DB says the game is
  `PUBLISHED` and the requested version is the current
  `publishedVersionId` (15s cache, invalidated via Redis pub/sub on hide).
- Hidden/suspended games and non-published versions → 404.
- Admin preview (`{versionId}--preview.<base>`) requires a 5-minute HMAC
  token bound to the versionId, embedded as the first path segment so
  relative assets keep working; only `READY_FOR_REVIEW` versions are
  previewable. No cookies are involved.

## SDK (postMessage)

`packages/sdk` — versioned envelope protocol, validated on both sides
(`@vibeplay/shared/sdk-protocol`):

- host (`GameBridge`) accepts messages only from the iframe's own
  `contentWindow` AND the exact expected game origin;
- the game SDK locks the host origin on the first `init` and ignores
  everything else afterwards;
- the game receives only the public player summary (id, username,
  displayName, avatar) — never email, tokens or cookies;
- message types: ready / requestPlayerSummary / playStarted / playEnded /
  requestFullscreen / reportError (size-capped).

## Local development

Browsers resolve every `*.localhost` name (including
`v1--g1.games.localhost`) to `127.0.0.1` — the per-version scheme works in
Chrome/Firefox/Safari with zero DNS configuration, which is exactly how the
Playwright suite exercises it. For non-browser clients:

```bash
curl -H 'Host: v1--g1.games.localhost' http://127.0.0.1:8080/index.html
# or
curl --resolve 'v1--g1.games.localhost:8080:127.0.0.1' http://v1--g1.games.localhost:8080/
```

`lvh.me` / `localtest.me` style public-wildcard domains work as a documented
equivalent if a resolvable name is ever needed (set
`GAME_ORIGIN=http://lvh.me:8080`).
