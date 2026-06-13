# Game Upload Pipeline

How a creator's ZIP becomes a playable, moderated build. The pipeline is the
same in every environment; only the queue driver differs (BullMQ in real
deployments, inline in tests).

```text
creator                api                       storage              worker
  │  create version      │                          │                    │
  ├─────────────────────►│  GameVersion: UPLOADING  │                    │
  │  upload intent       │                          │                    │
  ├─────────────────────►│ presigned PUT ──────────►│ quarantine bucket  │
  │  PUT zip (browser)   │                          │                    │
  ├──────────────────────┼─────────────────────────►│                    │
  │  complete            │  status: QUARANTINED     │                    │
  ├─────────────────────►│  enqueue BullMQ job ─────┼───────────────────►│
  │                      │                          │   download zip     │
  │                      │                          │◄───────────────────┤
  │                      │     VALIDATING → checks → ClamAV → extract    │
  │                      │                          │  publish files     │
  │                      │                          │◄───────────────────┤
  │   status polling     │  READY_FOR_REVIEW or SCAN_FAILED + report     │
  ◄──────────────────────┴──────────────────────────┴────────────────────┘
```

## Server-side checks (never trust the client)

1. **Intent** — size ≤ `UPLOAD_MAX_COMPRESSED_MB`, sha256 declared, one
   active upload per version, ownership + verified email + creator role.
2. **Complete** — object exists in quarantine, size matches the intent,
   single-use (409 on replays), then `QUARANTINED` → job enqueued
   (enqueue failure rolls the status back).
3. **Worker** (`apps/worker/src/pipeline/processVersion.ts`):
   - sha256 of the actual bytes must equal the declared checksum;
   - `zipValidator`: real ZIP signature, central directory parse, per-entry
     `checkArchivePath` (rejects `..`, absolute paths, `.` segments, `//`,
     backslashes, control chars), forbidden extensions (php/exe/sh/…),
     allowed-extension list for browser content, `index.html` at the root,
     limits: compressed/uncompressed bytes, file count, single-file size
     (zip-bomb budget enforced during streaming extraction too);
   - **ClamAV** scan (TCP INSTREAM). `SCAN_DRIVER=off` is allowed only
     outside production and is recorded in the report;
   - safe extraction to a temp dir with byte budgets, then upload to the
     published bucket under `games/{gameId}/{versionId}/` (immutable);
   - persist `validationReport` (checks, scanner verdict, content hash) and
     set `READY_FOR_REVIEW`, or `SCAN_FAILED` with the failure reason;
   - notify the creator either way; temp files are always cleaned.

## Failure taxonomy the creator sees

| Cause | Status | Report contains |
| --- | --- | --- |
| checksum mismatch | SCAN_FAILED | "checksum does not match" |
| corrupt/garbage zip | SCAN_FAILED | signature/parse failure |
| missing root `index.html` | SCAN_FAILED | "index.html" check failed |
| path traversal entry | SCAN_FAILED | offending path + reason |
| forbidden extension | SCAN_FAILED | extension + filename |
| limits exceeded | SCAN_FAILED | which limit |
| malware | SCAN_FAILED | scanner verdict (signature name) |

Creators fix and upload a **new version** — versions are immutable, there is
no in-place re-upload.

## Cleanup & retention

- Quarantine bucket: MinIO ILM expires objects after 7 days.
- Published version trees are immutable; ARCHIVED versions' files are kept
  (rollback safety) and swept by the documented orphan cleanup
  (`BACKUP_AND_RESTORE.md`).

## E2E coverage

`tests/e2e/upload-pipeline.spec.ts` drives all of the above against the real
pipeline: valid build → READY_FOR_REVIEW; missing index / traversal /
forbidden extension / corrupt archive → SCAN_FAILED with readable reasons.
