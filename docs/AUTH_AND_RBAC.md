# Authentication & RBAC

## Sessions

- Opaque 256-bit tokens in an **HttpOnly, SameSite=Lax, host-only** cookie
  (`vp_session`); `Secure` in production / https origins. No JWTs.
- The server stores only `sha256(token, SESSION_SECRET)` plus a hashed IP and
  truncated user agent; sessions expire (default 14 days) and can be revoked
  individually or all at once (Settings → Account).
- Password hashing: **Argon2id** with a server-side pepper
  (`PASSWORD_PEPPER`). Login uses a dummy-hash compare for nonexistent
  accounts to keep timing uniform.

## CSRF

Double-submit cookie bound to the session: `vp_csrf` (JS-readable) must be
echoed in `x-csrf-token` and match the session's `csrfHash`. Enforced for
every authenticated mutation in a global `preHandler`.

## Invite-only registration

`INVITE_ONLY=true` (beta default): registration requires a single-use,
optionally email-bound invite code (stored hashed). The user's role comes
ONLY from the invite (`PLAYER`/`CREATOR`; admin invites deliberately
downgrade to PLAYER — admins are promoted via `npm run grant-admin`).

## Email verification & password reset

One-time tokens (stored hashed, 24h/1h TTLs). Reset revokes all sessions.
`forgot-password` answers identically whether the account exists or not.
Changing the password revokes every other session.

## Roles & guards

| Guard | Behaviour |
| --- | --- |
| `requireAuth` | 401 when no session |
| `requireActiveUser` | 403 for SUSPENDED/BANNED, 401 otherwise-missing |
| `requireCreator` | CREATOR or ADMIN |
| `requireAdmin` | ADMIN only (also a route-tree `preHandler` for `/api/admin/*`) |
| `requireVerifiedEmail` | creator mutations require a verified email |
| `requireOwnershipOrAdmin` | resource-level ownership checks (creator games/versions/uploads) |

Server-side checks are the only authority; the UI's role-based navigation is
cosmetic. Escalation paths are closed:

- `updateProfileSchema` & friends are `.strict()` — role/email in payloads → 422;
- registration ignores any role field (role comes from the invite);
- admins cannot moderate their own games; cannot suspend themselves.

## Account state

`ACTIVE / SUSPENDED / BANNED / DELETED`. Suspension/ban revokes all sessions,
suspends the user's published games, and blocks login with explicit error
codes (`ACCOUNT_SUSPENDED` / `ACCOUNT_BANNED`).

## Rate limits (Redis)

Per-endpoint policies in `apps/api/src/lib/rateLimit.ts` (login, register,
forgot/reset, resend verification, comments, reports, upload intent/complete,
launches, admin actions, deletion/export, feedback) keyed by user id or IP,
stored in Redis so restarts/replicas share counters. 429 responses carry
`retry-after`.
