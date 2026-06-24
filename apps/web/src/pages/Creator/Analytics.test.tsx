import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { CreatorAnalyticsDto } from '@vibeplay/shared';
import { I18nContext } from '../../i18n/context';
import { en } from '../../i18n/en';
import { uk } from '../../i18n/uk';
import { CreatorAnalyticsView } from './Analytics';
import { buildChartGeometry } from './chartGeometry';

const translations = en as Record<string, string>;

function t(key: string, params?: Record<string, string | number>): string {
  let value = translations[key] ?? key;
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replaceAll(`{{${name}}}`, String(replacement));
  }
  return value;
}

/** Build a contiguous daily series ending 2026-06-22 for range/scale tests. */
function days(count: number, shape: (index: number) => number): { date: string; plays: number }[] {
  const out: { date: string; plays: number }[] = [];
  const end = new Date('2026-06-22T00:00:00Z');
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), plays: shape(count - 1 - i) });
  }
  return out;
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

function advancedResponse(overrides: Partial<CreatorAnalyticsDto> = {}): CreatorAnalyticsDto {
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
    ...overrides,
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

/** Count distinct rendered chart axis-label elements (ignores modifier classes). */
function countAxisLabels(markup: string): number {
  return (markup.match(/class="ca-chart__xlabel/g) ?? []).length;
}

describe('CreatorAnalyticsView', () => {
  it('renders a stable skeleton state before the API returns', () => {
    const markup = render(null, true);
    expect(markup).toContain('data-testid="analytics-skeleton"');
    expect(markup).toContain('Loading analytics');
    expect(markup).toContain('ca-skel-card');
    expect(markup).toContain('ca-skel-chart');
  });

  it('renders a clean error and retry state', () => {
    const markup = render(null, false, 'Network request failed');
    expect(markup).toContain('Analytics did not load');
    expect(markup).toContain('Analytics could not be loaded: Network request failed');
    expect(markup).toContain('Retry');
    expect(markup).toContain('ca-error');
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

  it('renders the rebuilt KPI grid with real values and no demo data', () => {
    const markup = render(response());
    expect(markup).toContain('ca-kpi-grid');
    expect(markup).toContain('1,234');
    expect(markup).toContain('42');
    expect(markup).toContain('8');
    expect(markup).toContain('1');
    expect(markup).toContain('15');
    expect(markup).toContain('6');
    expect(markup).toContain('2m');
    expect(markup).toContain('Published');
  });

  it('renders the chart section with accessible daily data and a comparison line', () => {
    const markup = render(advancedResponse());
    expect(markup).toContain('Plays over time');
    expect(markup).toContain('aria-label="Daily plays in the selected date range"');
    expect(markup).toContain('Previous period');
    expect(markup).toContain('Jun 22, 2026: 26 plays');
    // Area chart fill + a finite SVG line path (no NaN/Infinity).
    expect(markup).toContain('url(#caPlaysGradient)');
    expect(markup).not.toMatch(/d="[^"]*(NaN|Infinity)/);
    // Interactive layer is present when there is data to inspect.
    expect(markup).toContain('role="slider"');
    expect(markup).toContain('aria-valuemax');
    expect(markup).toContain('ca-chart__hit');
  });

  it('exposes a focusable, labelled interaction layer with a tap hint', () => {
    const markup = render(advancedResponse());
    expect(markup).toContain('role="slider"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('Hover or tap the chart to inspect a day');
  });

  it('renders a lighter no-previous comparison note when change data is missing', () => {
    const base = advancedResponse();
    const markup = render({
      ...base,
      advanced: {
        ...base.advanced!,
        comparison: { ...base.advanced!.comparison, changePercent: null },
      },
    });
    expect(markup).toContain('ca-compare--muted');
    expect(markup).toContain('Not enough previous-period data yet');
  });

  it('renders a polished comparison card with a signed change', () => {
    const markup = render(advancedResponse());
    expect(markup).toContain('ca-compare');
    expect(markup).toContain('+40%');
  });

  it('renders the chart for 7-day and 30-day ranges', () => {
    const sevenDay = advancedResponse({
      timeseries: days(7, (i) => [3, 0, 7, 12, 4, 0, 21][i] ?? 0),
      advanced: null,
      entitlements: { creatorPlus: false, advancedAnalytics: false },
    });
    const markupSeven = render(sevenDay);
    expect(markupSeven).toContain('Plays over time');
    expect(countAxisLabels(markupSeven)).toBeGreaterThanOrEqual(2);
    expect(countAxisLabels(markupSeven)).toBeLessThanOrEqual(7);

    const markupThirty = render(response());
    expect(markupThirty).toContain('url(#caPlaysGradient)');
  });

  it('thins x-axis labels for long 90-day ranges and stays finite', () => {
    const ninety = response({
      timeseries: days(90, (i) => (i % 9 === 0 ? 120 : i % 3 === 0 ? 0 : 12)),
    });
    const markup = render(ninety);
    expect(countAxisLabels(markup)).toBeGreaterThan(0);
    expect(countAxisLabels(markup)).toBeLessThanOrEqual(6);
    expect(markup).not.toMatch(/d="[^"]*(NaN|Infinity)/);
  });

  it('handles very high play counts without breaking the chart', () => {
    const huge = response({
      summary: { ...response().summary, totalPlays: 1234567, playsInRange: 98765 },
      timeseries: days(30, (i) => (i === 15 ? 50000 : i % 4 === 0 ? 8000 : 200)),
    });
    const markup = render(huge);
    expect(markup).toContain('1,234,567');
    expect(markup).not.toMatch(/d="[^"]*(NaN|Infinity)/);
  });

  it('renders a polished empty chart state for zero data instead of a flat line', () => {
    const zero = response({ timeseries: days(30, () => 0) });
    const markup = render(zero);
    expect(markup).toContain('ca-chart__empty');
    expect(markup).toContain('No activity in this window');
    // No area path and no axis labels are drawn when the window is empty.
    expect(markup).not.toContain('url(#caPlaysGradient)');
    expect(countAxisLabels(markup)).toBe(0);
    // No interaction layer when the window is empty (no broken tooltip behavior).
    expect(markup).not.toContain('role="slider"');
  });

  it('groups internal events into product categories', () => {
    const markup = render(response());
    expect(markup).toContain('VibePlay internal events');
    expect(markup).toContain('ca-events-grid');
    expect(markup).toContain('Launch');
    expect(markup).toContain('Cloud Saves');
    expect(markup).toContain('Guest Exit');
    expect(markup).toContain('Registration/Login');
    expect(markup).toContain('SDK/Custom');
    expect(markup).toContain('Top games by successful launches');
  });

  it('renders the redesigned top games layout', () => {
    const markup = render(response());
    expect(markup).toContain('creator-analytics-top-grid');
    expect(markup).toContain('creator-analytics-top-row');
    expect(markup).toContain('ca-rank');
    expect(markup).toContain('Real Game');
  });

  it('renders the polished Creator Plus upgrade prompt for Free creators', () => {
    const markup = render(response());
    expect(markup).toContain('ca-locked');
    expect(markup).toContain('Detailed analytics are included with Creator Plus');
    expect(markup).toContain('Player mix');
    expect(markup).toContain('Version comparison');
    expect(markup).not.toContain('Guest vs signed-in split');
  });

  it('renders advanced analytics split into clear subsections', () => {
    const markup = render(advancedResponse());
    expect(markup).toContain('Advanced Analytics');
    expect(markup).toContain('ca-kpi-grid--six');
    expect(markup).toContain('ca-grid-2');
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
      'analytics.changeIncrease',
      'analytics.comparisonThisPeriod',
      'analytics.comparisonPrevPeriod',
      'analytics.playerMixAria',
      'analytics.tooltip.current',
      'analytics.tooltip.previous',
      'analytics.tooltip.delta',
      'analytics.tooltip.noPrevious',
      'analytics.chart.activePoint',
      'analytics.chart.tapHint',
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

describe('buildChartGeometry', () => {
  it('produces normalized points with previous-period values', () => {
    const geo = buildChartGeometry(
      [
        { date: '2026-06-20', plays: 4 },
        { date: '2026-06-21', plays: 12 },
        { date: '2026-06-22', plays: 26 },
      ],
      [{ previousPlays: 2 }, { previousPlays: 8 }, { previousPlays: 20 }],
    );
    expect(geo.points).toHaveLength(3);
    expect(geo.points[0].x).toBe(0);
    expect(geo.points[1].x).toBe(50);
    expect(geo.points[2].x).toBe(100);
    expect(geo.points[2].value).toBe(26);
    expect(geo.points[2].previousValue).toBe(20);
    expect(geo.peak).toBe(26);
    expect(geo.maxValue).toBe(30); // nice-rounded headroom above the actual peak
    expect(geo.hasCurrentValues).toBe(true);
    expect(geo.hasPreviousValues).toBe(true);
    expect(geo.previousPath).not.toBe('');
    expect(geo.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('stays finite for all-zero data and reports no current values', () => {
    const geo = buildChartGeometry(
      [
        { date: '2026-06-20', plays: 0 },
        { date: '2026-06-21', plays: 0 },
        { date: '2026-06-22', plays: 0 },
      ],
      [],
    );
    expect(geo.hasCurrentValues).toBe(false);
    expect(geo.previousPath).toBe('');
    expect(geo.points.every((p) => Number.isFinite(p.y) && p.previousValue === null)).toBe(true);
  });

  it('omits previous values when no comparison series is provided', () => {
    const geo = buildChartGeometry(
      [
        { date: '2026-06-20', plays: 4 },
        { date: '2026-06-21', plays: 26 },
      ],
      [],
    );
    expect(geo.points[0].previousValue).toBeNull();
    expect(geo.points[1].previousY).toBeNull();
    expect(geo.hasPreviousValues).toBe(false);
  });

  it('handles high spike values without overflowing the plot', () => {
    const geo = buildChartGeometry(
      [
        { date: '2026-06-20', plays: 200 },
        { date: '2026-06-21', plays: 50000 },
      ],
      [],
    );
    expect(geo.peak).toBe(50000);
    expect(geo.maxValue).toBeGreaterThanOrEqual(50000);
    expect(geo.points.every((p) => p.y >= 0 && p.y <= 100)).toBe(true);
  });
});
