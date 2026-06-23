import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AnalyticsEventType,
  CreatorAnalyticsDto,
  CreatorAnalyticsRange,
} from '@vibeplay/shared';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Cloud,
  Gamepad2,
  Gauge,
  LockKeyhole,
  MessageSquare,
  Minus,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/api/errors';
import { useI18n } from '../../i18n/useI18n';
import {
  formatCompactNumber,
  formatDate,
  formatNumber,
  formatShortDate,
} from '../../lib/formatTime';

interface CreatorAnalyticsViewProps {
  analytics: CreatorAnalyticsDto | null;
  range: CreatorAnalyticsRange;
  loading: boolean;
  error: string;
  onRangeChange: (range: CreatorAnalyticsRange) => void;
  onRetry: () => void;
}

type Tone = 'success' | 'warning' | 'danger' | 'info';

interface KpiCard {
  key: string;
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: Tone;
}

interface EventGroupDefinition {
  id: string;
  titleKey: string;
  helperKey: string;
  icon: LucideIcon;
  types: AnalyticsEventType[];
}

const RANGE_OPTIONS: CreatorAnalyticsRange[] = ['7d', '30d', '90d'];

/** Maximum number of x-axis date labels rendered, regardless of range length. */
const MAX_AXIS_LABELS = 6;

const EVENT_GROUPS: EventGroupDefinition[] = [
  {
    id: 'launch',
    titleKey: 'analytics.eventGroup.launch',
    helperKey: 'analytics.eventGroup.launchHelper',
    icon: Gauge,
    types: ['game_launch_requested', 'game_launch_success', 'game_launch_failed'],
  },
  {
    id: 'play',
    titleKey: 'analytics.eventGroup.play',
    helperKey: 'analytics.eventGroup.playHelper',
    icon: Play,
    types: ['game_page_view', 'play_session_started', 'play_heartbeat', 'play_session_ended'],
  },
  {
    id: 'cloudSaves',
    titleKey: 'analytics.eventGroup.cloudSaves',
    helperKey: 'analytics.eventGroup.cloudSavesHelper',
    icon: Cloud,
    types: [
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
    ],
  },
  {
    id: 'guestExit',
    titleKey: 'analytics.eventGroup.guestExit',
    helperKey: 'analytics.eventGroup.guestExitHelper',
    icon: RotateCcw,
    types: [
      'guest_exit_warning_shown',
      'guest_exit_warning_keep_playing',
      'guest_exit_warning_leave_anyway',
      'guest_exit_warning_signup_clicked',
      'guest_exit_warning_login_clicked',
    ],
  },
  {
    id: 'registration',
    titleKey: 'analytics.eventGroup.registration',
    helperKey: 'analytics.eventGroup.registrationHelper',
    icon: Users,
    types: [
      'register_from_game_clicked',
      'login_from_game_clicked',
      'registration_completed_from_game',
      'login_completed_from_game',
    ],
  },
  {
    id: 'sdkCustom',
    titleKey: 'analytics.eventGroup.sdkCustom',
    helperKey: 'analytics.eventGroup.sdkCustomHelper',
    icon: Sparkles,
    types: ['sdk_ready', 'sdk_error', 'game_custom_event'],
  },
];

const toneIconClass = (tone?: Tone): string => (tone ? `ca-icon ca-icon--${tone}` : 'ca-icon');

/** Evenly spaced indices (always including the first and last) for axis labels. */
function pickAxisIndices(length: number, max: number): number[] {
  if (length <= 0) return [];
  if (length <= max) return Array.from({ length }, (_, index) => index);
  const step = (length - 1) / (max - 1);
  const seen = new Set<number>();
  for (let k = 0; k < max; k += 1) seen.add(Math.round(k * step));
  return [...seen].sort((a, b) => a - b);
}

export const CreatorAnalytics: React.FC = () => {
  const [range, setRange] = useState<CreatorAnalyticsRange>('30d');
  const [requestId, setRequestId] = useState(0);
  const [result, setResult] = useState<{
    range: CreatorAnalyticsRange | null;
    requestId: number;
    analytics: CreatorAnalyticsDto | null;
    error: string;
  }>({ range: null, requestId: -1, analytics: null, error: '' });

  useEffect(() => {
    let active = true;
    api
      .creatorAnalytics(range)
      .then((value) => {
        if (active) setResult({ range, requestId, analytics: value, error: '' });
      })
      .catch((reason) => {
        if (active) {
          setResult({ range, requestId, analytics: null, error: errorMessage(reason) });
        }
      });
    return () => {
      active = false;
    };
  }, [range, requestId]);

  const hasCurrentRange = result.range === range;
  const hasCurrentRequest = hasCurrentRange && result.requestId === requestId;

  return (
    <CreatorAnalyticsView
      analytics={hasCurrentRange ? result.analytics : null}
      range={range}
      loading={!hasCurrentRequest}
      error={hasCurrentRequest ? result.error : ''}
      onRangeChange={setRange}
      onRetry={() => setRequestId((value) => value + 1)}
    />
  );
};

