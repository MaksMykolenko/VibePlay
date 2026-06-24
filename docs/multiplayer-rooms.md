# Multiplayer Rooms

VibePlay owns multiplayer **rooms**: creation, the short join code, the invite
link, lobby state, player identity (logged-in user **or** guest), the host/player
role, and a short-lived **signed room token**. A game's realtime simulation —
movement, shooting, bots, power-ups, score, snapshots, match finish — runs on the
game's **own external server** (e.g. the Boxy Tanks WebSocket server), keyed by
the VibePlay room code and trusting only the signed token.

Auth never enters the game iframe. The game receives room context exclusively
over the VibePlay SDK `postMessage` bridge; every privileged call (creating a
room, joining, minting a token) happens in the VibePlay parent/API.

## What owns what

| VibePlay (this repo)                            | The game (e.g. Boxy Tanks)                    |
| ----------------------------------------------- | --------------------------------------------- |
| Room lifecycle (WAITING → ACTIVE → FINISHED/EXPIRED) | Realtime WebSocket simulation            |
| Room code + invite link + lobby UI              | Movement / shooting / bots / power-ups        |
| Player identity (user or guest) + host role     | Score / snapshots / match finish              |
| Signed, short-lived room token                  | Authoritative game state (never trusts client)|
| Game multiplayer metadata + URL validation      | Its own deployment + scaling                  |

## Architecture

```
            ┌──────────────────────────── VibePlay ────────────────────────────┐
            │                                                                    │
  Browser   │   React web app (parent)                 Fastify API + Postgres    │
  ┌──────┐  │   ┌───────────────────┐   POST /rooms…   ┌──────────────────────┐  │
  │ User │──┼──▶│ Game page / Lobby │ ───────────────▶ │ rooms routes         │  │
  │ or   │  │   │  /rooms/:code     │ ◀─────────────── │  guest cookie + token │  │
  │ Guest│  │   └─────────┬─────────┘   room + token   │  GameRoom/Player rows │  │
  └──────┘  │             │ builds RoomContext         └──────────────────────┘  │
            │             │ (incl. signed token)                                  │
            │             ▼ postMessage (SDK bridge, no cookies/secrets)          │
            │   ┌───────────────────────────┐                                     │
            │   │ Game iframe (sandboxed)    │  VibePlay.rooms.getContext()        │
            │   │  vibeplay-sdk.js           │  → { roomCode, token, wsUrl, … }    │
            │   └─────────────┬─────────────┘                                     │
            └─────────────────┼──────────────────────────────────────────────────┘
                              │ WebSocket: { type:"joinPlatformRoom", roomCode, token }
                              ▼
                   ┌─────────────────────────────┐   verifies token with the SAME
                   │ Game's external WS server    │   secret (VIBEPLAY_ROOM_TOKEN_SECRET
                   │ (Boxy Tanks) — authoritative │   ⇄ MULTIPLAYER_ROOM_TOKEN_SECRET)
                   └─────────────────────────────┘
```

The game server is deployed and scaled **separately** from VibePlay. VibePlay
never proxies game traffic and never exposes object storage (MinIO) to anyone.

## Data model

Prisma models (see `packages/database/prisma/schema.prisma`, migration
`20260624000000_multiplayer_rooms`):

- **`Guest`** — anonymous, cookie-scoped identity. Only the **HMAC hash** of the
  guest cookie token is stored (mirrors `Session`); the raw token lives only in
  the `vp_guest` httpOnly cookie. Lets a guest create, host and rejoin rooms
  without an account. Holds no PII beyond an optional chosen display name.
- **`GameRoom`** — `id`, `gameId`, `versionId?`, unique `roomCode`,
  `status` (WAITING/ACTIVE/FINISHED/EXPIRED), `visibility` (PRIVATE/PUBLIC),
  `hostUserId?`/`hostGuestId?`, `maxPlayers` (default 8), `playerCount`,
  `mode` (default `free_for_all`), `transport` (default `external_ws`),
  `wsUrl?`, `expiresAt`, timestamps. Cascades from `Game`.
