import {
  analyticsEventInputSchema,
  type AnalyticsEventContext,
  type AnalyticsEventInput,
  type AnalyticsEventType,
} from '@vibeplay/shared';
import { api } from './api';

const ENABLED = import.meta.env.APP_MODE === 'real' && import.meta.env.MODE !== 'test';

export interface AnalyticsEventSender {
  trackAnalyticsEvent(event: AnalyticsEventInput): Promise<void>;
}

export function buildInternalAnalyticsEvent(
  type: AnalyticsEventType,
  context: AnalyticsEventContext,
  metadata?: unknown,
): AnalyticsEventInput | null {
  const parsed = analyticsEventInputSchema.safeParse({ type, context, metadata });
  return parsed.success ? parsed.data : null;
}

/** Analytics failures are swallowed so observability can never break gameplay. */
export async function sendInternalAnalytics(
  event: AnalyticsEventInput,
  sender: AnalyticsEventSender,
): Promise<boolean> {
  try {
    await sender.trackAnalyticsEvent(event);
    return true;
  } catch {
    return false;
  }
}

export function trackInternalEvent(
  type: AnalyticsEventType,
  context: AnalyticsEventContext,
  metadata?: unknown,
): void {
  if (!ENABLED) return;
  const event = buildInternalAnalyticsEvent(type, context, metadata);
  if (!event) return;
  void sendInternalAnalytics(event, api);
}
