# Private Beta Runbook

Day-to-day operations for the invite-only beta. Audience: whoever is on
"beta duty" (admin role + host access).

## Inviting people

```text
Admin UI → Users → Invites → Create invite (role PLAYER or CREATOR,
optional email binding, expiry days) → send the code/link manually.
```

API equivalent: `POST /api/admin/invites`. Codes are single-use and stored
hashed; bind to an email for anyone you don't know personally. Creators get
CREATOR invites — there is no self-serve creator upgrade in the beta.

## Daily checks (5 minutes)

1. `https://beta…/api/health/ready` → 200, all checks ok.
2. Moderation queue empty-ish? (`/admin/moderation`) — review SLA: 24h.
3. Open reports (`/admin/reports`) — malicious-game reports first.
4. `docker compose ps` — everything healthy; disk: `df -h` (backups dir!).
5. Backup cron produced today's dump (`ls -lt backups/postgres | head`).

## Moderation duty

- Preview EVERY build before approving (real preview origin, scan report in
  the queue entry). Approve only what you actually launched.
- Reject with an actionable reason — the creator sees it verbatim.
- Malicious upload? → reject, suspend the creator (revokes sessions, hides
  their games), keep the quarantine object until investigated, note it in
  the audit log; follow `INCIDENT_RESPONSE.md` if anything was published.
- You cannot moderate your own games (enforced).

## Abuse & account requests

- Reports queue: resolve/dismiss with a note; reporters get a notification.
- Account deletion/export requests arrive as admin notifications + audit
  entries (`account.deletion_requested` / `account.export_requested`).
  Process within 30 days as documented in `/privacy`:
  deletion = revoke sessions → anonymize comments → unpublish/remove games →
  remove profile (manual SQL/console during beta; record completion in the
  audit log). Export = compile account data, send to the verified email.

## Feedback triage

`Feedback` table + admin notifications (category BUG/FEEDBACK, page).
Weekly: tag, dedupe, and move actionable items into the issue tracker.

## Routine ops

- **Deploy**: `DEPLOYMENT.md` § Updating (build → up -d; migrations run via
  the migrate service).
- **Backups/restore drill**: `BACKUP_AND_RESTORE.md` (drill monthly).
- **Hide a game fast**: Admin UI → game → Hide (propagates to the game host
  within 15s via Redis invalidation; verify the origin 404s).
- **Suspend a user fast**: Admin UI → Users → Suspend (sessions revoked,
  games suspended immediately).
- **Invite freeze**: stop issuing invites; existing unused codes can be
  expired by deleting rows (document in audit).

## Capacity guardrails (beta)

- ≤ ~50 invited users, ≤ ~100 published versions on the reference host.
- Upload limits via env (`UPLOAD_MAX_*`); shown to creators on the upload
  screen. Raise deliberately, not reactively.

## Escalation

Anything matching `INCIDENT_RESPONSE.md` severities → follow that doc.
Otherwise: note in the ops log, fix forward.
