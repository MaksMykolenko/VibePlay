import { z } from 'zod';
import type { Game, GameMetadataRevision, GameScreenshot, PrismaClient } from '@vibeplay/database';
import { createGameSchema, type MetadataRevisionDto } from '@vibeplay/shared';

export const metadataRevisionDataSchema = createGameSchema.extend({
  coverUrl: z.string().url().nullable(),
  coverObjectKey: z.string().min(1).max(512).nullable(),
});

export type MetadataRevisionData = z.infer<typeof metadataRevisionDataSchema>;
type MetadataGame = Game & { screenshots: GameScreenshot[] };

export function metadataSnapshot(game: MetadataGame): MetadataRevisionData {
  return metadataRevisionDataSchema.parse({
    title: game.title,
    shortDescription: game.shortDescription,
    description: game.description,
    category: game.category,
    ageRating: game.ageRating,
    tags: game.tags,
    devices: game.devices,
    controls: game.controls,
    toolsUsed: game.toolsUsed,
    multiplayer: game.multiplayer,
    aiDisclosure: game.aiDisclosure,
    coverUrl: game.coverUrl,
    coverObjectKey: game.coverObjectKey,
    screenshots: [...game.screenshots]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((screenshot) => screenshot.url),
  });
}

export async function submitMetadataRevision(
  prisma: PrismaClient,
  game: MetadataGame,
  submittedById: string,
  patch: Partial<MetadataRevisionData>,
) {
  const pending = await prisma.gameMetadataRevision.findFirst({
    where: { gameId: game.id, status: 'PENDING' },
    orderBy: { submittedAt: 'desc' },
  });
  const base = pending ? metadataRevisionDataSchema.parse(pending.data) : metadataSnapshot(game);
  const data = metadataRevisionDataSchema.parse({ ...base, ...patch });

  if (pending) {
    return prisma.gameMetadataRevision.update({
      where: { id: pending.id },
      data: { data, submittedById, submittedAt: new Date() },
    });
  }
  return prisma.gameMetadataRevision.create({
    data: { gameId: game.id, submittedById, data },
  });
}

export function toMetadataRevisionDto(
  revision: GameMetadataRevision,
  apiOrigin: string,
): MetadataRevisionDto {
  const { coverObjectKey, ...data } = metadataRevisionDataSchema.parse(revision.data);
  return {
    id: revision.id,
    gameId: revision.gameId,
    status: revision.status,
    data: {
      ...data,
      coverUrl: coverObjectKey
        ? `${apiOrigin}/api/metadata-revisions/${revision.id}/cover`
        : data.coverUrl,
    },
    reason: revision.reason,
    submittedAt: revision.submittedAt.toISOString(),
    reviewedAt: revision.reviewedAt?.toISOString() ?? null,
  };
}
