import type { ApiEnv } from '@vibeplay/config';
import type { PrismaClient } from '@vibeplay/database';
import {
  ANALYTICS_EVENT_TYPES,
  type AnalyticsEventType,
  type CreatorAnalyticsDto,
  type CreatorAnalyticsRange,
} from '@vibeplay/shared';
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

  const [
    totalPlays,
    sessions,
    likesInRange,
    commentsInRange,
    latestLike,
    latestComment,
    analyticsEvents,
  ] = await Promise.all([
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
    prisma.analyticsEvent.findMany({
      where: { ...creatorGames, createdAt: currentPeriod },
      select: { type: true, gameId: true, versionId: true, metadata: true },
    }),
  ]);

  const allowedEventTypes = new Set<string>(ANALYTICS_EVENT_TYPES);
  const safeEvents = analyticsEvents.filter((event) => allowedEventTypes.has(event.type));
  const eventCount = (type: AnalyticsEventType): number =>
    safeEvents.filter((event) => event.type === type).length;
  const eventCounts = new Map<AnalyticsEventType, number>();
  for (const event of safeEvents) {
    const type = event.type as AnalyticsEventType;
    eventCounts.set(type, (eventCounts.get(type) ?? 0) + 1);
  }
  const launchesByGame = new Map<string, number>();
  for (const event of safeEvents) {
    if (event.type === 'game_launch_success') {
      launchesByGame.set(event.gameId, (launchesByGame.get(event.gameId) ?? 0) + 1);
    }
  }

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
  const eventMetrics: CreatorAnalyticsDto['eventMetrics'] = {
    launchSuccesses: eventCount('game_launch_success'),
    launchFailures: eventCount('game_launch_failed'),
    playsStarted: eventCount('play_session_started'),
    recent: [...eventCounts]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
      .slice(0, 10),
    topGamesByLaunch: games
      .map((game) => ({
        gameId: game.id,
        slug: game.slug,
        title: game.title,
        launches: launchesByGame.get(game.id) ?? 0,
      }))
      .filter((game) => game.launches > 0)
      .sort((a, b) => b.launches - a.launches || a.title.localeCompare(b.title))
      .slice(0, 10),
  };

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
    const metadataValue = (metadata: unknown, key: string): string | null => {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
      const value = (metadata as Record<string, unknown>)[key];
      return typeof value === 'string' ? value : null;
    };
    const countByMetadata = (
      type: AnalyticsEventType,
      key: string,
    ): { code: string; count: number }[] => {
      const counts = new Map<string, number>();
      for (const event of safeEvents) {
        if (event.type !== type) continue;
        const value = metadataValue(event.metadata, key);
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return [...counts]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    };
    const versionInfo = new Map(
      games.flatMap((game) =>
        game.versions.map(
          (version) =>
            [
              version.id,
              { gameId: game.id, gameTitle: game.title, version: version.version },
            ] as const,
        ),
      ),
    );
    const versionEventCounts = new Map<
      string,
      { events: number; launchSuccesses: number; launchFailures: number }
    >();
    for (const event of safeEvents) {
      if (!event.versionId || !versionInfo.has(event.versionId)) continue;
      const count = versionEventCounts.get(event.versionId) ?? {
        events: 0,
        launchSuccesses: 0,
        launchFailures: 0,
      };
      count.events += 1;
      if (event.type === 'game_launch_success') count.launchSuccesses += 1;
      if (event.type === 'game_launch_failed') count.launchFailures += 1;
      versionEventCounts.set(event.versionId, count);
    }
    const launchAttempts = eventMetrics.launchSuccesses + eventMetrics.launchFailures;

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
      conversion: {
        registrationCta:
          eventCount('register_from_game_clicked') > 0 ? 'AVAILABLE' : 'NOT_ENOUGH_INTERNAL_DATA',
        registrationClicks: eventCount('register_from_game_clicked'),
        registrationCompletions: eventCount('registration_completed_from_game'),
        loginClicks: eventCount('login_from_game_clicked'),
        loginCompletions: eventCount('login_completed_from_game'),
      },
      eventInsights: {
        launchSuccessRate:
          launchAttempts > 0
            ? Math.round((eventMetrics.launchSuccesses / launchAttempts) * 1000) / 10
            : null,
        launchFailureReasons: countByMetadata('game_launch_failed', 'code'),
        cloudSaveFunnel: {
          ctaShown: eventCount('cloud_save_cta_shown'),
          signupClicks: eventCount('cloud_save_cta_signup_clicked'),
          loginClicks: eventCount('cloud_save_cta_login_clicked'),
          syncPrompts: eventCount('cloud_save_sync_prompt_shown'),
          syncAccepted: eventCount('cloud_save_sync_accepted'),
        },
        guestExitActions: (
          [
            'guest_exit_warning_shown',
            'guest_exit_warning_keep_playing',
            'guest_exit_warning_leave_anyway',
            'guest_exit_warning_signup_clicked',
            'guest_exit_warning_login_clicked',
          ] as const
        )
          .map((type) => ({ type, count: eventCount(type) }))
          .filter((event) => event.count > 0),
        customEvents: countByMetadata('game_custom_event', 'name').map(({ code, count }) => ({
          name: code,
          count,
        })),
        versions: [...versionEventCounts]
          .map(([versionId, counts]) => ({
            versionId,
            ...versionInfo.get(versionId)!,
            ...counts,
          }))
          .sort((a, b) => b.events - a.events),
      },
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
    eventMetrics,
    entitlements: {
      creatorPlus: access.billing.plan === 'CREATOR_PLUS',
      advancedAnalytics: advancedEnabled,
    },
    advanced,
  };
}
