# Moderation State Machine

Authoritative implementation: `packages/shared/src/stateMachine.ts` (unit
tested; the API throws 409 `INVALID_TRANSITION` on anything else).

## GameVersion states

```text
UPLOADING ─► QUARANTINED ─► VALIDATING ─► READY_FOR_REVIEW ─► APPROVED ─► PUBLISHED ─► ARCHIVED
                                 │                  │
                                 ▼                  ▼
                            SCAN_FAILED         REJECTED
```

| State | Meaning (creator-facing copy) |
| --- | --- |
| UPLOADING | "Uploading" — intent created, ZIP not confirmed |
| QUARANTINED | "Validating archive" — ZIP landed in quarantine |
| VALIDATING | "Scanning for malware" — worker pipeline running |
| SCAN_FAILED | "Rejected by validation" — automated failure + reason |
| READY_FOR_REVIEW | "Ready for review" — passed automation, queued for a human |
| APPROVED | "Under review" — transient state inside the approve transaction |
| REJECTED | "Rejected" — human decision + mandatory reason |
| PUBLISHED | "Published" — live; exactly one per game |
| ARCHIVED | replaced by a newer published version |

Versions are **immutable**: there is no transition back from a terminal
state; fixing anything means uploading a new version.

## Invariants enforced by the API

- Approve/reject only from `READY_FOR_REVIEW` (`isApprovable`).
- Approving archives the previous `PUBLISHED` version and updates
  `game.publishedVersionId` in one transaction.
- **Self-moderation is blocked**: an admin cannot approve/reject a version of
  a game they created (403).
- Rejection requires a reason; reason + optional notes are persisted on the
  version and in a `ModerationDecision` row, and delivered to the creator as
  a notification (and email template).
- Every decision writes an `AuditLog` entry (actor, action, target,
  metadata).

## Game states

`DRAFT → PENDING_REVIEW* → PUBLISHED → HIDDEN/SUSPENDED → …`
(game status is derived from moderation actions: publish sets `PUBLISHED`,
admin hide sets `HIDDEN`, user suspension sets the creator's published games
to `SUSPENDED`, restore returns `PUBLISHED`/`DRAFT` based on
`publishedVersionId`). Catalog and launch endpoints only ever serve
`PUBLISHED` games; the game-host re-checks on every request.

## Admin queue

`GET /api/admin/moderation` lists versions in
`READY_FOR_REVIEW / VALIDATING / SCAN_FAILED` (oldest submission first) with
the full game context and the persisted `validationReport` (scan report shown
in the moderation UI). Preview URLs come from
`POST /api/admin/game-versions/:id/preview-url` — see `GAME_SANDBOX.md`.
