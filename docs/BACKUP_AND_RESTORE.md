# Backup & Restore

How VibePlay beta data is backed up, how it is restored, and how restores are
verified. Scripts live in `scripts/` and take all configuration from the
environment — **never hardcode or commit production secrets**.

## What needs backing up

| Data | Where | Tool | Why |
| --- | --- | --- | --- |
| Users, games, versions, moderation, audit | PostgreSQL | `scripts/backup-postgres.sh` | source of truth |
| Published game files | S3 bucket `vibeplay-published` | `scripts/backup-storage.sh` | immutable per-version trees |
| Avatars, covers, media | private S3 bucket `vibeplay-avatars` | `scripts/backup-storage.sh` | user-uploaded media referenced by PostgreSQL |
| Quarantine uploads | S3 bucket `vibeplay-quarantine` | optional | auto-expires after 7 days |
| Redis | — | none | queues/rate-limit counters are reconstructible |

## PostgreSQL

### Taking a backup

```bash
# Against the docker compose stack (default mode):
BACKUP_DIR=./backups ./scripts/backup-postgres.sh

# Against a managed database:
BACKUP_MODE=direct DATABASE_URL=postgres://... ./scripts/backup-postgres.sh
```

Produces a custom-format `pg_dump -Fc` archive:
`backups/postgres/vibeplay-<UTC>.dump[.age|.enc]` plus a `SHA256SUMS` manifest.

### Encryption

Set **one** of:

- `BACKUP_AGE_RECIPIENT=age1...` — encrypt with [age](https://age-encryption.org) (preferred; keep the identity file offline);
- `BACKUP_PASSPHRASE=...` — `openssl enc -aes-256-cbc -pbkdf2`.

Unencrypted dumps are allowed only for local testing; the script warns loudly.

### Retention

`BACKUP_RETENTION_DAYS` (default 14) prunes old dumps in the backup directory.
Recommended beta schedule (cron on the staging host):

```
17 3 * * *  BACKUP_DIR=/var/backups/vibeplay BACKUP_AGE_RECIPIENT=age1... /srv/vibeplay/scripts/backup-postgres.sh
47 3 * * 0  BACKUP_INCLUDE_QUARANTINE=false BACKUP_DIR=/var/backups/vibeplay /srv/vibeplay/scripts/backup-storage.sh
```

Daily DB dumps kept 14 days; copy weekly database and storage backups to
encrypted off-host storage in a different account/failure domain. Use client-side
encryption or a destination with managed encryption and separately held keys.

For the Hostinger stack, object backups default to the private
`vibeplay_vibeplay` Docker network and `http://minio:9000`; no MinIO host port
is required. Override `MINIO_DOCKER_NETWORK` only when the Compose project name
differs.

### Restoring

```bash
# Restore into a clean scratch database and verify:
./scripts/restore-postgres.sh backups/postgres/vibeplay-<stamp>.dump vibeplay_restore_check
```

The script:

1. decrypts if needed (`BACKUP_AGE_IDENTITY` / `BACKUP_PASSPHRASE`);
2. refuses to overwrite an existing database without `RESTORE_FORCE=true`;
3. runs `pg_restore --no-owner --no-privileges` into the clean database;
4. prints row counts for `User`, `Game`, `GameVersion`, `ModerationDecision`.

### Migration compatibility after restore

A dump contains the schema **as of its backup time**, including the
`_prisma_migrations` table. After restoring:

```bash
cd packages/database
DATABASE_URL=postgres://...:5432/vibeplay_restore_check npx prisma migrate status
# behind → apply the missing migrations:
DATABASE_URL=... npx prisma migrate deploy
```

Never run `migrate dev`/`db push` against restored production data.

## Object storage

- The **published** bucket holds extracted game files under
  `games/{gameId}/{versionId}/…`. Version trees are **immutable**: a path is
  written exactly once at approval time and never mutated, so `mc mirror`
  / `aws s3 sync` incrementals are cheap, and a restore is a plain copy-back.
- The **quarantine** bucket expires objects after 7 days (MinIO ILM rule
  created by `create-minio-buckets` in docker-compose). Backing it up is
  optional (`BACKUP_INCLUDE_QUARANTINE=true`) — losing it loses only
  in-flight, unreviewed uploads.
- The private **avatars/media** bucket contains avatars and moderated game covers.
  It is mandatory in every backup. Covers remain private objects and are streamed
  by the API; a restore must never add anonymous/public-read policies.
- For providers with native versioning (S3/R2), enable bucket versioning on
  the published bucket as an extra safety net; the storage layout stays valid.

Restore a mirrored backup into a clean target:

```bash
STORAGE_RESTORE_MODE=fs FS_STORAGE_ROOT=/tmp/vibeplay-restored \
  ./scripts/restore-storage.sh backups/storage
```

`minio` and `s3` restore modes are also supported. Restore does not delete
unrelated target keys; use a clean bucket/root for drills and verify before
switching production traffic.

List the planned bucket set without reading or writing objects:

```bash
BACKUP_DRY_RUN=true ./scripts/backup-storage.sh
RESTORE_DRY_RUN=true ./scripts/restore-storage.sh backups/storage
```

### Orphan cleanup

If a database restore goes back in time, the published bucket may contain
version trees the database no longer references. They are harmless (the
game-host serves only versions the database marks as published) but should be
swept periodically: list `games/*/*/` prefixes and delete those whose
`versionId` has no `GameVersion` row with status `PUBLISHED`/`ARCHIVED`.

## Restore drill (run before inviting users, then monthly)

```text
create beta data → backup → destroy → restore → verify
```

1. On a stack with data (users/games/versions/moderation decisions),
   run `./scripts/backup-postgres.sh` and `./scripts/backup-storage.sh`.
2. Destroy the test database:
   `docker compose exec postgres psql -U vibeplay -d postgres -c 'DROP DATABASE vibeplay_restore_check' || true`.
3. Restore PostgreSQL:
   `./scripts/restore-postgres.sh backups/postgres/<latest>.dump vibeplay_restore_check`.
4. Restore published assets and the private avatars/media bucket:
   `./scripts/restore-storage.sh backups/storage`.
5. Verify counts, `publishedVersionId`, metadata revisions, moderation records,
   restored asset hashes, game-host launch and `prisma migrate status`.
6. From an unauthenticated network, verify every storage bucket denies list/get;
   confirm API/game-host streaming still works before switching traffic.
7. Record the result (date, dump file, counts) in the ops log.

The verified drill for this repository is recorded in
`VIBEPLAY_BETA_MVP_READINESS.md` §14.