export const CreatorAnalyticsView: React.FC<CreatorAnalyticsViewProps> = ({
  analytics,
  range,
  loading,
  error,
  onRangeChange,
  onRetry,
}) => {
  const { t, locale } = useI18n();
  const duration = useCallback(
    (seconds: number | null): string => {
      if (seconds === null) return t('analytics.notEnoughData');
      if (seconds < 60) return t('analytics.secondsShort', { count: Math.round(seconds) });
      return t('analytics.minutesShort', { count: Math.round(seconds / 60) });
    },
    [t],
  );
  const percent = useCallback(
    (value: number | null): string =>
      value === null
        ? t('analytics.notEnoughData')
        : t('analytics.percent', { count: formatNumber(value, locale) }),
    [locale, t],
  );

  const kpis = useMemo<KpiCard[]>(() => {
    if (!analytics) return [];
    return [
      {
        key: 'totalPlays',
        label: t('analytics.totalPlays'),
        value: formatNumber(analytics.summary.totalPlays, locale),
        helper: t('analytics.metricHelper.totalPlays'),
        icon: Play,
        tone: 'success',
      },
      {
        key: 'playsInRange',
        label: t('analytics.playsInRange'),
        value: formatNumber(analytics.summary.playsInRange, locale),
        helper: t('analytics.metricHelper.playsInRange'),
        icon: TrendingUp,
      },
      {
        key: 'launchSuccesses',
        label: t('analytics.launchSuccesses'),
        value: formatNumber(analytics.eventMetrics.launchSuccesses, locale),
        helper: t('analytics.metricHelper.launchSuccesses'),
        icon: CheckCircle2,
        tone: 'success',
      },
      {
        key: 'launchFailures',
        label: t('analytics.launchFailures'),
        value: formatNumber(analytics.eventMetrics.launchFailures, locale),
        helper: t('analytics.metricHelper.launchFailures'),
        icon: AlertTriangle,
        tone: analytics.eventMetrics.launchFailures > 0 ? 'danger' : 'info',
      },
      {
        key: 'likes',
        label: t('analytics.likes'),
        value: formatNumber(analytics.summary.likes, locale),
        helper: t('analytics.metricHelper.likes'),
        icon: ThumbsUp,
      },
      {
        key: 'comments',
        label: t('analytics.comments'),
        value: formatNumber(analytics.summary.comments, locale),
        helper: t('analytics.metricHelper.comments'),
        icon: MessageSquare,
      },
      {
        key: 'averageSession',
        label: t('analytics.averageSession'),
        value: duration(analytics.summary.averageDurationSeconds),
        helper: t('analytics.metricHelper.averageSession'),
        icon: Clock,
        tone: 'warning',
      },
      {
        key: 'published',
        label: t('analytics.published'),
        value: formatNumber(analytics.summary.publishedGames, locale),
        helper: t('analytics.metricHelper.published'),
        icon: Gamepad2,
      },
    ];
  }, [analytics, duration, locale, t]);

  return (
    <div className="ca-page animate-fade">
      <AnalyticsHeader
        analytics={analytics}
        errorOnly={Boolean(error && !analytics)}
        loading={loading}
        range={range}
        onRangeChange={onRangeChange}
        onRefresh={onRetry}
      />

      {loading && !analytics ? <AnalyticsSkeleton /> : null}

      {error ? <ErrorPanel message={error} onRetry={onRetry} /> : null}

      {analytics ? (
        <>
          <section className="ca-kpi-grid" aria-label={t('analytics.title')}>
            {kpis.map((card) => (
              <MetricCard key={card.key} card={card} />
            ))}
          </section>

          <PortfolioStrip analytics={analytics} />

          {analytics.summary.totalGames === 0 ? (
            <EmptyState
              icon={Gamepad2}
              title={t('analytics.noGamesTitle')}
              body={t('analytics.noGamesBody')}
              action={
                <Link to="/creator/publish" className="btn btn-primary btn-sm">
                  {t('analytics.publishFirstGame')}
                </Link>
              }
            />
          ) : analytics.summary.totalPlays === 0 ? (
            <EmptyState
              icon={Play}
              title={t('analytics.noPlaysTitle')}
              body={t('analytics.noPlaysBody')}
              action={
                <Link to="/creator/my-games" className="btn btn-secondary btn-sm">
                  {t('analytics.reviewPublishedGames')}
                </Link>
              }
            />
          ) : null}

          <PlayTrendChart analytics={analytics} />

          <TopGamesSection analytics={analytics} />

          <ActivitySection analytics={analytics} />

          <InternalEventsSection analytics={analytics} />

          {!analytics.entitlements.advancedAnalytics || !analytics.advanced ? (
            <CreatorPlusUpsell />
          ) : (
            <AdvancedAnalytics analytics={analytics} duration={duration} percent={percent} />
          )}
        </>
      ) : null}
    </div>
  );
};

