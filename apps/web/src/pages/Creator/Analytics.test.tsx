import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { CreatorAnalyticsDto } from '@vibeplay/shared';
import { I18nContext } from '../../i18n/context';
import { en } from '../../i18n/en';
import { uk } from '../../i18n/uk';
import { CreatorAnalyticsView } from './Analytics';

const translations = en as Record<string, string>;

function t(key: string, params?: Record<string, string | number>): string {
  let value = translations[key] ?? key;
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replaceAll(`{{${name}}}`, String(replacement));
  }
  return value;
}

function response(overrides: Partial<CreatorAnalyticsDto> = {}): CreatorAnalyticsDto {
  return {
    range: '30d',
    period: { from: '2026-05-24', to: '2026-06-22' },
    summary: {
      totalGames: 3,
      publishedGames: 1,
      inModerationGames: 1,
      draftGames: 1,
      rejectedGames: 0,
      totalPlays: 1234,
      playsInRange: 42,
      likes: 15,
      comments: 6,
      averageDurationSeconds: 120,
    },
    timeseries: [
      { date: '2026-06-20', plays: 4 },
      { date: '2026-06-21', plays: 12 },
      { date: '2026-06-22', plays: 26 },
    ],
    topGames: [
      {
        gameId: 'game-1',
        slug: 'real-game',
        title: 'Real Game',
        plays: 42,
        likes: 15,
        comments: 6,
      },
    ],
    recentActivity: [
      { type: 'PLAY', count: 42, latestAt: '2026-06-22T10:00:00Z' },
      { type: 'LIKE', count: 3, latestAt: null },
      { type: 'COMMENT', count: 2, latestAt: null },
    ],
    eventMetrics: {
      launchSuccesses: 8,
      launchFailures: 1,
      playsStarted: 9,
      recent: [
        { type: 'game_launch_requested', count: 10 },
        { type: 'game_launch_success', count: 8 },
        { type: 'game_launch_failed', count: 1 },
        { type: 'play_session_started', count: 9 },
        { type: 'cloud_save_cta_shown', count: 5 },
        { type: 'guest_exit_warning_shown', count: 2 },
        { type: 'register_from_game_clicked', count: 4 },
        { type: 'sdk_ready', count: 7 },
        { type: 'game_custom_event', count: 3 },
      ],
      topGamesByLaunch: [{ gameId: 'game-1', slug: 'real-game', title: 'Real Game', launches: 8 }],
    },
    entitlements: { creatorPlus: false, advancedAnalytics: false },
    advanced: null,
    ...overrides,
  };
}

function advancedResponse(): CreatorAnalyticsDto {
  return response({
    entitlements: { creatorPlus: true, advancedAnalytics: true },
    advanced: {
      uniquePlayers: 20,
      loggedInPlays: 25,
      guestPlays: 17,
      returningPlayers: 8,
      cloudSaveUsers: 5,
      cloudSaveAdoptionPercent: 25,
      durationPercentiles: { p50Seconds: 60, p90Seconds: 300 },
      comparison: {
        previousPeriodPlays: 30,
        changePercent: 40,
        daily: [
          { date: '2026-06-20', plays: 4, previousDate: '2026-05-21', previousPlays: 2 },
          { date: '2026-06-21', plays: 12, previousDate: '2026-05-22', previousPlays: 8 },
          { date: '2026-06-22', plays: 26, previousDate: '2026-05-23', previousPlays: 20 },
        ],
      },
      games: [
        {
          gameId: 'game-1',
          slug: 'real-game',
          title: 'Real Game',
          plays: 42,
          uniquePlayers: 20,
          loggedInPlays: 25,
          guestPlays: 17,
          averageDurationSeconds: 180,
          cloudSaveUsers: 5,
          versions: [{ versionId: 'v1', version: '1.0.0', plays: 42 }],
        },
      ],
      conversion: {
        registrationCta: 'AVAILABLE',
        registrationClicks: 4,
        registrationCompletions: 2,
        loginClicks: 3,
        loginCompletions: 2,
      },
      eventInsights: {
        launchSuccessRate: 88.9,
        launchFailureReasons: [{ code: 'iframe_load_failed', count: 1 }],
        cloudSaveFunnel: {
          ctaShown: 5,
          signupClicks: 2,
          loginClicks: 1,
          syncPrompts: 2,
          syncAccepted: 1,
        },
        guestExitActions: [{ type: 'guest_exit_warning_shown', count: 2 }],
        customEvents: [{ name: 'level_started', count: 3 }],
        versions: [
          {
            gameId: 'game-1',
            gameTitle: 'Real Game',
            versionId: 'v1',
            version: '1.0.0',
            events: 8,
            launchSuccesses: 7,
            launchFailures: 1,
          },
        ],
      },
    },
  });
}

