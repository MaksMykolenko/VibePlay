import type { ApiEnv } from '@vibeplay/config';
import type { PrismaClient } from '@vibeplay/database';
import type { CreatorAnalyticsDto, CreatorAnalyticsRange } from '@vibeplay/shared';
import { getCreatorAccess } from './entitlements.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<CreatorAnalyticsRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function percentile(sorted: number[], proportion: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)] ?? 0;
}

export async function getCreatorAnalytics(
  prisma: PrismaClient,
  env: ApiEnv,
  userId: string,
  range: CreatorAnalyticsRange,
  now = new Date(),
): Promise<CreatorAnalyticsDto> {
  const days = RANGE_DAYS[range];
  const endExclusive = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const start = new Date(endExclusive.getTime() - days * DAY_MS);
  const previousStart = new Date(start.getTime() - days * DAY_MS);
  const creatorGames = { game: { creatorId: userId } } as const;

  const [access, games] = await Promise.all([
    getCreatorAccess(prisma, env, userId),
    prisma.game.findMany({
      where: { creatorId: userId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        versions: { select: { id: true, version: true } },
        _count: {
          select: {
            likes: true,
            comments: { where: { status: 'VISIBLE' } },
          },
        },
      },
    }),
  ]);
  const advancedEnabled =
    access.billing.entitlements.advancedAnalytics || access.bypassBillingLimits;
  const currentPeriod = { gte: start, lt: endExclusive };

  const [totalPlays, sessions, likesInRange, commentsInRange, latestLike, latestComment] =
    await Promise.all([
      prisma.playSession.count({ where: creatorGames }),
      prisma.playSession.findMany({
        where: { ...creatorGames, startedAt: currentPeriod },
        select: {
          gameId: true,
          gameVersionId: true,
          userId: true,
          startedAt: true,
          durationSeconds: true,
        },
      }),
      prisma.like.count({ where: { ...creatorGames, createdAt: currentPeriod } }),
      prisma.comment.count({
        where: { ...creatorGames, status: 'VISIBLE', createdAt: currentPeriod },
      }),
      prisma.like.findFirst({
        where: { ...creatorGames, createdAt: currentPeriod },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.comment.findFirst({
        where: { ...creatorGames, status: 'VISIBLE', createdAt: currentPeriod },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

  const daily = new Map<string, number>();
  for (let offset = 0; offset < days; offset += 1) {
    daily.set(dateKey(new Date(start.getTime() + offset * DAY_MS)), 0);
  }
  const playsByGame = new Map<string, number>();
  for (const session of sessions) {
    const day = dateKey(session.startedAt);
    daily.set(day, (daily.get(day) ?? 0) + 1);
    playsByGame.set(session.gameId, (playsByGame.get(session.gameId) ?? 0) + 1);
  }

  const durations = sessions
    .flatMap((session) => (session.durationSeconds === null ? [] : [session.durationSeconds]))
    .sort((a, b) => a - b);
  const latestPlay = sessions.reduce<Date | null>(
    (latest, session) => (!latest || session.startedAt > latest ? session.startedAt : latest),
    null,
  );
  const summary: CreatorAnalyticsDto['summary'] = {
    totalGames: games.length,
    publishedGames: games.filter((game) => game.status === 'PUBLISHED').length,
    inModerationGames: games.filter((game) => game.status === 'PENDING_REVIEW').length,
    draftGames: games.filter((game) => game.status === 'DRAFT').length,
    rejectedGames: games.filter((game) => game.status === 'REJECTED').length,
    totalPlays,
    playsInRange: sessions.length,
    likes: games.reduce((sum, game) => sum + game._count.likes, 0),
    comments: games.reduce((sum, game) => sum + game._count.comments, 0),
    averageDurationSeconds:
      durations.length > 0
        ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
        : null,
  };
  const topGames = games
    .map((game) => ({
      gameId: game.id,
      slug: game.slug,
      title: game.title,
      plays: playsByGame.get(game.id) ?? 0,
      likes: game._count.likes,
      comments: game._count.comments,
    }))
    .filter((game) => game.plays > 0)
    .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title))
    .slice(0, 10);

  let advanced: CreatorAnalyticsDto['advanced'] = null;
  if (advancedEnabled) {
    const currentUserIds = [...new Set(sessions.flatMap((session) => session.userId ?? []))];
    const [previousSessions, priorPlayers, allSignedInPlayers, saveUsers, savesByGame] =
      await Promise.all([
        prisma.playSession.findMany({
          where: { ...creatorGames, startedAt: { gte: previousStart, lt: start } },
          select: { startedAt: true },
        }),
        currentUserIds.length === 0
          ? Promise.resolve([])
          : prisma.playSession.findMany({
              where: {
                ...creatorGames,
                userId: { in: currentUserIds },
                startedAt: { lt: start },
              },
              distinct: ['userId'],
              select: { userId: true },
            }),
        prisma.playSession.findMany({
          where: { ...creatorGames, userId: { not: null } },
          distinct: ['userId'],
          select: { userId: true },
        }),
        prisma.gameSave.findMany({
          where: creatorGames,
          distinct: ['userId'],
          select: { userId: true },
        }),
        prisma.gameSave.groupBy({
          by: ['gameId'],
          where: creatorGames,
          _count: { _all: true },
        }),
      ]);

    const previousDaily = new Map<string, number>();
    for (const session of previousSessions) {
      const day = dateKey(session.startedAt);
      previousDaily.set(day, (previousDaily.get(day) ?? 0) + 1);
    }
    const sessionStats = new Map<
      string,
      { loggedIn: number; guest: number; users: Set<string>; durations: number[] }
    >();
    const versionPlays = new Map<string, number>();
    for (const session of sessions) {
      const stat = sessionStats.get(session.gameId) ?? {
        loggedIn: 0,
        guest: 0,
        users: new Set<string>(),
        durations: [],
      };
      if (session.userId) {
        stat.loggedIn += 1;
        stat.users.add(session.userId);
      } else {
        stat.guest += 1;
      }
      if (session.durationSeconds !== null) stat.durations.push(session.durationSeconds);
      sessionStats.set(session.gameId, stat);
      versionPlays.set(session.gameVersionId, (versionPlays.get(session.gameVersionId) ?? 0) + 1);
    }
    const saveCountByGame = new Map(
      savesByGame.map((row) => [row.gameId, row._count._all] as const),
    );
    const allPlayerIds = new Set(allSignedInPlayers.flatMap((row) => row.userId ?? []));
    const saveUserIds = new Set(saveUsers.map((row) => row.userId));
    const adopters = [...saveUserIds].filter((id) => allPlayerIds.has(id)).length;
    const previousPeriodPlays = previousSessions.length;

    advanced = {
      uniquePlayers: currentUserIds.length,
      loggedInPlays: sessions.filter((session) => session.userId !== null).length,
      guestPlays: sessions.filter((session) => session.userId === null).length,
      returningPlayers: priorPlayers.length,
      cloudSaveUsers: saveUserIds.size,
      cloudSaveAdoptionPercent:
        allPlayerIds.size > 0 ? Math.round((adopters / allPlayerIds.size) * 1000) / 10 : null,
      durationPercentiles:
        durations.length > 0
          ? { p50Seconds: percentile(durations, 0.5), p90Seconds: percentile(durations, 0.9) }
          : null,
      comparison: {
        previousPeriodPlays,
        changePercent:
          previousPeriodPlays > 0
            ? Math.round(((sessions.length - previousPeriodPlays) / previousPeriodPlays) * 1000) /
              10
            : null,
        daily: [...daily].map(([date, plays], offset) => {
          const previousDate = dateKey(new Date(previousStart.getTime() + offset * DAY_MS));
          return { date, plays, previousDate, previousPlays: previousDaily.get(previousDate) ?? 0 };
        }),
      },
      games: games
        .map((game) => {
          const stat = sessionStats.get(game.id);
          const gameDurations = stat?.durations ?? [];
          return {
            gameId: game.id,
            slug: game.slug,
            title: game.title,
            plays: (stat?.loggedIn ?? 0) + (stat?.guest ?? 0),
            uniquePlayers: stat?.users.size ?? 0,
            loggedInPlays: stat?.loggedIn ?? 0,
            guestPlays: stat?.guest ?? 0,
            averageDurationSeconds:
              gameDurations.length > 0
                ? Math.round(
                    gameDurations.reduce((sum, duration) => sum + duration, 0) /
                      gameDurations.length,
                  )
                : null,
            cloudSaveUsers: saveCountByGame.get(game.id) ?? 0,
            versions: game.versions
              .map((version) => ({
                versionId: version.id,
                version: version.version,
                plays: versionPlays.get(version.id) ?? 0,
              }))
              .filter((version) => version.plays > 0)
              .sort((a, b) => b.plays - a.plays),
          };
        })
        .filter((game) => game.plays > 0)
        .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title)),
      conversion: { registrationCta: 'NOT_ENOUGH_INTERNAL_DATA' },
    };
  }

  return {
    range,
    period: { from: dateKey(start), to: dateKey(new Date(endExclusive.getTime() - 1)) },
    summary,
    timeseries: [...daily].map(([date, plays]) => ({ date, plays })),
    topGames,
    recentActivity: [
      { type: 'PLAY', count: sessions.length, latestAt: latestPlay?.toISOString() ?? null },
      { type: 'LIKE', count: likesInRange, latestAt: latestLike?.createdAt.toISOString() ?? null },
      {
        type: 'COMMENT',
        count: commentsInRange,
        latestAt: latestComment?.createdAt.toISOString() ?? null,
      },
    ],
    entitlements: {
      creatorPlus: access.billing.plan === 'CREATOR_PLUS',
      advancedAnalytics: advancedEnabled,
    },
    advanced,
  };
}
