import { describe, expect, it } from 'vitest';
import { sanitizeEventParams, sanitizePagePath, trackEvent } from './analytics';

describe('analytics', () => {
  it('no-ops safely when GA4 is unavailable', () => {
    expect(() => trackEvent('view_home', { source: 'test' })).not.toThrow();
  });

  it('only allows non-personal funnel metadata', () => {
    const safe = sanitizeEventParams({
      game_id: 'game-1',
      game_slug: 'runner',
      source: 'game_detail',
      cta_location: 'near_play',
      role: 'guest',
      logged_in: false,
      email: 'player@example.com',
      name: 'Player Name',
      token: 'secret',
      session_id: 'session-1',
      save_data: { level: 99 },
      object_key: 'private/save.json',
      error_stack: 'stack',
    });

    expect(safe).toEqual({
      game_id: 'game-1',
      game_slug: 'runner',
      source: 'game_detail',
      cta_location: 'near_play',
      role: 'guest',
      logged_in: false,
    });
  });

  it('drops query strings and fragments from page views', () => {
    expect(sanitizePagePath('/verify-email?token=secret&email=user@example.com#done')).toBe(
      '/verify-email',
    );
    expect(sanitizePagePath('https://evil.example/path?token=secret')).toBe('/');
  });
});
