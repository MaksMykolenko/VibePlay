# Incident Response (Beta)

Lightweight process sized for a private beta: one responder, clear
priorities, honest user communication.

## Severities

| Sev | Definition | Examples | Response |
| --- | --- | --- | --- |
| SEV1 | active harm to users or data | malicious game published, auth bypass, data leak, ransomware on host | drop everything, contain within 1h |
| SEV2 | platform integrity degraded | pipeline approving bad builds, backups failing, mass abuse | same day |
| SEV3 | partial outage / broken feature | uploads failing, emails not sending | within 2 business days |

## SEV1 playbook: malicious game got published

1. **Contain** — Admin → Hide game (origin 404s ≤15s). If multiple games or
   a compromised creator: suspend the creator (kills sessions + games).
2. **Freeze evidence** — keep the quarantine ZIP and published prefix
   (`games/{gameId}/{versionId}/`); export the validation report and audit
   rows; snapshot relevant logs.
3. **Assess blast radius** — game CSP blocks external network and storage is
   per-version, so impact is bounded to players who launched THAT version:
   pull PlaySession rows (who/when). Check the report for what the build did.
4. **Eradicate** — confirm files removed/never servable; if a validator gap
   allowed it, write a failing test reproducing the bypass before fixing.
5. **Notify** — email affected players (what happened, when, what it could
   and could not do — be precise about the sandbox), notify the reporter.
6. **Post-mortem** — within 72h: timeline, root cause, validator/CSP fixes,
   detection gap, action items. Store under `docs/postmortems/`.

## SEV1 playbook: suspected account/session compromise

1. Revoke the affected user's sessions (or all: see below), reset password
   via admin-triggered reset email.
2. Platform-wide compromise (leaked `SESSION_SECRET`): rotate the secret —
   this invalidates ALL sessions and hashed tokens — redeploy, force
   re-login, announce honestly.
3. Audit `AuditLog` + structured logs by requestId/userId for the window.

## SEV1 playbook: data loss

Follow `BACKUP_AND_RESTORE.md`: restore the latest dump into a scratch DB,
verify counts, then promote. Object storage: published trees are immutable —
re-sync from the storage backup. Announce the data window lost.

## Communication

- Status note in the product (`service status` message) + email to invited
  users for SEV1/SEV2.
- Be specific: what happened, impact window, user action required, what
  changed so it won't recur. No silent fixes for anything user-visible.

## On-call basics

- Ops log: append-only note per incident (start, actions, end).
- Never debug on production data without a copy; never hand-edit the DB
  without an audit-log entry describing the change.