function render(analytics: CreatorAnalyticsDto | null, loading = false, error = ''): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <I18nContext.Provider value={{ locale: 'en', setLocale: () => undefined, t }}>
        <CreatorAnalyticsView
          analytics={analytics}
          range="30d"
          loading={loading}
          error={error}
          onRangeChange={() => undefined}
          onRetry={() => undefined}
        />
      </I18nContext.Provider>
    </MemoryRouter>,
  );
}

describe('CreatorAnalyticsView', () => {
  it('renders a stable skeleton state before the API returns', () => {
    const markup = render(null, true);
    expect(markup).toContain('data-testid="analytics-skeleton"');
    expect(markup).toContain('Loading analytics');
  });

  it('renders a clean error and retry state', () => {
    const markup = render(null, false, 'Network request failed');
    expect(markup).toContain('Analytics did not load');
    expect(markup).toContain('Analytics could not be loaded: Network request failed');
    expect(markup).toContain('Retry');
  });

  it('renders an honest no-games empty state', () => {
    const empty = response({
      summary: {
        totalGames: 0,
        publishedGames: 0,
        inModerationGames: 0,
        draftGames: 0,
        rejectedGames: 0,
        totalPlays: 0,
        playsInRange: 0,
        likes: 0,
        comments: 0,
        averageDurationSeconds: null,
      },
      timeseries: [{ date: '2026-06-22', plays: 0 }],
      topGames: [],
      eventMetrics: {
        launchSuccesses: 0,
        launchFailures: 0,
        playsStarted: 0,
        recent: [],
        topGamesByLaunch: [],
      },
    });
    const markup = render(empty);
    expect(markup).toContain('No games published yet');
    expect(markup).toContain('Publish a game');
    expect(markup).toContain('No activity in this window');
  });

  it('renders KPI cards with real values', () => {
    const markup = render(response());
    expect(markup).toContain('1,234');
    expect(markup).toContain('42');
    expect(markup).toContain('8');
    expect(markup).toContain('1');
    expect(markup).toContain('15');
    expect(markup).toContain('6');
    expect(markup).toContain('2m');
    expect(markup).toContain('Published');
  });

  it('renders the chart section with accessible daily data', () => {
    const markup = render(advancedResponse());
    expect(markup).toContain('Plays over time');
    expect(markup).toContain('aria-label="Daily plays in the selected date range"');
    expect(markup).toContain('Previous period');
    expect(markup).toContain('Jun 22, 2026: 26 plays');
  });

  it('groups internal events into product categories', () => {
    const markup = render(response());
    expect(markup).toContain('VibePlay internal events');
    expect(markup).toContain('Launch');
    expect(markup).toContain('Cloud Saves');
    expect(markup).toContain('Guest Exit');
    expect(markup).toContain('Registration/Login');
    expect(markup).toContain('SDK/Custom');
    expect(markup).toContain('Top games by successful launches');
  });

  it('renders the polished Creator Plus upgrade prompt for Free creators', () => {
    const markup = render(response());
    expect(markup).toContain('Detailed analytics are included with Creator Plus');
    expect(markup).toContain('Player mix');
    expect(markup).toContain('Version comparison');
    expect(markup).not.toContain('Guest vs signed-in split');
  });

  it('renders advanced analytics for Creator Plus/Admin/Owner data', () => {
    const markup = render(advancedResponse());
    expect(markup).toContain('Advanced Analytics');
    expect(markup).toContain('Guest vs signed-in split');
    expect(markup).toContain('Launch diagnostics');
    expect(markup).toContain('Custom event summaries');
    expect(markup).toContain('level_started');
    expect(markup).not.toContain('Detailed analytics are included with Creator Plus');
  });

  it('includes mobile-friendly structural classes for top games and range controls', () => {
    const markup = render(response());
    expect(markup).toContain('creator-analytics-range');
    expect(markup).toContain('creator-analytics-top-row');
    expect(markup).toContain('creator-analytics-mobile-label');
  });

  it('has matching English and Ukrainian translation keys used by the dashboard', () => {
    const requiredKeys = [
      'analytics.verifiedBadge',
      'analytics.metricHelper.launchSuccesses',
      'analytics.chartEmptyTitle',
      'analytics.eventGroup.cloudSaves',
      'analytics.locked.versionComparison',
      'analytics.playerMixTitle',
      'analytics.versionComparisonTitle',
      'analytics.noCustomEvents',
    ];
    for (const key of requiredKeys) {
      expect(en).toHaveProperty(key);
      expect(uk).toHaveProperty(key);
    }
  });

  it('does not introduce demo or mock analytics copy', () => {
    const markup = render(response()).toLowerCase();
    expect(markup).not.toContain('demo analytics');
    expect(markup).not.toContain('mock analytics');
  });
});
