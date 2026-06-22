import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { CreatorAnalyticsDto } from '@vibeplay/shared';
import { I18nContext } from '../../i18n/context';
import { CreatorAnalyticsView } from './Analytics';

const translations: Record<string, string> = {
  'analytics.loading': 'Loading analytics',
  'analytics.title': 'Creator Analytics',
  'analytics.subtitle': 'Verified platform sessions',
  'analytics.range': 'Date range',
  'analytics.range7d': 'Last 7 days',
  'analytics.range30d': 'Last 30 days',
  'analytics.range90d': 'Last 90 days',
  'analytics.totalPlays': 'Total plays',
  'analytics.playsInRange': 'Plays in range',
  'analytics.likes': 'Likes',
  'analytics.comments': 'Comments',
  'analytics.published': 'Published',
  'analytics.inModeration': 'In moderation',
  'analytics.averageSession': 'Average completed session',
  'analytics.minutesShort': '{{count}}m',
  'analytics.secondsShort': '{{count}}s',
  'analytics.gamesTotal': '{{count}} games total',
  'analytics.drafts': '{{count}} drafts',
  'analytics.rejected': '{{count}} rejected',
  'analytics.emptyTitle': 'No play data yet',
  'analytics.emptyBody': 'Analytics will appear after players launch your games.',
  'analytics.topGames': 'Top games by plays',
  'analytics.game': 'Game',
  'analytics.plays': 'Plays',
  'analytics.recentActivity': 'Recent activity summary',
  'analytics.activityPLAY': '{{count}} plays',
  'analytics.activityLIKE': '{{count}} new likes',
  'analytics.activityCOMMENT': '{{count}} new comments',
  'analytics.noActivity': 'No activity',
  'analytics.creatorPlusTitle': 'Detailed analytics are included with Creator Plus',
  'analytics.creatorPlusBody': 'Unlock advanced metrics.',
  'billing.upgrade': 'Upgrade',
  'analytics.advancedTitle': 'Advanced Analytics',
  'analytics.advancedBody': 'Aggregated metrics only.',
  'analytics.uniquePlayers': 'Unique signed-in players',
  'analytics.loggedInPlays': 'Signed-in plays',
  'analytics.guestPlays': 'Guest plays',
  'analytics.returningPlayers': 'Returning players',
  'analytics.cloudSaveUsers': 'Cloud save users',
  'analytics.cloudSaveAdoption': 'Cloud save adoption',
  'analytics.percent': '{{count}}%',
  'analytics.durationP50': 'Median completed session',
  'analytics.durationP90': '90th percentile session',
  'analytics.periodComparison': 'Previous period comparison',
  'analytics.previousPeriodPlays': '{{count}} plays in the previous period',
  'analytics.notEnoughComparison': 'Not enough comparison data',
  'analytics.perGame': 'Per-game analytics',
  'analytics.conversionTitle': 'Registration conversion',
  'analytics.conversionUnavailable': 'Not enough internal data yet.',
};

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
      totalGames: 2,
      publishedGames: 1,
      inModerationGames: 1,
      draftGames: 0,
      rejectedGames: 0,
      totalPlays: 1234,
      playsInRange: 42,
      likes: 15,
      comments: 6,
      averageDurationSeconds: 120,
    },
    timeseries: [{ date: '2026-06-22', plays: 42 }],
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
      { type: 'PLAY', count: 42, latestAt: null },
      { type: 'LIKE', count: 3, latestAt: null },
      { type: 'COMMENT', count: 2, latestAt: null },
    ],
    eventMetrics: {
      launchSuccesses: 8,
      launchFailures: 1,
      playsStarted: 9,
      recent: [{ type: 'game_launch_success', count: 8 }],
      topGamesByLaunch: [{ gameId: 'game-1', slug: 'real-game', title: 'Real Game', launches: 8 }],
    },
    entitlements: { creatorPlus: false, advancedAnalytics: false },
    advanced: null,
    ...overrides,
  };
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
        />
      </I18nContext.Provider>
    </MemoryRouter>,
  );
}

describe('CreatorAnalyticsView', () => {
  it('renders a loading state before the API returns', () => {
    expect(render(null, true)).toContain('Loading analytics');
  });

  it('renders real summary values and the Free upgrade prompt', () => {
    const markup = render(response());
    expect(markup).toContain('1,234');
    expect(markup).toContain('42');
    expect(markup).toContain('Real Game');
    expect(markup).toContain('Detailed analytics are included with Creator Plus');
    expect(markup).not.toContain('Advanced Analytics');
  });

  it('renders the honest empty state without a fake graph', () => {
    const empty = response({
      summary: {
        totalGames: 1,
        publishedGames: 1,
        inModerationGames: 0,
        draftGames: 0,
        rejectedGames: 0,
        totalPlays: 0,
        playsInRange: 0,
        likes: 0,
        comments: 0,
        averageDurationSeconds: null,
      },
      timeseries: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-06-${String(index + 1).padStart(2, '0')}`,
        plays: 0,
      })),
      topGames: [],
    });
    const markup = render(empty);
    expect(markup).toContain('No play data yet');
    expect(markup).toContain('Analytics will appear after players launch your games.');
    expect(markup).not.toContain('aria-label="analytics.chartLabel"');
  });

  it('renders Creator Plus advanced metrics when the API includes them', () => {
    const advanced = response({
      entitlements: { creatorPlus: true, advancedAnalytics: true },
      advanced: {
        uniquePlayers: 20,
        loggedInPlays: 25,
        guestPlays: 17,
        returningPlayers: 8,
        cloudSaveUsers: 5,
        cloudSaveAdoptionPercent: 25,
        durationPercentiles: { p50Seconds: 60, p90Seconds: 300 },
        comparison: { previousPeriodPlays: 30, changePercent: 40, daily: [] },
        games: [],
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
          guestExitActions: [],
          customEvents: [{ name: 'level_started', count: 3 }],
          versions: [],
        },
      },
    });
    const markup = render(advanced);
    expect(markup).toContain('Advanced Analytics');
    expect(markup).toContain('Unique signed-in players');
    expect(markup).toContain('Cloud save adoption');
    expect(markup).toContain('Registration conversion');
    expect(markup).not.toContain('Detailed analytics are included with Creator Plus');
  });
});