- **`GameRoomPlayer`** — `id`, `roomId`, `userId?`/`guestId?`, `displayName`,
  `avatarUrl?`, `isHost`, `status` (JOINED/LEFT/KICKED), `joinedAt`, `leftAt?`.
  Unique per `(roomId, userId)` and `(roomId, guestId)` (Postgres treats NULLs as
  distinct) so a member holds at most one row per room — rejoin updates the row.
- **`Game`** multiplayer metadata — `multiplayerEnabled`, `multiplayerMaxPlayers`,
  `multiplayerTransport` (NONE/EXTERNAL_WS/VIBEPLAY_SDK), `multiplayerWsUrl?`,
  `multiplayerModes` (JSON). The pre-existing `multiplayer` boolean stays as the
  catalog/browse flag and is kept in sync with `multiplayerEnabled`.

## API

All routes are under `/api`. Mutations by logged-in users carry the usual
double-submit CSRF; guest mutations carry no ambient authority (the `vp_guest`
cookie is `SameSite=Lax`, so it is not sent on cross-site POSTs).

| Method & path                       | Auth        | Purpose |
| ----------------------------------- | ----------- | ------- |
| `POST /api/games/:gameId/rooms`     | user/guest  | Create a room for a published, multiplayer-enabled game. Generates the code, creates the host player, caps `maxPlayers` at the game's declared max and a global cap (16), sets `expiresAt = now + 2h`. Returns `roomCode`, `roomId`, `inviteUrl`, `playerId`, `isHost`, `room`. Rate-limited (`roomCreate`). |
| `GET /api/rooms/:roomCode`          | public      | Public room info: code, game, status, players (no user/guest ids), `maxPlayers`, `playerCount`, host, `canJoin`. Lazily marks past-expiry rooms EXPIRED. |
| `POST /api/rooms/:roomCode/join`    | user/guest  | Join (or rejoin). Rejects full / expired / finished rooms. Returns `playerId`, `isHost`, `room`. Rate-limited (`roomJoin`). |
| `POST /api/rooms/:roomCode/leave`   | member      | Mark the caller LEFT. If the host leaves, transfer host to the next-joined player; if the room becomes empty, mark it EXPIRED. |
| `POST /api/rooms/:roomCode/start`   | host only   | Set status ACTIVE. Returns `playUrl` = `/play/:slug?room=CODE`. |
| `POST /api/rooms/:roomCode/token`   | member      | Mint a fresh, short-lived **signed room token** for the caller. Returns `token`, `expiresAt`, `wsUrl`, `transport`. Rate-limited (`roomToken`). Token values are never logged. |

Rate-limit policies live in `apps/api/src/lib/rateLimit.ts`
(`roomCreate` 20/h, `roomJoin` 40/5m, `roomToken` 60/5m), keyed per user id or per
IP, Redis-backed in production.

## Guest identity

`apps/api/src/lib/guests.ts`. On a guest's first room action the API issues a
high-entropy opaque token in a `vp_guest` cookie (httpOnly, `SameSite=Lax`,
`Secure` in production, 30-day rolling expiry) and stores a `Guest` row holding
only the token's HMAC hash. Subsequent actions resolve the guest from the cookie.
Logged-in users never receive a guest identity. A guest can only ever act as a
room player/host — never as a VibePlay user.

## Room token

`apps/api/src/lib/roomToken.ts`. A compact HS256 JWS
(`base64url(header).base64url(payload).base64url(HMAC-SHA256)`) so any standard
JWT library on the game-server side can verify it.

Claims:

```jsonc
{
  "roomId":      "…",        // VibePlay room id
  "roomCode":    "ABC123",   // also the realtime server's room key
  "gameId":      "…",
  "versionId":   "…" | null, // published version the room is pinned to
  "playerId":    "…",        // GameRoomPlayer id (identity within THIS room)
  "userId":      "…" | null, // exactly one of userId / guestId is set
  "guestId":     "…" | null,
  "displayName": "Maks",     // public name only — never an email/private field
  "isHost":      true,
  "transport":   "external_ws",
  "iat":         1700000000, // epoch seconds
  "exp":         1700000120  // epoch seconds (default TTL: 120s)
}
```

