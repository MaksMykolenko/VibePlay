-- Add an object-storage key for uploaded user avatars.
--
-- Uploaded avatars are stored in a private "avatars" bucket (MinIO/S3 stays
-- internal) under users/{userId}/avatar/{timestamp}-{random}.{ext}. When this
-- column is set, User.avatarUrl points at GET /api/users/:id/avatar, which
-- streams the object from the private bucket. The column is null for users with
-- an external avatarUrl or no avatar at all. Idempotent and safe to re-run.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarObjectKey" TEXT;
