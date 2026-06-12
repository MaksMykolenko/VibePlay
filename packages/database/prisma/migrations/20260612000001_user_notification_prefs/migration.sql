-- Persisted per-user notification preferences (beta account controls, spec §36).
ALTER TABLE "User" ADD COLUMN "notificationPrefs" JSONB NOT NULL DEFAULT '{}';