Signed with **`MULTIPLAYER_ROOM_TOKEN_SECRET`**. The game server verifies with the
matching **`VIBEPLAY_ROOM_TOKEN_SECRET`**. Tokens are short-lived (they only need
to survive the WebSocket handshake) and are re-minted on demand via the SDK. The
game cannot choose its own identity / host flag / score: those are signed claims.

## SDK room context

The SDK adds a `rooms` namespace (`packages/sdk`). The game side
(`window.VibePlay.rooms`):

```js
// In the game, running inside the VibePlay iframe:
if (VibePlay.rooms.isAvailable()) {
  const ctx = await VibePlay.rooms.getContext();
  // ctx = { roomId, roomCode, gameId, versionId, playerId, playerName,
  //         playerAvatarUrl, isHost, maxPlayers, mode, transport, wsUrl, token, expiresAt }
  connectToRealtimeServer(ctx.wsUrl, { type: 'joinPlatformRoom', roomCode: ctx.roomCode, token: ctx.token });
}

VibePlay.rooms.onContext((ctx) => { /* re-render lobby / reconnect */ });
const fresh = await VibePlay.rooms.getToken();   // refresh before the old token expires
VibePlay.rooms.leave();                          // ask the parent to leave the room
```

The host side (`GameBridge`, used by the Play Page) accepts `roomContext` and a
`roomTokenProvider`, pushes context to the game on handshake, answers
`requestRoomContext`/`requestRoomToken`, and surfaces `onRoomLeaveRequest`. The
new protocol message types (`roomContext`, `roomTokenResult`,
`requestRoomContext`, `requestRoomToken`, `roomLeave`) are validated on both sides
in `packages/shared/src/sdkProtocol.ts`. Protocol version stays **1** — the
additions are new message *types*, so existing v1 games keep working unchanged.

### Play Page flow (parent)

When `/play/:slug?room=CODE` opens, the parent: (1) loads room info, (2) confirms
the current user/guest is a member, (3) `POST /api/rooms/:code/token`, (4) builds
the `RoomContextDto`, (5) constructs `GameBridge` with that `roomContext` and a
`roomTokenProvider` that re-mints tokens. The game iframe never makes these calls
itself. *(The parent Play-Page wiring + lobby UI ship in the Web UI phase; the
SDK/API contract they consume is implemented and tested here.)*

## Game metadata & validation

Creators enable multiplayer per game (`PATCH /api/creator/games/:id`):
`multiplayerEnabled`, `multiplayerMaxPlayers`, `multiplayerTransport`,
`multiplayerWsUrl`, `multiplayerModes`. `validateMultiplayerWsUrl`
(`packages/shared/src/rooms.ts`) enforces: a `ws://`/`wss://` URL with a host and
no embedded credentials; in **production** it must be `wss://` and must not target
localhost / loopback / private ranges. Invalid URLs are rejected (422) — they are
never persisted or approved. The stored `wsUrl` is exposed only to the
owner/admin, never to other players.

## Deployment notes

- Set **`MULTIPLAYER_ROOM_TOKEN_SECRET`** (≥32 chars, e.g. `openssl rand -base64 48`)
  in the API environment. It must equal the game server's
  `VIBEPLAY_ROOM_TOKEN_SECRET`. Rotate by deploying both sides with the new value.
- The external realtime server (Boxy Tanks) is deployed and scaled **separately**.
  VibePlay only stores its `wss://` URL and hands it to the game via room context.
- No new infrastructure is required on the VibePlay side beyond the migration and
  the env var. Redis (already required) backs the new rate limits.

## Security notes

- **Server stays authoritative.** The game's realtime server owns score/HP/
  position; clients never send trusted state. Platform-room mode forbids
  client-chosen score/name/host (those come from the signed token).
- **Secrets** are never exposed: the room-token secret stays server-side, the API
  logger redacts `*.token`, and the iframe receives **no** auth cookies — only the
  scoped room token.
- **Room tokens are short-lived** (default 120s) and must **not** be stored in
  `localStorage`; keep them in memory and re-mint via `rooms.getToken()`.
- **Guest identity is scoped safely**: hash-at-rest, httpOnly + `SameSite=Lax`,
  player-only authority.
- **External WS URLs are validated** and **production origins are restricted**
  (`wss://`, no private hosts).
- **MinIO is never exposed** — rooms touch object storage not at all.