const AnalyticsHeader: React.FC<{
  analytics: CreatorAnalyticsDto | null;
  errorOnly: boolean;
  loading: boolean;
  range: CreatorAnalyticsRange;
  onRangeChange: (range: CreatorAnalyticsRange) => void;
  onRefresh: () => void;
}> = ({ analytics, errorOnly, loading, range, onRangeChange, onRefresh }) => {
  const { t, locale } = useI18n();
  return (
    <header className="ca-card bg-glass ca-header">
      <div className="ca-header__copy">
        <span className="badge badge-primary ca-header__badge">
          <ShieldCheck size={14} aria-hidden="true" />
          {t('analytics.verifiedBadge')}
        </span>
        <div>
          <h1 className="ca-title">{t('analytics.title')}</h1>
          <p className="ca-subtitle">{t('analytics.subtitle')}</p>
        </div>
        {analytics ? (
          <div className="ca-meta">
            <span>
              <Clock size={13} aria-hidden="true" />
              {t('analytics.dataWindow', {
                from: formatDate(analytics.period.from, locale),
                to: formatDate(analytics.period.to, locale),
              })}
            </span>
            <span>
              {t('analytics.updatedThrough', {
                date: formatDate(analytics.period.to, locale),
              })}
            </span>
          </div>
        ) : errorOnly ? (
          <div className="ca-meta">
            <span>{t('analytics.errorMeta')}</span>
          </div>
        ) : null}
      </div>
      <div className="ca-header__controls">
        {loading && analytics ? (
          <span className="ca-refreshing">
            <RefreshCw size={14} aria-hidden="true" />
            {t('analytics.refreshing')}
          </span>
        ) : null}
        <div className="creator-analytics-range" role="group" aria-label={t('analytics.range')}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => onRangeChange(option)}
            >
              {t(`analytics.range${option}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRefresh}
          disabled={loading && !analytics}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {t('analytics.refresh')}
        </button>
      </div>
    </header>
  );
};

const AnalyticsSkeleton: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="ca-skeleton" aria-busy="true" data-testid="analytics-skeleton">
      <span className="ca-visually-hidden">{t('analytics.loading')}</span>
      <div className="ca-card ca-section">
        <span className="skeleton ca-skel-line" style={{ width: '40%', height: 26 }} />
        <span className="skeleton ca-skel-line" style={{ width: '64%' }} />
      </div>
      <div className="ca-kpi-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="ca-card skeleton ca-skel-card" />
        ))}
      </div>
      <div className="skeleton ca-skel-chart" />
    </div>
  );
};

const ErrorPanel: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => {
  const { t } = useI18n();
  return (
    <section className="ca-error" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div className="ca-error__body">
        <h2>{t('analytics.errorTitle')}</h2>
        <p>{t('analytics.loadError', { message })}</p>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
        <RefreshCw size={15} aria-hidden="true" />
        {t('analytics.retry')}
      </button>
    </section>
  );
};

const MetricCard: React.FC<{ card: KpiCard }> = ({ card }) => {
  const Icon = card.icon;
  return (
    <article className="ca-card ca-kpi">
      <div className="ca-kpi__top">
        <span className="ca-kpi__label">{card.label}</span>
        <span className={toneIconClass(card.tone)}>
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <strong className="ca-kpi__value">{card.value}</strong>
      <span className="ca-kpi__helper">{card.helper}</span>
    </article>
  );
};

const PortfolioStrip: React.FC<{ analytics: CreatorAnalyticsDto }> = ({ analytics }) => {
  const { t, locale } = useI18n();
  const items = [
    { label: t('analytics.totalGames'), value: analytics.summary.totalGames },
    { label: t('analytics.inModeration'), value: analytics.summary.inModerationGames },
    { label: t('analytics.draftGames'), value: analytics.summary.draftGames },
    { label: t('analytics.rejectedGames'), value: analytics.summary.rejectedGames },
  ];
  return (
    <section className="ca-card ca-portfolio" aria-label={t('analytics.portfolioHealth')}>
      <div className="ca-section__heading">
        <h2 className="ca-section__title">{t('analytics.portfolioHealth')}</h2>
        <p className="ca-section__desc">{t('analytics.portfolioHealthBody')}</p>
      </div>
      <div className="ca-portfolio__pills">
        {items.map((item) => (
          <span key={item.label} className="ca-tag">
            <strong>{formatNumber(item.value, locale)}</strong>
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
};

const PlayTrendChart: React.FC<{ analytics: CreatorAnalyticsDto }> = ({ analytics }) => {
  const { t, locale } = useI18n();
  const current = analytics.timeseries;
  const advanced =
    analytics.entitlements.advancedAnalytics && analytics.advanced ? analytics.advanced : null;
  const previous = advanced ? advanced.comparison.daily : [];
  const hasCurrentValues = current.some((day) => day.plays > 0);
  const hasPreviousValues = previous.some((day) => day.previousPlays > 0);
  const peak = current.reduce((max, day) => Math.max(max, day.plays), 0);
  const maxValue = Math.max(1, peak, ...previous.map((day) => day.previousPlays));
  const count = current.length;

  const x = (index: number): number => (count > 1 ? (index / (count - 1)) * 100 : 50);
  const y = (value: number): number => 100 - (value / maxValue) * 100;

  const linePath =
    count > 0 ? `M ${current.map((d, i) => `${x(i)},${y(d.plays)}`).join(' L ')}` : '';
  const areaPath =
    count > 0
      ? `M ${x(0)},100 ${current.map((d, i) => `L ${x(i)},${y(d.plays)}`).join(' ')} L ${x(
          count - 1,
        )},100 Z`
      : '';
  const previousPath = hasPreviousValues
    ? `M ${previous.map((d, i) => `${x(i)},${y(d.previousPlays)}`).join(' L ')}`
    : '';

  const axisIndices = pickAxisIndices(count, MAX_AXIS_LABELS);
  const gridLines = [0, 25, 50, 75];

  return (
    <section className="ca-card ca-section ca-chart-card" aria-labelledby="ca-plays-title">
      <div className="ca-section__head">
        <div className="ca-section__heading">
          <h2 id="ca-plays-title" className="ca-section__title">
            <BarChart3 size={20} aria-hidden="true" />
            {t('analytics.playTrend')}
          </h2>
          <p className="ca-section__desc">{t('analytics.chartSummary')}</p>
        </div>
        <div className="ca-section__aside">
          <span className="ca-tag">
            {t('analytics.chartTotal', {
              count: formatNumber(analytics.summary.playsInRange, locale),
            })}
          </span>
          <span className="ca-tag">
            {t('analytics.chartPeak', { count: formatNumber(peak, locale) })}
          </span>
        </div>
      </div>

      <div className="ca-chart">
        <div className="ca-chart__canvas">
          <div className="ca-chart__plot">
            <svg
              className="ca-chart__svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label={t('analytics.chartLabel')}
            >
              <defs>
                <linearGradient id="caPlaysGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {gridLines.map((line) => (
                <line
                  key={line}
                  x1="0"
                  x2="100"
                  y1={line}
                  y2={line}
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <line
                x1="0"
                x2="100"
                y1="100"
                y2="100"
                stroke="var(--border-strong)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {hasCurrentValues ? <path d={areaPath} fill="url(#caPlaysGradient)" /> : null}
              {hasPreviousValues ? (
                <path
                  d={previousPath}
                  fill="none"
                  stroke="var(--info)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {hasCurrentValues ? (
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
          </div>

          {hasCurrentValues
            ? [0, 0.5, 1].map((fraction) => (
                <span
                  key={fraction}
                  className="ca-chart__ylabel"
                  style={{ top: `calc(14px + (100% - 44px) * ${fraction})` }}
                >
                  {formatCompactNumber(Math.round(maxValue * (1 - fraction)), locale)}
                </span>
              ))
            : null}

          {hasCurrentValues
            ? axisIndices.map((index, position) => {
                const isFirst = position === 0;
                const isLast = position === axisIndices.length - 1;
                const fraction = count > 1 ? index / (count - 1) : 0.5;
                const className =
                  'ca-chart__xlabel' +
                  (isFirst ? ' ca-chart__xlabel--first' : '') +
                  (isLast ? ' ca-chart__xlabel--last' : '');
                const style: React.CSSProperties = isFirst
                  ? { left: '46px' }
                  : isLast
                    ? { right: '14px', left: 'auto' }
                    : { left: `calc(46px + (100% - 60px) * ${fraction})` };
                return (
                  <span key={current[index].date} className={className} style={style}>
                    {formatShortDate(current[index].date, locale)}
                  </span>
                );
              })
            : null}

          {!hasCurrentValues ? (
            <div className="ca-chart__empty">
              <strong>{t('analytics.chartEmptyTitle')}</strong>
              <span>{t('analytics.chartEmptyBody')}</span>
            </div>
          ) : null}
        </div>

        <div className="ca-chart__footer">
          <div className="ca-legend">
            <span className="ca-legend__item">
              <span className="ca-legend__swatch" style={{ background: 'var(--primary)' }} />
              {t('analytics.chartCurrentPeriod')}
            </span>
            {hasPreviousValues ? (
              <span className="ca-legend__item">
                <span className="ca-legend__swatch ca-legend__swatch--line" />
                {t('analytics.chartPreviousPeriod')}
              </span>
            ) : null}
          </div>
        </div>

        {advanced ? (
          <ComparisonCard advanced={advanced} playsInRange={analytics.summary.playsInRange} />
        ) : null}

        <ul className="ca-visually-hidden">
          {current.map((day) => (
            <li key={day.date}>
              {t('analytics.dailyPlays', {
                date: formatDate(day.date, locale),
                count: formatNumber(day.plays, locale),
              })}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

const ComparisonCard: React.FC<{
  advanced: NonNullable<CreatorAnalyticsDto['advanced']>;
  playsInRange: number;
}> = ({ advanced, playsInRange }) => {
  const { t, locale } = useI18n();
  const change = advanced.comparison.changePercent;

  if (change === null) {
    return (
      <div className="ca-compare" role="group" aria-label={t('analytics.periodComparison')}>
        <span className="ca-compare__delta ca-compare__delta--flat">
          <Minus size={16} aria-hidden="true" />
          {t('analytics.notEnoughComparison')}
        </span>
      </div>
    );
  }

  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const DirIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const signed = `${change > 0 ? '+' : ''}${formatNumber(change, locale)}`;
  const srKey =
    direction === 'up'
      ? 'analytics.changeIncrease'
      : direction === 'down'
        ? 'analytics.changeDecrease'
        : 'analytics.changeNoChange';

  return (
    <div className="ca-compare" role="group" aria-label={t('analytics.periodComparison')}>
      <span className={`ca-compare__delta ca-compare__delta--${direction}`}>
        <DirIcon size={16} aria-hidden="true" />
        {t('analytics.percent', { count: signed })}
        <span className="ca-visually-hidden">{t(srKey)}</span>
      </span>
      <span className="ca-compare__detail">
        <strong>{formatNumber(playsInRange, locale)}</strong>
        {t('analytics.comparisonThisPeriod')}
      </span>
      <span className="ca-compare__detail">
        <strong>{formatNumber(advanced.comparison.previousPeriodPlays, locale)}</strong>
        {t('analytics.comparisonPrevPeriod')}
      </span>
    </div>
  );
};

const TopGamesSection: React.FC<{ analytics: CreatorAnalyticsDto }> = ({ analytics }) => {
  const { t, locale } = useI18n();
  const launchesByGame = new Map(
    analytics.eventMetrics.topGamesByLaunch.map((game) => [game.gameId, game.launches]),
  );
  return (
    <section className="ca-card ca-section" aria-labelledby="ca-top-games-title">
      <div className="ca-section__head">
        <div className="ca-section__heading">
          <h2 id="ca-top-games-title" className="ca-section__title">
            <Gamepad2 size={20} aria-hidden="true" />
            {t('analytics.topGames')}
          </h2>
          <p className="ca-section__desc">{t('analytics.topGamesBody')}</p>
        </div>
      </div>

      {analytics.topGames.length === 0 ? (
        <InlineEmptyState
          icon={Gamepad2}
          title={t('analytics.noTopGamesTitle')}
          body={t('analytics.noTopGames')}
        />
      ) : (
        <div className="creator-analytics-top-grid">
          <div className="creator-analytics-top-header" aria-hidden="true">
            <span>{t('analytics.game')}</span>
            <span>{t('analytics.plays')}</span>
            <span>{t('analytics.launches')}</span>
            <span>{t('analytics.likes')}</span>
            <span>{t('analytics.comments')}</span>
            <span>{t('analytics.playShare')}</span>
          </div>
          {analytics.topGames.map((game, index) => {
            const launches = launchesByGame.get(game.gameId) ?? 0;
            const share =
              analytics.summary.playsInRange > 0
                ? Math.round((game.plays / analytics.summary.playsInRange) * 100)
                : 0;
            return (
              <div key={game.gameId} className="creator-analytics-top-row">
                <div className="creator-analytics-top-game">
                  <span className="ca-rank" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="ca-top-game__meta">
                    <Link to={`/game/${game.slug}`} className="ca-game-link" title={game.title}>
                      {game.title}
                    </Link>
                    <span className="ca-top-game__sub">
                      {t('analytics.launchCount', { count: formatNumber(launches, locale) })}
                    </span>
                  </div>
                </div>
                <MetricCell label={t('analytics.plays')} value={formatNumber(game.plays, locale)} />
                <MetricCell
                  label={t('analytics.launches')}
                  value={formatNumber(launches, locale)}
                />
                <MetricCell label={t('analytics.likes')} value={formatNumber(game.likes, locale)} />
                <MetricCell
                  label={t('analytics.comments')}
                  value={formatNumber(game.comments, locale)}
                />
                <div className="ca-top-cell ca-top-cell--share">
                  <span className="badge badge-secondary">
                    {t('analytics.percent', { count: share })}
                  </span>
                  <Link to={`/game/${game.slug}`} className="ca-open-link">
                    {t('analytics.openGame')}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

const MetricCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="ca-top-cell">
    <span className="creator-analytics-mobile-label">{label}</span>
    <strong>{value}</strong>
  </div>
);

const ActivitySection: React.FC<{ analytics: CreatorAnalyticsDto }> = ({ analytics }) => {
  const { t, locale } = useI18n();
  return (
    <section className="ca-card ca-section" aria-labelledby="ca-activity-title">
      <div className="ca-section__heading">
        <h2 id="ca-activity-title" className="ca-section__title">
          <Activity size={20} aria-hidden="true" />
          {t('analytics.recentActivity')}
        </h2>
        <p className="ca-section__desc">{t('analytics.recentActivityBody')}</p>
      </div>
      <div className="ca-activity-grid">
        {analytics.recentActivity.map((activity) => {
          const Icon =
            activity.type === 'PLAY' ? Play : activity.type === 'LIKE' ? ThumbsUp : MessageSquare;
          return (
            <article key={activity.type} className="ca-activity">
              <Icon size={18} aria-hidden="true" />
              <strong>
                {t(`analytics.activity${activity.type}`, {
                  count: formatNumber(activity.count, locale),
                })}
              </strong>
              <span>
                {activity.latestAt
                  ? t('analytics.latestAt', { date: formatDate(activity.latestAt, locale) })
                  : t('analytics.noActivity')}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
};

const InternalEventsSection: React.FC<{ analytics: CreatorAnalyticsDto }> = ({ analytics }) => {
  const { t, locale } = useI18n();
  const eventCounts = useMemo(() => {
    const counts = new Map<AnalyticsEventType, number>(
      analytics.eventMetrics.recent.map((event) => [event.type, event.count]),
    );
    counts.set('game_launch_success', analytics.eventMetrics.launchSuccesses);
    counts.set('game_launch_failed', analytics.eventMetrics.launchFailures);
    counts.set('play_session_started', analytics.eventMetrics.playsStarted);
    return counts;
  }, [analytics.eventMetrics]);
  const totalKnownEvents = [...eventCounts.values()].reduce((sum, value) => sum + value, 0);

  return (
    <section className="ca-card ca-section" aria-labelledby="ca-internal-events-title">
      <div className="ca-section__head">
        <div className="ca-section__heading">
          <h2 id="ca-internal-events-title" className="ca-section__title">
            <ShieldCheck size={20} aria-hidden="true" />
            {t('analytics.internalEventsTitle')}
          </h2>
          <p className="ca-section__desc">{t('analytics.internalEventsBody')}</p>
        </div>
        <div className="ca-section__aside">
          <span className="ca-tag">
            <strong>{formatNumber(analytics.eventMetrics.launchSuccesses, locale)}</strong>
            {t('analytics.launchSuccesses')}
          </span>
          <span className="ca-tag">
            <strong>{formatNumber(analytics.eventMetrics.launchFailures, locale)}</strong>
            {t('analytics.launchFailures')}
          </span>
          <span className="ca-tag">
            <strong>{formatNumber(analytics.eventMetrics.playsStarted, locale)}</strong>
            {t('analytics.playsStarted')}
          </span>
        </div>
      </div>

      {totalKnownEvents === 0 ? (
        <InlineEmptyState
          icon={Activity}
          title={t('analytics.noInternalEventsTitle')}
          body={t('analytics.noInternalEvents')}
        />
      ) : (
        <>
          <div className="ca-events-grid">
            {EVENT_GROUPS.map((group) => {
              const Icon = group.icon;
              const groupEvents = group.types
                .map((type) => ({ type, count: eventCounts.get(type) ?? 0 }))
                .filter((event) => event.count > 0);
              const groupTotal = groupEvents.reduce((sum, event) => sum + event.count, 0);
              const isEmpty = groupTotal === 0;
              return (
                <article
                  key={group.id}
                  className={`ca-event-group${isEmpty ? ' ca-event-group--empty' : ''}`}
                >
                  <div className="ca-event-group__head">
                    <span className={toneIconClass(isEmpty ? undefined : 'info')}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <h3 className="ca-event-group__title">{t(group.titleKey)}</h3>
                      <p className="ca-event-group__desc">{t(group.helperKey)}</p>
                    </div>
                  </div>
                  {isEmpty ? (
                    <span className="ca-muted">{t('analytics.eventGroupNoEvents')}</span>
                  ) : (
                    <>
                      <strong className="ca-event-group__total">
                        {t('analytics.eventGroupTotal', {
                          count: formatNumber(groupTotal, locale),
                        })}
                      </strong>
                      <div className="ca-chips">
                        {groupEvents.slice(0, 4).map((event) => (
                          <span key={event.type} className="ca-chip">
                            <span
                              className="ca-chip__label"
                              title={t(`analytics.event.${event.type}`)}
                            >
                              {t(`analytics.event.${event.type}`)}
                            </span>
                            <strong>{formatNumber(event.count, locale)}</strong>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>

          {analytics.eventMetrics.topGamesByLaunch.length > 0 ? (
            <div>
              <p className="ca-subgrid-title">{t('analytics.topLaunchesTitle')}</p>
              <div className="ca-sublist" style={{ marginTop: '0.6rem' }}>
                {analytics.eventMetrics.topGamesByLaunch.slice(0, 5).map((game) => (
                  <Link key={game.gameId} to={`/game/${game.slug}`} className="ca-sublist__row">
                    <span title={game.title}>{game.title}</span>
                    <strong>
                      {t('analytics.launchCount', { count: formatNumber(game.launches, locale) })}
                    </strong>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

const CreatorPlusUpsell: React.FC = () => {
  const { t } = useI18n();
  const locked = [
    'analytics.locked.playerMix',
    'analytics.locked.launchRate',
    'analytics.locked.cloudSaveFunnel',
    'analytics.locked.customEvents',
    'analytics.locked.versionComparison',
    'analytics.locked.retention',
  ];
  return (
    <section className="ca-locked" aria-labelledby="ca-creator-plus-title">
      <span className="ca-locked__icon" aria-hidden="true">
        <LockKeyhole size={26} />
      </span>
      <div className="ca-locked__body">
        <span className="badge badge-primary">{t('analytics.freeAdvancedEyebrow')}</span>
        <h2 id="ca-creator-plus-title" className="ca-locked__title">
          {t('analytics.creatorPlusTitle')}
        </h2>
        <p className="ca-section__desc">{t('analytics.creatorPlusBody')}</p>
        <div className="ca-locked__features">
          {locked.map((key) => (
            <span key={key} className="ca-locked__feature">
              <Sparkles size={14} aria-hidden="true" />
              {t(key)}
            </span>
          ))}
        </div>
      </div>
      <Link to="/settings/billing" className="btn btn-primary ca-locked__cta">
        {t('billing.upgrade')}
      </Link>
    </section>
  );
};

const AdvancedAnalytics: React.FC<{
  analytics: CreatorAnalyticsDto;
  duration: (seconds: number | null) => string;
  percent: (value: number | null) => string;
}> = ({ analytics, duration, percent }) => {
  const { t, locale } = useI18n();
  const advanced = analytics.advanced!;
  const totalAudiencePlays = advanced.loggedInPlays + advanced.guestPlays;
  const signedInShare =
    totalAudiencePlays > 0 ? Math.round((advanced.loggedInPlays / totalAudiencePlays) * 100) : 0;
  const guestShare =
    totalAudiencePlays > 0 ? Math.round((advanced.guestPlays / totalAudiencePlays) * 100) : 0;
  const conversionAvailable = advanced.conversion.registrationCta !== 'NOT_ENOUGH_INTERNAL_DATA';

  const overviewCards: KpiCard[] = [
    {
      key: 'uniquePlayers',
      label: t('analytics.uniquePlayers'),
      value: formatNumber(advanced.uniquePlayers, locale),
      helper: t('analytics.metricHelper.uniquePlayers'),
      icon: Users,
    },
    {
      key: 'returningPlayers',
      label: t('analytics.returningPlayers'),
      value: formatNumber(advanced.returningPlayers, locale),
      helper: t('analytics.metricHelper.returningPlayers'),
      icon: RotateCcw,
    },
    {
      key: 'cloudSaveUsers',
      label: t('analytics.cloudSaveUsers'),
      value: formatNumber(advanced.cloudSaveUsers, locale),
      helper: t('analytics.metricHelper.cloudSaveUsers'),
      icon: Save,
    },
    {
      key: 'cloudSaveAdoption',
      label: t('analytics.cloudSaveAdoption'),
      value: percent(advanced.cloudSaveAdoptionPercent),
      helper: t('analytics.metricHelper.cloudSaveAdoption'),
      icon: Cloud,
      tone: 'info',
    },
    {
      key: 'p50',
      label: t('analytics.durationP50'),
      value: duration(advanced.durationPercentiles?.p50Seconds ?? null),
      helper: t('analytics.metricHelper.durationP50'),
      icon: Clock,
      tone: 'warning',
    },
    {
      key: 'p90',
      label: t('analytics.durationP90'),
      value: duration(advanced.durationPercentiles?.p90Seconds ?? null),
      helper: t('analytics.metricHelper.durationP90'),
      icon: Clock,
      tone: 'warning',
    },
  ];

  return (
    <section className="ca-advanced" aria-labelledby="ca-advanced-title">
      <div className="ca-card bg-glass ca-advanced__head">
        <span className="badge badge-primary">{t('analytics.advancedBadge')}</span>
        <h2 id="ca-advanced-title" className="ca-advanced__title">
          {t('analytics.advancedTitle')}
        </h2>
        <p className="ca-section__desc">{t('analytics.advancedBody')}</p>
      </div>

      <div className="ca-kpi-grid ca-kpi-grid--six">
        {overviewCards.map((card) => (
          <MetricCard key={card.key} card={card} />
        ))}
      </div>

      <div className="ca-grid-2">
        <section className="ca-card ca-section">
          <div className="ca-section__heading">
            <h3 className="ca-section__title">
              <Users size={19} aria-hidden="true" />
              {t('analytics.playerMixTitle')}
            </h3>
            <p className="ca-section__desc">{t('analytics.playerMixBody')}</p>
          </div>
          <div
            className="ca-splitbar"
            role="img"
            aria-label={t('analytics.playerMixAria', {
              signed: signedInShare,
              guest: guestShare,
            })}
          >
            <span
              className="ca-splitbar__seg ca-splitbar__seg--primary"
              style={{ width: `${signedInShare}%` }}
            />
            <span
              className="ca-splitbar__seg ca-splitbar__seg--info"
              style={{ width: `${guestShare}%` }}
            />
          </div>
          <div className="ca-split-stats">
            <span>
              <strong>{formatNumber(advanced.loggedInPlays, locale)}</strong>
              <span>
                <span
                  className="ca-dot"
                  style={{ background: 'var(--primary)' }}
                  aria-hidden="true"
                />
                {t('analytics.signedInShare', { count: signedInShare })}
              </span>
            </span>
            <span>
              <strong>{formatNumber(advanced.guestPlays, locale)}</strong>
              <span>
                <span className="ca-dot" style={{ background: 'var(--info)' }} aria-hidden="true" />
                {t('analytics.guestShare', { count: guestShare })}
              </span>
            </span>
          </div>
        </section>

        <section className="ca-card ca-section">
          <div className="ca-section__heading">
            <h3 className="ca-section__title">
              <Gauge size={19} aria-hidden="true" />
              {t('analytics.launchDiagnostics')}
            </h3>
            <p className="ca-section__desc">
              {t('analytics.launchDiagnosticsBody', {
                rate: percent(advanced.eventInsights.launchSuccessRate),
              })}
            </p>
          </div>
          {advanced.eventInsights.launchFailureReasons.length > 0 ? (
            <div className="ca-chips">
              {advanced.eventInsights.launchFailureReasons.map((reason) => (
                <span key={reason.code} className="ca-chip">
                  <span className="ca-chip__label" title={reason.code}>
                    {reason.code}
                  </span>
                  <strong>{formatNumber(reason.count, locale)}</strong>
                </span>
              ))}
            </div>
          ) : (
            <span className="ca-muted">{t('analytics.noFailureCodes')}</span>
          )}
        </section>
      </div>

      <div className="ca-grid-2">
        <section className="ca-card ca-section">
          <div className="ca-section__heading">
            <h3 className="ca-section__title">
              <Cloud size={19} aria-hidden="true" />
              {t('analytics.cloudSaveFunnel')}
            </h3>
            <p className="ca-section__desc">
              {t('analytics.cloudSaveFunnelValues', {
                shown: formatNumber(advanced.eventInsights.cloudSaveFunnel.ctaShown, locale),
                clicked: formatNumber(
                  advanced.eventInsights.cloudSaveFunnel.signupClicks +
                    advanced.eventInsights.cloudSaveFunnel.loginClicks,
                  locale,
                ),
                synced: formatNumber(advanced.eventInsights.cloudSaveFunnel.syncAccepted, locale),
              })}
            </p>
          </div>
          <div className="ca-pill-grid">
            <MetricPill
              label={t('analytics.cloudSavePrompts')}
              value={formatNumber(advanced.eventInsights.cloudSaveFunnel.ctaShown, locale)}
            />
            <MetricPill
              label={t('analytics.cloudSaveClicks')}
              value={formatNumber(
                advanced.eventInsights.cloudSaveFunnel.signupClicks +
                  advanced.eventInsights.cloudSaveFunnel.loginClicks,
                locale,
              )}
            />
            <MetricPill
              label={t('analytics.cloudSaveSynced')}
              value={formatNumber(advanced.eventInsights.cloudSaveFunnel.syncAccepted, locale)}
            />
          </div>
        </section>

        <section className="ca-card ca-section">
          <div className="ca-section__heading">
            <h3 className="ca-section__title">
              <TrendingUp size={19} aria-hidden="true" />
              {t('analytics.conversionTitle')}
            </h3>
            <p className="ca-section__desc">
              {conversionAvailable
                ? t('analytics.conversionBody')
                : t('analytics.notEnoughInternalData')}
            </p>
          </div>
          <div className="ca-pill-grid">
            <MetricPill
              label={t('analytics.registrationClicks')}
              value={formatNumber(advanced.conversion.registrationClicks, locale)}
            />
            <MetricPill
              label={t('analytics.registrationCompletions')}
              value={formatNumber(advanced.conversion.registrationCompletions, locale)}
            />
            <MetricPill
              label={t('analytics.loginCompletions')}
              value={formatNumber(advanced.conversion.loginCompletions, locale)}
            />
          </div>
        </section>
      </div>

      <section className="ca-card ca-section">
        <div className="ca-section__head">
          <div className="ca-section__heading">
            <h3 className="ca-section__title">
              <Gamepad2 size={19} aria-hidden="true" />
              {t('analytics.perGame')}
            </h3>
            <p className="ca-section__desc">{t('analytics.perGameBody')}</p>
          </div>
          <span className="badge badge-secondary">
            {t('analytics.previousPeriodPlays', {
              count: formatNumber(advanced.comparison.previousPeriodPlays, locale),
            })}
          </span>
        </div>
        {advanced.games.length === 0 ? (
          <InlineEmptyState
            icon={Gamepad2}
            title={t('analytics.noAdvancedGamesTitle')}
            body={t('analytics.noAdvancedGames')}
          />
        ) : (
          <div className="ca-sublist">
            {advanced.games.map((game) => (
              <div key={game.gameId} className="ca-game-row">
                <div className="ca-game-row__meta">
                  <Link to={`/game/${game.slug}`} className="ca-game-link" title={game.title}>
                    {game.title}
                  </Link>
                  <p>
                    {t('analytics.gameBreakdown', {
                      plays: formatNumber(game.plays, locale),
                      players: formatNumber(game.uniquePlayers, locale),
                      guests: formatNumber(game.guestPlays, locale),
                    })}
                  </p>
                </div>
                <MetricPill
                  label={t('analytics.averageSession')}
                  value={duration(game.averageDurationSeconds)}
                />
                <MetricPill
                  label={t('analytics.cloudSaveUsers')}
                  value={formatNumber(game.cloudSaveUsers, locale)}
                />
                <MetricPill
                  label={t('analytics.versionComparisonTitle')}
                  value={
                    game.versions.length > 0
                      ? game.versions
                          .slice(0, 2)
                          .map((version) =>
                            t('analytics.versionPlays', {
                              version: version.version,
                              count: formatNumber(version.plays, locale),
                            }),
                          )
                          .join(', ')
                      : t('analytics.noVersionData')
                  }
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="ca-grid-2">
        <section className="ca-card ca-section">
          <div className="ca-section__heading">
            <h3 className="ca-section__title">
              <Sparkles size={19} aria-hidden="true" />
              {t('analytics.customEventsTitle')}
            </h3>
          </div>
          {advanced.eventInsights.customEvents.length > 0 ? (
            <div className="ca-chips">
              {advanced.eventInsights.customEvents.map((event) => (
                <span key={event.name} className="ca-chip">
                  <span className="ca-chip__label" title={event.name}>
                    {event.name}
                  </span>
                  <strong>{formatNumber(event.count, locale)}</strong>
                </span>
              ))}
            </div>
          ) : (
            <InlineEmptyState
              icon={Sparkles}
              title={t('analytics.noCustomEventsTitle')}
              body={t('analytics.noCustomEvents')}
            />
          )}
        </section>

        <section className="ca-card ca-section">
          <div className="ca-section__heading">
            <h3 className="ca-section__title">
              <BarChart3 size={19} aria-hidden="true" />
              {t('analytics.versionComparisonTitle')}
            </h3>
          </div>
          {advanced.eventInsights.versions.length > 0 ? (
            <div className="ca-sublist">
              {advanced.eventInsights.versions.slice(0, 5).map((version) => (
                <div key={`${version.gameId}-${version.versionId}`} className="ca-version-row">
                  <span className="ca-version-row__name">
                    <strong title={version.gameTitle}>{version.gameTitle}</strong>
                    <small>{t('analytics.versionLabel', { version: version.version })}</small>
                  </span>
                  <MetricPill
                    label={t('analytics.launchSuccesses')}
                    value={formatNumber(version.launchSuccesses, locale)}
                  />
                  <MetricPill
                    label={t('analytics.launchFailures')}
                    value={formatNumber(version.launchFailures, locale)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <InlineEmptyState
              icon={BarChart3}
              title={t('analytics.noVersionComparisonTitle')}
              body={t('analytics.noVersionComparison')}
            />
          )}
        </section>
      </div>
    </section>
  );
};

const MetricPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="ca-pill">
    <small>{label}</small>
    <strong>{value}</strong>
  </span>
);

const EmptyState: React.FC<{
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, body, action }) => (
  <section className="ca-card ca-empty">
    <span className="ca-empty__icon" aria-hidden="true">
      <Icon size={26} />
    </span>
    <div>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
    {action}
  </section>
);

const InlineEmptyState: React.FC<{ icon: LucideIcon; title: string; body: string }> = ({
  icon: Icon,
  title,
  body,
}) => (
  <div className="ca-inline-empty">
    <Icon size={22} aria-hidden="true" />
    <div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  </div>
);
