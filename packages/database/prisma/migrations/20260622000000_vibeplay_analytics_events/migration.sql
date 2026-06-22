-- Privacy-safe first-party analytics. Play/auth session identifiers, IPs,
-- user agents, private profile fields, and save payloads are never stored.
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "versionId" TEXT,
    "userId" TEXT,
    "actorType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_gameId_createdAt_idx" ON "AnalyticsEvent"("gameId", "createdAt");
CREATE INDEX "AnalyticsEvent_versionId_createdAt_idx" ON "AnalyticsEvent"("versionId", "createdAt");
CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");
CREATE INDEX "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");

ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "GameVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
