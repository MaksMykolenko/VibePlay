import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@vibeplay/database';
import {
  ApiError,
  analyticsEventBatchSchema,
  analyticsEventInputSchema,
  errors,
  type AnalyticsEventInput,
  type AnalyticsEventType,
} from '@vibeplay/shared';
import { rlPolicy } from '../lib/rateLimit.js';

const SESSION_CONTEXT_EVENTS = new Set<AnalyticsEventType>([
  'game_launch_success',
  'play_session_started',
  'play_heartbeat',
  'play_session_ended',
  'cloud_save_cta_shown',
  'cloud_save_cta_signup_clicked',
  'cloud_save_cta_login_clicked',
  'cloud_save_sync_prompt_shown',
  'cloud_save_sync_accepted',
  'cloud_save_sync_dismissed',
  'cloud_save_set_success',
  'cloud_save_set_failed',
  'cloud_save_get_success',
  'cloud_save_get_failed',
  'guest_exit_warning_shown',
  'guest_exit_warning_keep_playing',
  'guest_exit_warning_leave_anyway',
  'guest_exit_warning_signup_clicked',
  'guest_exit_warning_login_clicked',
  'register_from_game_clicked',
  'login_from_game_clicked',
  'registration_completed_from_game',
  'login_completed_from_game',
  'sdk_ready',
  'sdk_error',
  'game_custom_event',
]);

const SOURCE_BY_TYPE: Record<AnalyticsEventType, string> = {
  game_page_view: 'PLAY_PAGE',
  game_launch_requested: 'PLAY_PAGE',
  game_launch_success: 'PLAY_PAGE',
  game_launch_failed: 'PLAY_PAGE',
  play_session_started: 'PLAY_PAGE',
  play_heartbeat: 'PLAY_PAGE',
  play_session_ended: 'PLAY_PAGE',
  cloud_save_cta_shown: 'CLOUD_SAVE',
  cloud_save_cta_signup_clicked: 'CLOUD_SAVE',
  cloud_save_cta_login_clicked: 'CLOUD_SAVE',
  cloud_save_sync_prompt_shown: 'CLOUD_SAVE',
  cloud_save_sync_accepted: 'CLOUD_SAVE',
  cloud_save_sync_dismissed: 'CLOUD_SAVE',
  cloud_save_set_success: 'CLOUD_SAVE',
  cloud_save_set_failed: 'CLOUD_SAVE',
  cloud_save_get_success: 'CLOUD_SAVE',
  cloud_save_get_failed: 'CLOUD_SAVE',
  guest_exit_warning_shown: 'GUEST_EXIT',
  guest_exit_warning_keep_playing: 'GUEST_EXIT',
  guest_exit_warning_leave_anyway: 'GUEST_EXIT',
  guest_exit_warning_signup_clicked: 'GUEST_EXIT',
  guest_exit_warning_login_clicked: 'GUEST_EXIT',
  register_from_game_clicked: 'AUTH',
  login_from_game_clicked: 'AUTH',
  registration_completed_from_game: 'AUTH',
  login_completed_from_game: 'AUTH',
  sdk_ready: 'SDK',
  sdk_error: 'SDK',
  game_custom_event: 'SDK',
};

function assertCollectorOrigin(req: FastifyRequest, webOrigin: string): void {
  const origin = req.headers.origin;
  if (origin && origin !== webOrigin) throw errors.forbidden('Analytics origin is not allowed');
  const referer = req.headers.referer;
  if (!referer) return;
  try {
    if (new URL(referer).origin !== webOrigin) {
      throw errors.forbidden('Analytics referrer is not allowed');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw errors.forbidden('Analytics referrer is not allowed');
  }
}

function actorType(req: FastifyRequest): string {
  const user = req.currentUser;
  if (!user) return 'guest';
  if (user.status === 'SUSPENDED') throw errors.accountSuspended();
  if (user.status === 'BANNED') throw errors.accountBanned();
  if (user.status === 'DELETED') throw errors.unauthorized();
  return user.role.toLowerCase();
}

function invalidAnalyticsInput(details: unknown): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', 'Invalid analytics event', details);
}

export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env } = app;

  async function store(req: FastifyRequest, events: AnalyticsEventInput[]): Promise<number> {
    assertCollectorOrigin(req, env.WEB_ORIGIN);
    const actor = actorType(req);
    const userId = req.currentUser?.id ?? null;
    const gameIds = [...new Set(events.map((event) => event.context.gameId))];
    const sessionIds = [...new Set(events.flatMap((event) => event.context.playSessionId ?? []))];
    const [games, sessions] = await Promise.all([
      prisma.game.findMany({
        where: { id: { in: gameIds } },
        select: { id: true, publishedVersionId: true },
      }),
      sessionIds.length === 0
        ? Promise.resolve([])
        : prisma.playSession.findMany({
            where: { id: { in: sessionIds } },
            select: { id: true, gameId: true, gameVersionId: true, userId: true },
          }),
    ]);
    const gamesById = new Map(games.map((game) => [game.id, game] as const));
    const sessionsById = new Map(sessions.map((session) => [session.id, session] as const));

    const rows: Prisma.AnalyticsEventCreateManyInput[] = events.map((event) => {
      const game = gamesById.get(event.context.gameId);
      if (!game) throw errors.notFound('GAME_NOT_FOUND', 'Game not found');
      const needsSession = SESSION_CONTEXT_EVENTS.has(event.type);
      const submittedSessionId = event.context.playSessionId;
      if (needsSession && !submittedSessionId) {
        throw invalidAnalyticsInput({ reason: 'play_context_required' });
      }
      let versionId: string | null = game.publishedVersionId;
      if (submittedSessionId) {
        const session = sessionsById.get(submittedSessionId);
        if (!session) throw invalidAnalyticsInput({ reason: 'invalid_play_context' });
        if (session.gameId !== event.context.gameId || session.userId !== userId) {
          throw errors.forbidden('Analytics play context does not belong to this actor');
        }
        if (event.context.versionId && event.context.versionId !== session.gameVersionId) {
          throw invalidAnalyticsInput({ reason: 'version_context_mismatch' });
        }
        versionId = session.gameVersionId;
      } else if (event.context.versionId && event.context.versionId !== game.publishedVersionId) {
        throw invalidAnalyticsInput({ reason: 'version_context_mismatch' });
      }
      return {
        type: event.type,
        gameId: event.context.gameId,
        versionId,
        userId,
        actorType: actor,
        source: SOURCE_BY_TYPE[event.type],
        ...(event.metadata
          ? { metadata: event.metadata as Prisma.InputJsonValue }
          : { metadata: {} }),
      };
    });

    await prisma.analyticsEvent.createMany({ data: rows });
    return rows.length;
  }

  app.post(
    '/analytics/events',
    { bodyLimit: 16 * 1024, config: { rateLimit: rlPolicy('analyticsEvents') } },
    async (req, reply) => {
      const parsed = analyticsEventInputSchema.safeParse(req.body);
      if (!parsed.success) throw invalidAnalyticsInput(parsed.error.flatten());
      const accepted = await store(req, [parsed.data]);
      reply.status(202).send({ accepted });
    },
  );

  app.post(
    '/analytics/batch',
    { bodyLimit: 32 * 1024, config: { rateLimit: rlPolicy('analyticsEvents') } },
    async (req, reply) => {
      const parsed = analyticsEventBatchSchema.safeParse(req.body);
      if (!parsed.success) throw invalidAnalyticsInput(parsed.error.flatten());
      const accepted = await store(req, parsed.data.events);
      reply.status(202).send({ accepted });
    },
  );
}
