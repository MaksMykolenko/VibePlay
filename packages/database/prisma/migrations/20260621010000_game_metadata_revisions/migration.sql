CREATE TYPE "MetadataRevisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "GameMetadataRevision" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "status" "MetadataRevisionStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "GameMetadataRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GameMetadataRevision_status_submittedAt_idx"
ON "GameMetadataRevision"("status", "submittedAt");

CREATE INDEX "GameMetadataRevision_gameId_submittedAt_idx"
ON "GameMetadataRevision"("gameId", "submittedAt");

CREATE UNIQUE INDEX "GameMetadataRevision_one_pending_per_game_idx"
ON "GameMetadataRevision"("gameId") WHERE "status" = 'PENDING';

ALTER TABLE "GameMetadataRevision"
ADD CONSTRAINT "GameMetadataRevision_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameMetadataRevision"
ADD CONSTRAINT "GameMetadataRevision_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GameMetadataRevision"
ADD CONSTRAINT "GameMetadataRevision_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
