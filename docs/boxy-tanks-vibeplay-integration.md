# Boxy Tanks ⇄ VibePlay Integration

This document specifies how **Boxy Tanks Arena** becomes a VibePlay multiplayer
showcase game. It is the implementation guide + ready-to-apply reference code for
**Phase 6** (Boxy client adapter) and **Phase 7** (Boxy server support), which
live in the **separate Boxy Tanks repository**. The VibePlay side (rooms DB/API,
room token, SDK room context, game metadata) is already implemented — see
[`docs/multiplayer-rooms.md`](./multiplayer-rooms.md).

Boxy Tanks keeps everything it already owns — realtime WebSocket simulation,
movement, shooting, bots, power-ups, score, snapshots, match finish — and **stays
server-authoritative**. VibePlay only supplies room context (room code, signed
token, ws url, player identity).

## Two modes

| Mode                 | When                                              | Behaviour |
| -------------------- | ------------------------------------------------- | --------- |
| **Standalone**       | Boxy opened directly (not inside VibePlay)        | Existing menu + create/join/quickplay protocol work unchanged. |
| **VibePlay embedded**| Boxy iframe receives a VibePlay SDK room context  | Hide the standalone Create/Join menu; use `roomContext.roomCode` + `roomContext.token` + `roomContext.wsUrl`; connect with `joinPlatformRoom`. |

Mode is detected at runtime from the presence of a VibePlay room context. If Boxy
is embedded but no context arrives, show: **"Create or join a room from VibePlay."**

---

## Phase 6 — Boxy Tanks client adapter

### 1. Load the VibePlay SDK

Add the SDK script to the game's `index.html` (served from the game build that
VibePlay hosts). It exposes `window.VibePlay`:

```html
<script src="https://<vibeplay-host>/vibeplay-sdk.js"></script>
```

If Boxy bundles instead, `import { initVibePlaySdk } from '@vibeplay/sdk'` and call
`initVibePlaySdk()` once at boot. (The IIFE script auto-inits when embedded.)

### 2. Room-context adapter

Create `client/src/platform/vibeplayRoom.ts`:

```ts
// Minimal shape of the VibePlay SDK room context (see VibePlay RoomContextPayload).
export interface VibePlayRoomContext {
  roomId: string;
  roomCode: string;
  gameId: string;
  versionId: string | null;
  playerId: string;
  playerName: string;
  playerAvatarUrl: string | null;
  isHost: boolean;
  maxPlayers: number;
  mode: string;
  transport: string;
  wsUrl: string | null;
  token: string;
  expiresAt: string;
}

interface VibePlayRoomsApi {
  isAvailable(): boolean;
  getContext(): Promise<VibePlayRoomContext | null>;
  onContext(cb: (ctx: VibePlayRoomContext | null) => void): () => void;
  getToken(): Promise<{ token: string; expiresAt: string; wsUrl: string | null; transport: string } | null>;
  leave(): void;
}

function sdk(): { rooms?: VibePlayRoomsApi } | undefined {
  return (window as unknown as { VibePlay?: { rooms?: VibePlayRoomsApi } }).VibePlay;
}

/** True when running inside VibePlay AND a room context is available. */
export function isVibePlayEmbedded(): boolean {
  return Boolean(sdk()?.rooms?.isAvailable());
}

/** Resolve the current room context (null when not in a VibePlay room). */
export async function getVibePlayRoom(): Promise<VibePlayRoomContext | null> {
  const rooms = sdk()?.rooms;
  if (!rooms) return null;
  return rooms.getContext();
}

/** Mint a fresh, short-lived room token (the parent owns the session). */
export async function refreshVibePlayToken(): Promise<string | null> {
  const res = await sdk()?.rooms?.getToken();
  return res?.token ?? null;
}
```

### 3. Detect embedded mode and route the menu

In the client bootstrap (where the main menu mounts), before showing the
standalone Create Room / Join Room menu:

```ts
import { isVibePlayEmbedded, getVibePlayRoom } from './platform/vibeplayRoom';
import { connectPlatformRoom } from './net/connection';

async function boot() {
  // Detect embed even if the SDK is mid-handshake: also subscribe to onContext.
  const ctx = await getVibePlayRoom();
  const embedded = window.parent !== window; // inside an iframe at all

  if (ctx) {
    hideStandaloneMenu();                 // hide Create Room / Join Room
    showPlayerIdentity(ctx.playerName, ctx.playerAvatarUrl);
    connectPlatformRoom(ctx);             // see step 4
    return;
  }

  if (embedded && isVibePlayEmbedded() === false) {
    // Embedded but no room context arrived.
    showMessage('Create or join a room from VibePlay.');
    return;
  }

  showStandaloneMenu();                   // unchanged standalone flow
}
```

