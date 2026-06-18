-- Add the OWNER role to the UserRole enum.
--
-- OWNER is the platform founder: a strict superset of ADMIN. It is the only role
-- permitted to moderate (approve/reject) its OWN game versions, for solo/beta
-- testing — and only versions that already passed validation + malware scan
-- (status READY_FOR_REVIEW). All of that is enforced in application code; this
-- migration only widens the enum. Idempotent and safe to re-run.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OWNER';
