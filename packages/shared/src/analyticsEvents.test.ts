import { describe, expect, it } from 'vitest';
import { analyticsEventBatchSchema, analyticsEventInputSchema } from './analyticsEvents.js';

const context = { gameId: 'game12345', versionId: 'version12345', playSessionId: 'play12345' };

describe('analytics event schemas', () => {
  it('accepts allowlisted platform events with their exact metadata', () => {
    expect(
      analyticsEventInputSchema.safeParse({
        type: 'play_heartbeat',
        context,
        metadata: { elapsedSeconds: 45 },
      }).success,
    ).toBe(true);
    expect(
      analyticsEventInputSchema.safeParse({
        type: 'game_launch_failed',
        context: { gameId: context.gameId },
        metadata: { code: 'iframe_load_failed' },
      }).success,
    ).toBe(true);
  });

  it('accepts only bounded flat custom event metadata', () => {
    expect(
      analyticsEventInputSchema.safeParse({
        type: 'game_custom_event',
        context,
        metadata: { name: 'level_started', value: 2, label: 'level_2' },
      }).success,
    ).toBe(true);
    for (const metadata of [
      { name: 'level_started', email: 'private@example.com' },
      { name: 'level_started', nested: { token: 'private' } },
      { name: 'UPPERCASE' },
      { name: 'x'.repeat(41) },
      { name: 'level_started', label: 'x'.repeat(81) },
      { name: 'level_started', value: Number.POSITIVE_INFINITY },
    ]) {
      expect(
        analyticsEventInputSchema.safeParse({ type: 'game_custom_event', context, metadata })
          .success,
      ).toBe(false);
    }
  });

  it('rejects unknown event names, identity fields, nested data, and oversized batches', () => {
    expect(
      analyticsEventInputSchema.safeParse({ type: 'arbitrary_event', context, metadata: {} })
        .success,
    ).toBe(false);
    expect(
      analyticsEventInputSchema.safeParse({
        type: 'sdk_ready',
        context,
        userId: 'spoofed-user',
      }).success,
    ).toBe(false);
    expect(
      analyticsEventInputSchema.safeParse({
        type: 'sdk_error',
        context,
        metadata: { code: 'runtime_error', stack: 'private stack' },
      }).success,
    ).toBe(false);
    expect(
      analyticsEventBatchSchema.safeParse({
        events: Array.from({ length: 21 }, () => ({ type: 'sdk_ready', context })),
      }).success,
    ).toBe(false);
  });
});
