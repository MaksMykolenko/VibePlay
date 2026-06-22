import { describe, expect, it, vi } from 'vitest';
import { buildInternalAnalyticsEvent, sendInternalAnalytics } from './internalAnalytics';

describe('internal analytics client', () => {
  const context = { gameId: 'game12345', versionId: 'version12345', playSessionId: 'play12345' };

  it('builds only allowlisted, flat event payloads', () => {
    expect(
      buildInternalAnalyticsEvent('game_custom_event', context, {
        name: 'level_started',
        value: 1,
      }),
    ).toMatchObject({ type: 'game_custom_event', context });
    expect(
      buildInternalAnalyticsEvent('game_custom_event', context, {
        name: 'level_started',
        saveData: { level: 10 },
      }),
    ).toBeNull();
  });

  it('never throws when delivery fails', async () => {
    const event = buildInternalAnalyticsEvent('sdk_ready', context)!;
    const sender = { trackAnalyticsEvent: vi.fn().mockRejectedValue(new Error('offline')) };
    await expect(sendInternalAnalytics(event, sender)).resolves.toBe(false);
  });
});
