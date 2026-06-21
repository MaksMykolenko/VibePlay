import type { FastifyInstance } from 'fastify';
import { Prisma } from '@vibeplay/database';
import { GAME_SAVE_MAX_BYTES, errors, gameSavePutSchema, inspectSaveData } from '@vibeplay/shared';
import { sha256 } from '../lib/crypto.js';
import { requireActiveUser } from '../lib/guards.js';
import { rlPolicy } from '../lib/rateLimit.js';
import { toGameSaveDto, toGameSaveSummary } from '../lib/serializers.js';
import { parse } from '../lib/validate.js';

/**
 * Cloud saves (spec Phase 1). Per-user, per-game JSON state.
 *
 * Security invariants:
 * - every endpoint REQUIRES an active authenticated user (no guest access);
 * - a save row is always scoped by `userId`, so one user can never read or write
 *   another user's save (no IDOR — the unique key is (userId, gameId));
 * - only JSON is accepted, structurally validated and hard-capped in size before
 *   anything is persisted;
 * - saves are keyed to the GAME, not a version, so progress survives updates.
 *
 * Mutations are CSRF-protected by the global preHandler hook and rate-limited.
 */

// cuid-shaped id (matches the platform's id format and idSchema bounds). Used to
// reject obviously malformed ids early with a clean 404 instead of a DB round-trip.
const GAME_ID_RE = /^[a-z0-9]{8,64}$/i;

export async function registerGameSaveRoutes(app: FastifyInstance): Promise<void> {
  const { prisma } = app;

  // List metadata for ALL of the caller's saves. No payloads — keeps it light and
  // avoids shipping potentially large blobs the caller didn't ask for.
  app.get('/me/game-saves', async (req) => {
    const user = requireActiveUser(req);
    const saves = await prisma.gameSave.findMany({
      where: { userId: user.id },
      select: {
        gameId: true,
        schemaVersion: true,
        sizeBytes: true,
        dataHash: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { saves: saves.map(toGameSaveSummary) };
  });

  // Read the caller's full save for one game. 404 when they have none.
  app.get<{ Params: { gameId: string } }>('/me/game-saves/:gameId', async (req) => {
    const user = requireActiveUser(req);
    const { gameId } = req.params;
    if (!GAME_ID_RE.test(gameId)) throw errors.saveNotFound();

    const save = await prisma.gameSave.findUnique({
      // Composite-unique lookup is implicitly scoped to THIS user.
      where: { userId_gameId: { userId: user.id, gameId } },
    });
    if (!save) throw errors.saveNotFound();
    return { save: toGameSaveDto(save) };
  });

  // Upsert the caller's save for one game.
  app.put<{ Params: { gameId: string } }>(
    '/me/game-saves/:gameId',
    { config: { rateLimit: rlPolicy('gameSaveWrite') } },
    async (req) => {
      const user = requireActiveUser(req);
      const { gameId } = req.params;
      if (!GAME_ID_RE.test(gameId)) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');

      const body = parse(gameSavePutSchema, req.body);
      if (body.data === undefined) throw errors.saveInvalid('Missing "data"');

      // Structural safety: depth, prototype-pollution keys, JSON-representable.
      const inspection = inspectSaveData(body.data);
      if (!inspection.ok) throw errors.saveInvalid(inspection.detail ?? 'Invalid save data');

      // Cap the SERIALIZED bytes — the thing actually stored.
      const serialized = JSON.stringify(body.data);
      if (typeof serialized !== 'string') throw errors.saveInvalid('Save data is not serializable');
      const sizeBytes = Buffer.byteLength(serialized, 'utf8');
      if (sizeBytes > GAME_SAVE_MAX_BYTES) {
        throw errors.tooLarge(
          `Save exceeds the ${Math.floor(GAME_SAVE_MAX_BYTES / 1024)} KB limit`,
        );
      }

      // Require a real game (clearer 404 than a raw FK violation). Saves are
      // intentionally allowed for any existing game the user can reach.
      const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
      if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');

      const dataHash = sha256(serialized);
      const schemaVersion = body.schemaVersion ?? 1;
      // Re-parse the validated JSON so Prisma stores a normalized, plain value.
      const data = JSON.parse(serialized) as Prisma.InputJsonValue;

      const save = await prisma.gameSave.upsert({
        where: { userId_gameId: { userId: user.id, gameId } },
        create: { userId: user.id, gameId, data, schemaVersion, sizeBytes, dataHash },
        update: { data, schemaVersion, sizeBytes, dataHash },
      });
      return { save: toGameSaveDto(save) };
    },
  );

  // Delete the caller's save for one game. 404 only when there was nothing to delete.
  app.delete<{ Params: { gameId: string } }>('/me/game-saves/:gameId', async (req) => {
    const user = requireActiveUser(req);
    const { gameId } = req.params;
    if (!GAME_ID_RE.test(gameId)) throw errors.saveNotFound();

    // deleteMany scoped by userId guarantees we never touch another user's row.
    const result = await prisma.gameSave.deleteMany({ where: { userId: user.id, gameId } });
    if (result.count === 0) throw errors.saveNotFound();
    return { ok: true };
  });
}