`onContext` may also be used to react to late context / token refreshes:

```ts
sdk()?.rooms?.onContext((ctx) => { if (ctx) connectPlatformRoom(ctx); });
```

### 4. Connect with `joinPlatformRoom`

Use `roomContext.wsUrl` (fall back to `VITE_WS_URL` only in standalone). The
**first** message after the socket opens is the platform-room join:

```ts
export function connectPlatformRoom(ctx: VibePlayRoomContext) {
  const url = ctx.wsUrl ?? import.meta.env.VITE_WS_URL;
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'joinPlatformRoom', roomCode: ctx.roomCode, token: ctx.token }));
  });
  // ...wire existing snapshot/input handlers; the server assigns identity from the token.
}
```

The client never sends a chosen display name, score, HP, position, or host flag in
platform-room mode — the server derives identity from the verified token and stays
authoritative for all game state.

---

## Phase 7 — Boxy Tanks server support

### 1. Token verifier (zero-dependency)

Create `server/src/platform/vibeplayToken.ts`. It verifies the same HS256 JWS that
VibePlay mints (see `apps/api/src/lib/roomToken.ts`). Any JWT library also works
(it is standard HS256 with numeric `exp`); this version has no dependencies:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VibePlayRoomClaims {
  roomId: string; roomCode: string; gameId: string; versionId: string | null;
  playerId: string; userId: string | null; guestId: string | null;
  displayName: string; isHost: boolean; transport: string; iat: number; exp: number;
}

const HEADER_B64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export type VerifyResult =
  | { ok: true; claims: VibePlayRoomClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'invalid_claims' };

export function verifyVibePlayToken(
  token: string,
  secret: string,
  opts: { expectedGameId?: string; nowMs?: number; clockSkewSeconds?: number } = {},
): VerifyResult {
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const skew = opts.clockSkewSeconds ?? 5;
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [h, p, sig] = parts;
  if (h !== HEADER_B64) return { ok: false, reason: 'malformed' };

  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };

  let claims: VibePlayRoomClaims;
  try { claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); }
  catch { return { ok: false, reason: 'malformed' }; }

  if (typeof claims.exp !== 'number' || typeof claims.roomCode !== 'string' || typeof claims.gameId !== 'string') {
    return { ok: false, reason: 'invalid_claims' };
  }
  if (claims.exp + skew < nowSec) return { ok: false, reason: 'expired' };
  if (opts.expectedGameId && claims.gameId !== opts.expectedGameId) {
    return { ok: false, reason: 'invalid_claims' };
  }
  return { ok: true, claims };
}
```

### 2. `joinPlatformRoom` message handler

Add a new WS message alongside the existing `createRoom` / `joinRoom` /
`quickPlay` handlers. **Do not** remove or change the standalone handlers.

```ts
import { verifyVibePlayToken } from './platform/vibeplayToken';

const ROOM_TOKEN_SECRET = process.env.VIBEPLAY_ROOM_TOKEN_SECRET!;
const EXPECTED_GAME_ID = process.env.VIBEPLAY_GAME_ID; // optional pin

function handleMessage(ws: GameSocket, raw: string) {
  const msg = JSON.parse(raw);
  switch (msg.type) {
    case 'joinPlatformRoom': return handleJoinPlatformRoom(ws, msg);
    case 'createRoom':       return handleCreateRoom(ws, msg);      // unchanged
    case 'joinRoom':         return handleJoinRoom(ws, msg);        // unchanged
    case 'quickPlay':        return handleQuickPlay(ws, msg);       // unchanged
    // ...existing input/snapshot messages unchanged
  }
}

