import { z } from 'zod';
import { idSchema } from './schemas.js';

export const ANALYTICS_EVENT_TYPES = [
  'game_page_view',
  'game_launch_requested',
  'game_launch_success',
  'game_launch_failed',
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
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const analyticsEventContextSchema = z
  .object({
    gameId: idSchema,
    versionId: idSchema.optional(),
    /** Verification-only launch context. The collector never persists this value. */
    playSessionId: idSchema.optional(),
  })
  .strict();

const safeCodeSchema = z.string().regex(/^[a-z0-9_.-]{1,40}$/);
const safeLabelSchema = z.string().trim().min(1).max(80);
const noMetadataSchema = z.object({}).strict();
const failureMetadataSchema = z.object({ code: safeCodeSchema }).strict();
const heartbeatMetadataSchema = z
  .object({ elapsedSeconds: z.number().int().min(1).max(86_400) })
  .strict();
const ctaShownMetadataSchema = z
  .object({ trigger: z.enum(['time', 'progress', 'guest_save', 'auth_required']) })
  .strict();
const syncPromptMetadataSchema = z
  .object({ state: z.enum(['save_conflict', 'local_progress']) })
  .strict();
const syncAcceptedMetadataSchema = z
  .object({ choice: z.enum(['replace_cloud', 'local_progress']) })
  .strict();
const syncDismissedMetadataSchema = z
  .object({ choice: z.enum(['keep_cloud', 'keep_local']) })
  .strict();
const saveFailureMetadataSchema = z
  .object({
    code: z.enum([
      'auth_required',
      'too_large',
      'invalid',
      'rate_limited',
      'not_found',
      'unavailable',
      'error',
    ]),
  })
  .strict();
const exitMetadataSchema = z
  .object({
    navigationSource: z.enum([
      'exit_button',
      'internal_link',
      'back_button',
      'refresh',
      'close_tab',
    ]),
  })
  .strict();
const sdkErrorMetadataSchema = z
  .object({ code: safeCodeSchema, label: safeLabelSchema.optional() })
  .strict();
export const analyticsCustomEventMetadataSchema = z
  .object({
    name: safeCodeSchema,
    value: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
    label: safeLabelSchema.optional(),
  })
  .strict();

function eventSchema<TType extends AnalyticsEventType, TMetadata extends z.ZodType>(
  type: TType,
  metadata: TMetadata,
) {
  return z
    .object({
      type: z.literal(type),
      context: analyticsEventContextSchema,
      metadata: metadata.optional(),
    })
    .strict();
}

export const analyticsEventInputSchema = z.discriminatedUnion('type', [
  eventSchema('game_page_view', noMetadataSchema),
  eventSchema('game_launch_requested', noMetadataSchema),
  eventSchema('game_launch_success', noMetadataSchema),
  eventSchema('game_launch_failed', failureMetadataSchema),
  eventSchema('play_session_started', noMetadataSchema),
  eventSchema('play_heartbeat', heartbeatMetadataSchema),
  eventSchema('play_session_ended', noMetadataSchema),
  eventSchema('cloud_save_cta_shown', ctaShownMetadataSchema),
  eventSchema('cloud_save_cta_signup_clicked', noMetadataSchema),
  eventSchema('cloud_save_cta_login_clicked', noMetadataSchema),
  eventSchema('cloud_save_sync_prompt_shown', syncPromptMetadataSchema),
  eventSchema('cloud_save_sync_accepted', syncAcceptedMetadataSchema),
  eventSchema('cloud_save_sync_dismissed', syncDismissedMetadataSchema),
  eventSchema('cloud_save_set_success', noMetadataSchema),
  eventSchema('cloud_save_set_failed', saveFailureMetadataSchema),
  eventSchema('cloud_save_get_success', noMetadataSchema),
  eventSchema('cloud_save_get_failed', saveFailureMetadataSchema),
  eventSchema('guest_exit_warning_shown', exitMetadataSchema),
  eventSchema('guest_exit_warning_keep_playing', exitMetadataSchema),
  eventSchema('guest_exit_warning_leave_anyway', exitMetadataSchema),
  eventSchema('guest_exit_warning_signup_clicked', exitMetadataSchema),
  eventSchema('guest_exit_warning_login_clicked', exitMetadataSchema),
  eventSchema('register_from_game_clicked', noMetadataSchema),
  eventSchema('login_from_game_clicked', noMetadataSchema),
  eventSchema('registration_completed_from_game', noMetadataSchema),
  eventSchema('login_completed_from_game', noMetadataSchema),
  eventSchema('sdk_ready', noMetadataSchema),
  eventSchema('sdk_error', sdkErrorMetadataSchema),
  eventSchema('game_custom_event', analyticsCustomEventMetadataSchema),
]);

export const analyticsEventBatchSchema = z
  .object({ events: z.array(analyticsEventInputSchema).min(1).max(20) })
  .strict();

export type AnalyticsEventInput = z.infer<typeof analyticsEventInputSchema>;
export type AnalyticsEventBatchInput = z.infer<typeof analyticsEventBatchSchema>;
export type AnalyticsEventContext = z.infer<typeof analyticsEventContextSchema>;
export type AnalyticsCustomEventMetadata = z.infer<typeof analyticsCustomEventMetadataSchema>;
