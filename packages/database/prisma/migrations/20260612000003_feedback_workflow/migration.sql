-- Admin workflow for beta feedback.
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "Feedback"
  ADD COLUMN "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedById" TEXT;

DROP INDEX "Feedback_createdAt_idx";
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
CREATE INDEX "Feedback_resolvedById_idx" ON "Feedback"("resolvedById");

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