function handleJoinPlatformRoom(ws: GameSocket, msg: { roomCode?: unknown; token?: unknown }) {
  if (typeof msg.token !== 'string' || typeof msg.roomCode !== 'string') {
    return ws.send(JSON.stringify({ type: 'error', code: 'missing_token' }));
  }
  const result = verifyVibePlayToken(msg.token, ROOM_TOKEN_SECRET, { expectedGameId: EXPECTED_GAME_ID });
  if (!result.ok) {
    return ws.send(JSON.stringify({ type: 'error', code: `token_${result.reason}` }));
  }
  const c = result.claims;
  if (c.roomCode !== msg.roomCode) {
    return ws.send(JSON.stringify({ type: 'error', code: 'room_code_mismatch' }));
  }

  // Use the VibePlay roomCode as the server room key; create it if absent.
  const room = rooms.get(c.roomCode) ?? rooms.create(c.roomCode, {
    platform: true,
    status: 'ACTIVE', // or WAITING — derive from context if you add it to the token
    maxPlayers: 8,
  });

  // Identity comes from the TOKEN — never from the client.
  room.addPlayer({
    connection: ws,
    playerId: c.playerId,         // stable identity within the room
    name: c.displayName,          // trusted display name
    isHost: c.isHost,             // trusted host flag
    // score/HP/position are server-owned and start from the server's defaults
  });
  ws.platformPlayerId = c.playerId;
  ws.send(JSON.stringify({ type: 'platformRoomJoined', roomCode: c.roomCode, playerId: c.playerId }));
}
```

Rules enforced server-side in platform-room mode:

- reject missing / invalid / expired / wrong-`gameId` tokens;
- the VibePlay `roomCode` is the server room key; create the server room on first
  join if it does not exist;
- player identity (`playerId`, `displayName`, `isHost`) comes from the token;
- the client may **not** choose arbitrary score / HP / position / name / host;
- the existing standalone create/join/quickplay protocol keeps working.

### 3. Environment variables (Boxy server)

| Var                          | Required | Purpose |
| ---------------------------- | -------- | ------- |
| `VIBEPLAY_ROOM_TOKEN_SECRET` | yes      | Must equal VibePlay's `MULTIPLAYER_ROOM_TOKEN_SECRET`. Verifies room tokens. |
| `VIBEPLAY_GAME_ID`           | optional | When set, reject tokens minted for a different game. |
| `VIBEPLAY_ALLOWED_ORIGIN`    | recommended | Restrict WS upgrade `Origin` to the VibePlay game-host origin in production. |
| `VIBEPLAY_PLATFORM_MODE`     | optional | `"required"` to disable the standalone menu in the hosted build, `"optional"` (default) to keep both. |

Never commit these. The token secret is the trust anchor between the two systems.

---

## Phase 8 — Boxy tests

Add server tests (mirroring the existing WS test setup):

```ts
import { verifyVibePlayToken } from '../src/platform/vibeplayToken';
// helper to mint a token in tests (same algorithm as VibePlay):
import { createHmac } from 'node:crypto';
function sign(claims, secret, ttl = 120, now = Date.now()) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(now / 1000);
  const p = Buffer.from(JSON.stringify({ ...claims, iat, exp: iat + ttl })).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

it('rejects joinPlatformRoom with a missing token');         // → error missing_token
it('rejects an expired token', () => {
  const t = sign(baseClaims, SECRET, 120, Date.now() - 1000_000);
  expect(verifyVibePlayToken(t, SECRET).ok).toBe(false);
});
it('rejects a wrong gameId', () => {
  const t = sign({ ...baseClaims, gameId: 'other' }, SECRET);
  expect(verifyVibePlayToken(t, SECRET, { expectedGameId: 'boxy' }).ok).toBe(false);
});
it('accepts a valid token', () => {
  const t = sign(baseClaims, SECRET);
  expect(verifyVibePlayToken(t, SECRET).ok).toBe(true);
});
it('creates a server room keyed by the VibePlay roomCode on first join');
it('preserves standalone create/join/quickplay');
```

Run for Boxy Tanks: `npm run typecheck`, `npm run build`, `npm test`.

---

## Deployment notes

- Deploy and scale the Boxy server **separately** from VibePlay. Put it behind TLS
  so its public URL is `wss://…` (required by VibePlay's URL validation in prod).
- Set `VIBEPLAY_ROOM_TOKEN_SECRET` equal to VibePlay's
  `MULTIPLAYER_ROOM_TOKEN_SECRET`. Rotate both sides together.
- In the VibePlay creator/admin UI, enable multiplayer for the Boxy game, set
  transport `EXTERNAL_WS`, and set the WS URL to the Boxy server's `wss://` URL.
- Keep `/health`, `VITE_WS_URL` / `VITE_API_URL`, Docker, and the standalone flow
  intact — embedded mode is purely additive.

## Security notes

- The server stays authoritative; clients never send trusted score/HP/position.
- Verify the token on **every** `joinPlatformRoom`; reject on any failure.
- Restrict the WS `Origin` to `VIBEPLAY_ALLOWED_ORIGIN` in production.
- Tokens are short-lived; the client refreshes via `VibePlay.rooms.getToken()` and
  must not persist them in `localStorage`.
- The Boxy server needs only the shared token secret — it never calls VibePlay
  auth APIs and never receives VibePlay cookies.
