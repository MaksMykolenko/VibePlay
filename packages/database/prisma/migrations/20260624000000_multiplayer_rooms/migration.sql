-- VibePlay-owned multiplayer rooms (spec Phases 1 & 5).
--
-- VibePlay owns room lifecycle, identity, and the short join code; a game's
-- external realtime server (e.g. the Boxy Tanks WebSocket server) owns the live
-- simulation, keyed by the VibePlay roomCode. Auth never enters the game iframe.
--
-- - Guest: anonymous cookie-scoped identity (only the HMAC hash of the cookie
--   token is stored, mirroring Session). Lets guests create/host/rejoin rooms.
-- - GameRoom: a room for a published game (status/visibility/host/expiry/caps).
-- - GameRoomPlayer: membership; unique per (room,user) and (room,guest) so a
--   member holds at most one row per room (rejoin updates, never duplicates).
-- - Game.multiplayer* : metadata describing how a game's multiplayer works.

-- CreateEnum
CREATE TYPE "GameRoomStatus" AS ENUM ('WAITING', 'ACTIVE', 'FINISHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GameRoomVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "GameRoomPlayerStatus" AS ENUM ('JOINED', 'LEFT', 'KICKED');

-- CreateEnum
CREATE TYPE "MultiplayerTransport" AS ENUM ('NONE', 'EXTERNAL_WS', 'VIBEPLAY_SDK');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "multiplayerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "multiplayerMaxPlayers" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "multiplayerModes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "multiplayerTransport" "MultiplayerTransport" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "multiplayerWsUrl" TEXT;

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRoom" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "versionId" TEXT,
    "roomCode" TEXT NOT NULL,
    "status" "GameRoomStatus" NOT NULL DEFAULT 'WAITING',
    "visibility" "GameRoomVisibility" NOT NULL DEFAULT 'PRIVATE',
    "hostUserId" TEXT,
    "hostGuestId" TEXT,
    "maxPlayers" INTEGER NOT NULL DEFAULT 8,
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'free_for_all',
    "transport" TEXT NOT NULL DEFAULT 'external_ws',
    "wsUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRoomPlayer" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "status" "GameRoomPlayerStatus" NOT NULL DEFAULT 'JOINED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GameRoomPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guest_tokenHash_key" ON "Guest"("tokenHash");

-- CreateIndex
CREATE INDEX "Guest_lastSeenAt_idx" ON "Guest"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameRoom_roomCode_key" ON "GameRoom"("roomCode");

-- CreateIndex
CREATE INDEX "GameRoom_gameId_status_idx" ON "GameRoom"("gameId", "status");

-- CreateIndex
CREATE INDEX "GameRoom_status_expiresAt_idx" ON "GameRoom"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "GameRoomPlayer_roomId_status_idx" ON "GameRoomPlayer"("roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameRoomPlayer_roomId_userId_key" ON "GameRoomPlayer"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRoomPlayer_roomId_guestId_key" ON "GameRoomPlayer"("roomId", "guestId");

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "GameVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_hostGuestId_fkey" FOREIGN KEY ("hostGuestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoomPlayer" ADD CONSTRAINT "GameRoomPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "GameRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoomPlayer" ADD CONSTRAINT "GameRoomPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoomPlayer" ADD CONSTRAINT "GameRoomPlayer_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

