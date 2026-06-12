-- Beta feedback / bug reports (spec §38).
CREATE TYPE "FeedbackCategory" AS ENUM ('FEEDBACK', 'BUG');

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "category" "FeedbackCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "page" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
