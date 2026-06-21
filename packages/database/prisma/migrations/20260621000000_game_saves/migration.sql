-- Cloud saves: one JSON save per (user, game). Keyed to the game (not a version)
-- so progress survives version updates. Cascades on both user and game deletion
-- (matches Like/Favorite) so saves never outlive their owner or their game.
CREATE TABLE "GameSave" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "sizeBytes" INTEGER NOT NULL,
  "dataHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameSave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameSave_userId_gameId_key" ON "GameSave"("userId", "gameId");
CREATE INDEX "GameSave_gameId_idx" ON "GameSave"("gameId");
CREATE INDEX "GameSave_userId_updatedAt_idx" ON "GameSave"("userId", "updatedAt");

ALTER TABLE "GameSave"
ADD CONSTRAINT "GameSave_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameSave"
ADD CONSTRAINT "GameSave_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
