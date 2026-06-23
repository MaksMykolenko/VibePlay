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
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/api/errors';
import { useI18n } from '../../i18n/useI18n';
import { formatDate, formatNumber } from '../../lib/formatTime';

interface CreatorAnalyticsViewProps {
  analytics: CreatorAnalyticsDto | null;
  range: CreatorAnalyticsRange;
  loading: boolean;
  error: string;
  onRangeChange: (range: CreatorAnalyticsRange) => void;
  onRetry: () => void;
}

interface KpiCard {
  key: string;
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: 'success' | 'warning' | 'danger' | 'info';
}

interface EventGroupDefinition {
  id: string;
  titleKey: string;
  helperKey: string;
  icon: LucideIcon;
  types: AnalyticsEventType[];
}

const RANGE_OPTIONS: CreatorAnalyticsRange[] = ['7d', '30d', '90d'];

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
  const percent = (value: number | null): string =>
    value === null
      ? t('analytics.notEnoughData')
      : t('analytics.percent', { count: formatNumber(value, locale) });

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

  const showErrorOnly = error && !analytics;

  return (
    <div style={containerStyle} className="animate-fade">
      <AnalyticsHeader
        analytics={analytics}
        errorOnly={Boolean(showErrorOnly)}
        loading={loading}
        range={range}
        onRangeChange={onRangeChange}
        onRefresh={onRetry}
      />

      {loading && !analytics ? <AnalyticsSkeleton /> : null}

      {error ? <ErrorPanel message={error} onRetry={onRetry} /> : null}

      {analytics ? (
        <>
          <section style={kpiGridStyle} data-layout="responsive-grid">
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

          <div style={contentGridStyle}>
            <TopGamesSection analytics={analytics} />
            <ActivitySection analytics={analytics} />
          </div>

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
    <header style={headerStyle} className="bg-glass">
      <div style={headerCopyStyle}>
        <span className="badge badge-primary" style={verifiedBadgeStyle}>
          <ShieldCheck size={14} aria-hidden="true" />
          {t('analytics.verifiedBadge')}
        </span>
        <div>
          <h1 style={titleStyle}>{t('analytics.title')}</h1>
          <p style={subtitleStyle}>{t('analytics.subtitle')}</p>
        </div>
        {analytics ? (
          <div style={metaRowStyle}>
            <span>
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
          <div style={metaRowStyle}>
            <span>{t('analytics.errorMeta')}</span>
          </div>
        ) : null}
      </div>
      <div style={headerControlsStyle}>
        {loading && analytics ? (
          <span style={refreshingPillStyle}>
            <RefreshCw size={14} aria-hidden="true" />
            {t('analytics.refreshing')}
          </span>
        ) : null}
        <div
          className="creator-analytics-range"
          style={rangeGroupStyle}
          role="group"
          aria-label={t('analytics.range')}
        >
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => onRangeChange(option)}
              style={range === option ? activeRangeButtonStyle : rangeButtonStyle}
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
          style={refreshButtonStyle}
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
    <section
      style={skeletonWrapStyle}
      className="bg-glass"
      aria-busy="true"
      data-testid="analytics-skeleton"
    >
      <div style={skeletonHeaderStyle}>
        <span style={skeletonLineStyle} />
        <span style={{ ...skeletonLineStyle, width: '34%' }} />
      </div>
      <div style={kpiGridStyle}>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} style={skeletonCardStyle}>
            <span style={{ ...skeletonLineStyle, width: '42%' }} />
            <span style={{ ...skeletonLineStyle, width: '62%', height: 30 }} />
            <span style={{ ...skeletonLineStyle, width: '70%' }} />
          </div>
        ))}
      </div>
      <div style={skeletonChartStyle}>
        <span style={skeletonLineStyle}>{t('analytics.loading')}</span>
      </div>
    </section>
  );
};

const ErrorPanel: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => {
  const { t } = useI18n();
  return (
    <section style={errorPanelStyle} role="alert">
      <AlertTriangle size={22} aria-hidden="true" />
      <div style={{ flex: 1 }}>
        <h2 style={compactTitleStyle}>{t('analytics.errorTitle')}</h2>
        <p style={descriptionStyle}>{t('analytics.loadError', { message })}</p>
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
    <article style={metricCardStyle} className="bg-glass">
      <div style={metricCardHeaderStyle}>
        <span style={metricLabelStyle}>{card.label}</span>
        <span style={iconBubbleStyle(card.tone)}>
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <strong style={metricValueStyle}>{card.value}</strong>
      <span style={metricHelperStyle}>{card.helper}</span>
    </article>
  );
};

const PortfolioStrip: React.FC<{ analytics: CreatorAnalyticsDto }> = ({ analytics }) => {
  const { t, locale } = useI18n();
  const items = [
    {
      label: t('analytics.totalGames'),
      value: analytics.summary.totalGames,
    },
    {
      label: t('analytics.inModeration'),
      value: analytics.summary.inModerationGames,
    },
    {
      label: t('analytics.draftGames'),
      value: analytics.summary.draftGames,
    },
    {
      label: t('analytics.rejectedGames'),
      value: analytics.summary.rejectedGames,
    },
  ];
  return (
    <section style={portfolioStripStyle} aria-label={t('analytics.portfolioHealth')}>
      <div>
        <h2 style={compactTitleStyle}>{t('analytics.portfolioHealth')}</h2>
        <p style={descriptionStyle}>{t('analytics.portfolioHealthBody')}</p>
      </div>
      <div style={portfolioMetricsStyle}>
        {items.map((item) => (
          <span key={item.label} style={portfolioPillStyle}>
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
  const previous =
    analytics.entitlements.advancedAnalytics && analytics.advanced
      ? analytics.advanced.comparison.daily
      : [];
  const hasCurrentValues = current.some((day) => day.plays > 0);
  const hasPreviousValues = previous.some((day) => day.previousPlays > 0);
  const maxValue = Math.max(
    1,
    ...current.map((day) => day.plays),
    ...previous.map((day) => day.previousPlays),
  );
  const width = 820;
  const height = 300;
  const pad = { top: 22, right: 18, bottom: 48, left: 44 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const barSlot = current.length > 0 ? plotWidth / current.length : plotWidth;
  const barWidth = Math.max(5, Math.min(22, barSlot * 0.56));
  const previousPoints = previous.map((day, index) => {
    const x = pad.left + barSlot * index + barSlot / 2;
    const y = pad.top + plotHeight - (day.previousPlays / maxValue) * plotHeight;
    return `${x},${y}`;
  });
  const firstDate = current[0]?.date;
  const middleDate = current[Math.floor(current.length / 2)]?.date;
  const lastDate = current[current.length - 1]?.date;

  return (
    <section style={chartCardStyle} className="bg-glass" aria-labelledby="plays-over-time-title">
      <div style={sectionHeaderStyle}>
        <div>
          <h2 id="plays-over-time-title" style={sectionTitleStyle}>
            <BarChart3 size={20} aria-hidden="true" />
            {t('analytics.playTrend')}
          </h2>
          <p style={descriptionStyle}>{t('analytics.chartSummary')}</p>
        </div>
        <div style={chartStatsStyle}>
          <span>
            {t('analytics.chartTotal', {
              count: formatNumber(analytics.summary.playsInRange, locale),
            })}
          </span>
          <span>
            {t('analytics.chartPeak', {
              count: formatNumber(Math.max(0, ...current.map((day) => day.plays)), locale),
            })}
          </span>
        </div>
      </div>

      <div style={chartFrameStyle}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t('analytics.chartLabel')}
          style={chartSvgStyle}
          preserveAspectRatio="none"
        >
          <line
            x1={pad.left}
            y1={pad.top + plotHeight}
            x2={width - pad.right}
            y2={pad.top + plotHeight}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
          {[0.25, 0.5, 0.75, 1].map((tick) => {
            const y = pad.top + plotHeight - plotHeight * tick;
            return (
              <line
                key={tick}
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                stroke="var(--border-subtle)"
                strokeWidth="1"
              />
            );
          })}
          {hasPreviousValues ? (
            <polyline
              points={previousPoints.join(' ')}
              fill="none"
              stroke="var(--info)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.82"
            />
          ) : null}
          {current.map((day, index) => {
            const x = pad.left + barSlot * index + (barSlot - barWidth) / 2;
            const barHeight = (day.plays / maxValue) * plotHeight;
            const y = pad.top + plotHeight - barHeight;
            return (
              <rect
                key={day.date}
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(day.plays > 0 ? 2 : 0, barHeight)}
                rx="5"
                fill="var(--primary)"
                opacity={day.plays > 0 ? 0.95 : 0.22}
              >
                <title>
                  {t('analytics.dailyPlays', {
                    date: formatDate(day.date, locale),
                    count: formatNumber(day.plays, locale),
                  })}
                </title>
              </rect>
            );
          })}
          {firstDate ? (
            <text x={pad.left} y={height - 18} fill="var(--text-muted)" fontSize="18">
              {formatDate(firstDate, locale)}
            </text>
          ) : null}
          {middleDate ? (
            <text
              x={width / 2}
              y={height - 18}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="18"
            >
              {formatDate(middleDate, locale)}
            </text>
          ) : null}
          {lastDate ? (
            <text
              x={width - pad.right}
              y={height - 18}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize="18"
            >
              {formatDate(lastDate, locale)}
            </text>
          ) : null}
        </svg>
        {!hasCurrentValues ? (
          <div style={chartEmptyOverlayStyle}>
            <strong>{t('analytics.chartEmptyTitle')}</strong>
            <span>{t('analytics.chartEmptyBody')}</span>
          </div>
        ) : null}
      </div>

      <div style={legendStyle}>
        <span style={legendItemStyle}>
          <span style={{ ...legendSwatchStyle, background: 'var(--primary)' }} />
          {t('analytics.chartCurrentPeriod')}
        </span>
        {hasPreviousValues ? (
          <span style={legendItemStyle}>
            <span style={{ ...legendSwatchStyle, background: 'var(--info)' }} />
            {t('analytics.chartPreviousPeriod')}
          </span>
        ) : null}
      </div>
      <ul style={visuallyHiddenStyle}>
        {current.map((day) => (
          <li key={day.date}>
            {t('analytics.dailyPlays', {
              date: formatDate(day.date, locale),
              count: formatNumber(day.plays, locale),
            })}
          </li>
        ))}
      </ul>
    </section>
  );
};

const TopGamesSection: React.FC<{ analytics: CreatorAnalyticsDto }> = ({ analytics }) => {
  const { t, locale } = useI18n();
  const launchesByGame = new Map(
    analytics.eventMetrics.topGamesByLaunch.map((game) => [game.gameId, game.launches]),
  );
  return (
    <section style={panelStyle} className="bg-glass" aria-labelledby="top-games-title">
      <div style={sectionHeaderStyle}>
        <div>
          <h2 id="top-games-title" style={sectionTitleStyle}>
            <Gamepad2 size={20} aria-hidden="true" />
            {t('analytics.topGames')}
          </h2>
          <p style={descriptionStyle}>{t('analytics.topGamesBody')}</p>
        </div>
      </div>

      {analytics.topGames.length === 0 ? (
        <InlineEmptyState
          icon={Gamepad2}
          title={t('analytics.noTopGamesTitle')}
          body={t('analytics.noTopGames')}
        />
      ) : (
        <div style={topGamesTableStyle} className="creator-analytics-top-grid">
          <div style={topGamesHeaderStyle} className="creator-analytics-top-header">
            <span>{t('analytics.game')}</span>
            <span>{t('analytics.plays')}</span>
            <span>{t('analytics.launches')}</span>
            <span>{t('analytics.likes')}</span>
            <span>{t('analytics.comments')}</span>
            <span>{t('analytics.playShare')}</span>
          </div>
          {analytics.topGames.map((game, index) => {
            const share =
              analytics.summary.playsInRange > 0
                ? Math.round((game.plays / analytics.summary.playsInRange) * 100)
                : 0;
            return (
              <div key={game.gameId} style={topGameRowStyle} className="creator-analytics-top-row">
                <div style={topGameTitleCellStyle} className="creator-analytics-top-game">
                  <span style={gameAvatarStyle} aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <Link to={`/game/${game.slug}`} style={gameLinkStyle}>
                      {game.title}
                    </Link>
                    <span style={rowSubTextStyle}>
                      {t('analytics.launchCount', {
                        count: formatNumber(launchesByGame.get(game.gameId) ?? 0, locale),
                      })}
                    </span>
                  </div>
                </div>
                <MetricCell label={t('analytics.plays')} value={formatNumber(game.plays, locale)} />
                <MetricCell
                  label={t('analytics.launches')}
                  value={formatNumber(launchesByGame.get(game.gameId) ?? 0, locale)}
                />
                <MetricCell label={t('analytics.likes')} value={formatNumber(game.likes, locale)} />
                <MetricCell
                  label={t('analytics.comments')}
                  value={formatNumber(game.comments, locale)}
                />
                <div style={shareCellStyle}>
                  <span className="badge badge-secondary">
                    {t('analytics.percent', { count: share })}
                  </span>
                  <Link to={`/game/${game.slug}`} style={iconLinkStyle}>
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
  <div style={tableMetricCellStyle}>
    <span className="creator-analytics-mobile-label" style={mobileOnlyLabelStyle}>
      {label}
    </span>
    <strong>{value}</strong>
  </div>
);

const ActivitySection: React.FC<{ analytics: CreatorAnalyticsDto }> = ({ analytics }) => {
  const { t, locale } = useI18n();
  return (
    <section style={panelStyle} className="bg-glass" aria-labelledby="recent-activity-title">
      <h2 id="recent-activity-title" style={sectionTitleStyle}>
        <Activity size={20} aria-hidden="true" />
        {t('analytics.recentActivity')}
      </h2>
      <p style={descriptionStyle}>{t('analytics.recentActivityBody')}</p>
      <div style={activityGridStyle}>
        {analytics.recentActivity.map((activity) => {
          const Icon =
            activity.type === 'PLAY' ? Play : activity.type === 'LIKE' ? ThumbsUp : MessageSquare;
          return (
            <article key={activity.type} style={activityCardStyle}>
              <Icon size={18} aria-hidden="true" />
              <strong>
                {t(`analytics.activity${activity.type}`, {
                  count: formatNumber(activity.count, locale),
                })}
              </strong>
              <span>
                {activity.latestAt
                  ? t('analytics.latestAt', {
                      date: formatDate(activity.latestAt, locale),
                    })
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
  const totalKnownEvents = [...eventCounts.values()].reduce((sum, count) => sum + count, 0);

  return (
    <section style={panelStyle} className="bg-glass" aria-labelledby="internal-events-title">
      <div style={sectionHeaderStyle}>
        <div>
          <h2 id="internal-events-title" style={sectionTitleStyle}>
            <ShieldCheck size={20} aria-hidden="true" />
            {t('analytics.internalEventsTitle')}
          </h2>
          <p style={descriptionStyle}>{t('analytics.internalEventsBody')}</p>
        </div>
        <div style={eventTotalsStyle}>
          <span>
            {t('analytics.launchSuccesses')}:{' '}
            {formatNumber(analytics.eventMetrics.launchSuccesses, locale)}
          </span>
          <span>
            {t('analytics.launchFailures')}:{' '}
            {formatNumber(analytics.eventMetrics.launchFailures, locale)}
          </span>
          <span>
            {t('analytics.playsStarted')}:{' '}
            {formatNumber(analytics.eventMetrics.playsStarted, locale)}
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
          <div style={eventGroupGridStyle}>
            {EVENT_GROUPS.map((group) => {
              const Icon = group.icon;
              const groupEvents = group.types
                .map((type) => ({ type, count: eventCounts.get(type) ?? 0 }))
                .filter((event) => event.count > 0);
              const groupTotal = groupEvents.reduce((sum, event) => sum + event.count, 0);
              return (
                <article key={group.id} style={eventGroupCardStyle}>
                  <div style={eventGroupHeaderStyle}>
                    <span style={iconBubbleStyle(groupTotal > 0 ? 'info' : undefined)}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <h3 style={smallHeadingStyle}>{t(group.titleKey)}</h3>
                      <p style={smallDescriptionStyle}>{t(group.helperKey)}</p>
                    </div>
                  </div>
                  <strong style={eventGroupTotalStyle}>
                    {t('analytics.eventGroupTotal', {
                      count: formatNumber(groupTotal, locale),
                    })}
                  </strong>
                  {groupEvents.length > 0 ? (
                    <div style={eventChipWrapStyle}>
                      {groupEvents.slice(0, 3).map((event) => (
                        <span key={event.type} style={eventChipStyle}>
                          {t(`analytics.event.${event.type}`)}
                          <strong>{formatNumber(event.count, locale)}</strong>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={rowSubTextStyle}>{t('analytics.eventGroupNoEvents')}</span>
                  )}
                </article>
              );
            })}
          </div>

          {analytics.eventMetrics.topGamesByLaunch.length > 0 ? (
            <div style={topLaunchesStyle}>
              <h3 style={compactTitleStyle}>{t('analytics.topLaunchesTitle')}</h3>
              <div style={compactListStyle}>
                {analytics.eventMetrics.topGamesByLaunch.slice(0, 5).map((game) => (
                  <Link key={game.gameId} to={`/game/${game.slug}`} style={compactListRowStyle}>
                    <span>{game.title}</span>
                    <strong>
                      {t('analytics.launchCount', {
                        count: formatNumber(game.launches, locale),
                      })}
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
    <section style={lockedStyle} className="bg-glass" aria-labelledby="creator-plus-title">
      <div style={lockedIconStyle}>
        <LockKeyhole size={28} aria-hidden="true" />
      </div>
      <div style={{ flex: 1 }}>
        <span className="badge badge-primary">{t('analytics.freeAdvancedEyebrow')}</span>
        <h2 id="creator-plus-title" style={lockedTitleStyle}>
          {t('analytics.creatorPlusTitle')}
        </h2>
        <p style={descriptionStyle}>{t('analytics.creatorPlusBody')}</p>
        <div style={lockedFeatureGridStyle}>
          {locked.map((key) => (
            <span key={key} style={lockedFeatureStyle}>
              <Sparkles size={14} aria-hidden="true" />
              {t(key)}
            </span>
          ))}
        </div>
      </div>
      <Link to="/settings/billing" className="btn btn-primary">
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

  return (
    <section style={advancedSectionStyle} aria-labelledby="advanced-analytics-title">
      <div style={advancedHeaderStyle} className="bg-glass">
        <div>
          <span className="badge badge-primary">{t('analytics.advancedBadge')}</span>
          <h2 id="advanced-analytics-title" style={sectionTitleBareStyle}>
            {t('analytics.advancedTitle')}
          </h2>
          <p style={descriptionStyle}>{t('analytics.advancedBody')}</p>
        </div>
      </div>

      <div style={advancedGridStyle}>
        <MetricCard
          card={{
            key: 'uniquePlayers',
            label: t('analytics.uniquePlayers'),
            value: formatNumber(advanced.uniquePlayers, locale),
            helper: t('analytics.metricHelper.uniquePlayers'),
            icon: Users,
          }}
        />
        <MetricCard
          card={{
            key: 'returningPlayers',
            label: t('analytics.returningPlayers'),
            value: formatNumber(advanced.returningPlayers, locale),
            helper: t('analytics.metricHelper.returningPlayers'),
            icon: RotateCcw,
          }}
        />
        <MetricCard
          card={{
            key: 'cloudSaveUsers',
            label: t('analytics.cloudSaveUsers'),
            value: formatNumber(advanced.cloudSaveUsers, locale),
            helper: t('analytics.metricHelper.cloudSaveUsers'),
            icon: Save,
          }}
        />
        <MetricCard
          card={{
            key: 'cloudSaveAdoption',
            label: t('analytics.cloudSaveAdoption'),
            value: percent(advanced.cloudSaveAdoptionPercent),
            helper: t('analytics.metricHelper.cloudSaveAdoption'),
            icon: Cloud,
          }}
        />
        <MetricCard
          card={{
            key: 'p50',
            label: t('analytics.durationP50'),
            value: duration(advanced.durationPercentiles?.p50Seconds ?? null),
            helper: t('analytics.metricHelper.durationP50'),
            icon: Clock,
            tone: 'warning',
          }}
        />
        <MetricCard
          card={{
            key: 'p90',
            label: t('analytics.durationP90'),
            value: duration(advanced.durationPercentiles?.p90Seconds ?? null),
            helper: t('analytics.metricHelper.durationP90'),
            icon: Clock,
            tone: 'warning',
          }}
        />
      </div>

      <div style={advancedTwoColumnStyle}>
        <section style={panelStyle} className="bg-glass">
          <h3 style={sectionTitleStyle}>
            <Users size={19} aria-hidden="true" />
            {t('analytics.playerMixTitle')}
          </h3>
          <p style={descriptionStyle}>{t('analytics.playerMixBody')}</p>
          <div style={splitBarStyle} aria-hidden="true">
            <span style={{ ...splitBarSegmentStyle, width: `${signedInShare}%` }} />
            <span
              style={{
                ...splitBarSegmentStyle,
                width: `${guestShare}%`,
                background: 'var(--info)',
              }}
            />
          </div>
          <div style={splitStatsStyle}>
            <span>
              <strong>{formatNumber(advanced.loggedInPlays, locale)}</strong>
              {t('analytics.signedInShare', { count: signedInShare })}
            </span>
            <span>
              <strong>{formatNumber(advanced.guestPlays, locale)}</strong>
              {t('analytics.guestShare', { count: guestShare })}
            </span>
          </div>
        </section>

        <section style={panelStyle} className="bg-glass">
          <h3 style={sectionTitleStyle}>
            <Gauge size={19} aria-hidden="true" />
            {t('analytics.launchDiagnostics')}
          </h3>
          <p style={descriptionStyle}>
            {t('analytics.launchDiagnosticsBody', {
              rate: percent(advanced.eventInsights.launchSuccessRate),
            })}
          </p>
          <div style={eventChipWrapStyle}>
            {advanced.eventInsights.launchFailureReasons.length > 0 ? (
              advanced.eventInsights.launchFailureReasons.map((reason) => (
                <span key={reason.code} style={eventChipStyle}>
                  {reason.code}
                  <strong>{formatNumber(reason.count, locale)}</strong>
                </span>
              ))
            ) : (
              <span style={rowSubTextStyle}>{t('analytics.noFailureCodes')}</span>
            )}
          </div>
        </section>
      </div>

      <div style={advancedTwoColumnStyle}>
        <section style={panelStyle} className="bg-glass">
          <h3 style={sectionTitleStyle}>
            <Cloud size={19} aria-hidden="true" />
            {t('analytics.cloudSaveFunnel')}
          </h3>
          <p style={descriptionStyle}>
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
          <div style={funnelGridStyle}>
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

        <section style={panelStyle} className="bg-glass">
          <h3 style={sectionTitleStyle}>
            <TrendingUp size={19} aria-hidden="true" />
            {t('analytics.conversionTitle')}
          </h3>
          <p style={descriptionStyle}>
            {conversionAvailable
              ? t('analytics.conversionBody')
              : t('analytics.notEnoughInternalData')}
          </p>
          <div style={funnelGridStyle}>
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

      <section style={panelStyle} className="bg-glass">
        <div style={sectionHeaderStyle}>
          <div>
            <h3 style={sectionTitleStyle}>
              <Gamepad2 size={19} aria-hidden="true" />
              {t('analytics.perGame')}
            </h3>
            <p style={descriptionStyle}>{t('analytics.perGameBody')}</p>
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
          <div style={compactListStyle}>
            {advanced.games.map((game) => (
              <div key={game.gameId} style={advancedGameRowStyle}>
                <div>
                  <Link to={`/game/${game.slug}`} style={gameLinkStyle}>
                    {game.title}
                  </Link>
                  <p style={smallDescriptionStyle}>
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

      <div style={advancedTwoColumnStyle}>
        <section style={panelStyle} className="bg-glass">
          <h3 style={sectionTitleStyle}>
            <Sparkles size={19} aria-hidden="true" />
            {t('analytics.customEventsTitle')}
          </h3>
          {advanced.eventInsights.customEvents.length > 0 ? (
            <div style={eventChipWrapStyle}>
              {advanced.eventInsights.customEvents.map((event) => (
                <span key={event.name} style={eventChipStyle}>
                  {event.name}
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

        <section style={panelStyle} className="bg-glass">
          <h3 style={sectionTitleStyle}>
            <BarChart3 size={19} aria-hidden="true" />
            {t('analytics.versionComparisonTitle')}
          </h3>
          {advanced.eventInsights.versions.length > 0 ? (
            <div style={compactListStyle}>
              {advanced.eventInsights.versions.slice(0, 5).map((version) => (
                <div key={`${version.gameId}-${version.versionId}`} style={versionRowStyle}>
                  <span>
                    <strong>{version.gameTitle}</strong>
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
  <span style={metricPillStyle}>
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
  <section style={emptyStateStyle} className="bg-glass">
    <Icon size={30} aria-hidden="true" />
    <div>
      <h2 style={compactTitleStyle}>{title}</h2>
      <p style={descriptionStyle}>{body}</p>
    </div>
    {action}
  </section>
);

const InlineEmptyState: React.FC<{ icon: LucideIcon; title: string; body: string }> = ({
  icon: Icon,
  title,
  body,
}) => (
  <div style={inlineEmptyStyle}>
    <Icon size={24} aria-hidden="true" />
    <div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  </div>
);

const iconBubbleStyle = (tone?: KpiCard['tone']): React.CSSProperties => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color:
    tone === 'success'
      ? 'var(--success)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'danger'
          ? 'var(--danger)'
          : tone === 'info'
            ? 'var(--info)'
            : 'var(--primary)',
  background:
    tone === 'success'
      ? 'var(--success-soft)'
      : tone === 'warning'
        ? 'var(--warning-soft)'
        : tone === 'danger'
          ? 'var(--danger-soft)'
          : tone === 'info'
            ? 'var(--info-soft)'
            : 'var(--primary-soft)',
  border: '1px solid var(--border-default)',
  flexShrink: 0,
});

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.4rem',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'stretch',
  flexWrap: 'wrap',
  gap: '1.25rem',
  padding: '1.5rem',
  borderRadius: 12,
  border: '1px solid var(--border-color)',
  boxShadow: 'var(--shadow-card)',
};

const headerCopyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
  maxWidth: 720,
  flex: '1 1 420px',
};

const headerControlsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  flexWrap: 'wrap',
  flex: '1 1 280px',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'clamp(1.8rem, 2.2vw, 2.4rem)',
  lineHeight: 1,
  letterSpacing: 0,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: '0.45rem',
  color: 'var(--text-secondary)',
  fontSize: '0.98rem',
  lineHeight: 1.55,
  maxWidth: 720,
};

const verifiedBadgeStyle: React.CSSProperties = {
  width: 'fit-content',
  gap: '0.35rem',
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.55rem 1rem',
  color: 'var(--text-muted)',
  fontSize: '0.78rem',
};

const rangeGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  padding: 4,
  borderRadius: 10,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  gap: 4,
  minHeight: 42,
};

const rangeButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: '0.55rem 0.75rem',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontWeight: 700,
  cursor: 'pointer',
  minWidth: 58,
};

const activeRangeButtonStyle: React.CSSProperties = {
  ...rangeButtonStyle,
  background: 'var(--primary-soft)',
  color: 'var(--text-primary)',
  boxShadow: 'inset 0 0 0 1px var(--primary-border)',
};

const refreshButtonStyle: React.CSSProperties = {
  minHeight: 42,
};

const refreshingPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  minHeight: 42,
  padding: '0 0.8rem',
  borderRadius: 999,
  color: 'var(--text-secondary)',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  fontSize: '0.8rem',
  fontWeight: 700,
};

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: '1rem',
};

const metricCardStyle: React.CSSProperties = {
  minHeight: 154,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: '0.8rem',
  padding: '1.1rem',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  background: 'var(--bg-card)',
};

const metricCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.75rem',
  alignItems: 'flex-start',
};

const metricLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: '2rem',
  lineHeight: 1,
  fontFamily: 'var(--font-display)',
  letterSpacing: 0,
};

const metricHelperStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.78rem',
  lineHeight: 1.4,
};

const portfolioStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  flexWrap: 'wrap',
  padding: '1rem 1.1rem',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  background: 'var(--bg-surface)',
};

const portfolioMetricsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.6rem',
};

const portfolioPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.55rem 0.7rem',
  border: '1px solid var(--border-color)',
  borderRadius: 999,
  color: 'var(--text-secondary)',
  background: 'var(--bg-card)',
  fontSize: '0.78rem',
};

const contentGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '1rem',
};

const panelStyle: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  background: 'var(--bg-card)',
};

const chartCardStyle: React.CSSProperties = {
  ...panelStyle,
  overflow: 'hidden',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: '1rem',
};

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '1.05rem',
  letterSpacing: 0,
  margin: 0,
};

const sectionTitleBareStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  letterSpacing: 0,
  marginTop: '0.7rem',
};

const compactTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  letterSpacing: 0,
  margin: 0,
};

const smallHeadingStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  letterSpacing: 0,
  margin: 0,
};

const descriptionStyle: React.CSSProperties = {
  marginTop: '0.35rem',
  color: 'var(--text-secondary)',
  fontSize: '0.86rem',
  lineHeight: 1.5,
};

const smallDescriptionStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.76rem',
  lineHeight: 1.45,
  marginTop: '0.18rem',
};

const chartStatsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.55rem',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
  fontWeight: 700,
};

const chartFrameStyle: React.CSSProperties = {
  position: 'relative',
  marginTop: '1.1rem',
  minHeight: 310,
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  background:
    'linear-gradient(180deg, rgba(var(--primary-rgb), 0.08) 0%, rgba(var(--primary-rgb), 0.02) 100%)',
  overflow: 'hidden',
};

const chartSvgStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 310,
};

const chartEmptyOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: '50% auto auto 50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.35rem',
  maxWidth: 360,
  textAlign: 'center',
  color: 'var(--text-secondary)',
  padding: '1rem',
  borderRadius: 12,
  background: 'rgba(0, 0, 0, 0.32)',
  border: '1px solid var(--border-color)',
};

const legendStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
  marginTop: '0.9rem',
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
};

const legendItemStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
};

const legendSwatchStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
};

const topGamesTableStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.55rem',
  marginTop: '1rem',
};

const topGamesHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 1.8fr) repeat(5, minmax(82px, 0.7fr))',
  gap: '0.75rem',
  padding: '0 0.85rem',
  color: 'var(--text-muted)',
  fontSize: '0.72rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: 0,
};

const topGameRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 1.8fr) repeat(5, minmax(82px, 0.7fr))',
  gap: '0.75rem',
  alignItems: 'center',
  padding: '0.8rem',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  background: 'var(--bg-surface)',
};

const topGameTitleCellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  minWidth: 0,
};

const gameAvatarStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--primary)',
  background: 'var(--primary-soft)',
  border: '1px solid var(--primary-border)',
  fontWeight: 900,
  flexShrink: 0,
};

const gameLinkStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 800,
  textDecoration: 'none',
};

const rowSubTextStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 2,
  color: 'var(--text-muted)',
  fontSize: '0.74rem',
};

const tableMetricCellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  color: 'var(--text-primary)',
};

const mobileOnlyLabelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: 0,
};

const shareCellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.55rem',
  flexWrap: 'wrap',
};

const iconLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  color: 'var(--primary)',
  fontSize: '0.78rem',
  fontWeight: 800,
  textDecoration: 'none',
};

const activityGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '0.75rem',
  marginTop: '1rem',
};

const activityCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  minHeight: 116,
  padding: '0.9rem',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
};

const eventTotalsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.55rem',
  justifyContent: 'flex-end',
  maxWidth: 520,
  color: 'var(--text-secondary)',
  fontSize: '0.76rem',
  fontWeight: 700,
};

const eventGroupGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: '0.85rem',
  marginTop: '1rem',
};

const eventGroupCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  minHeight: 176,
  padding: '1rem',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  background: 'var(--bg-surface)',
};

const eventGroupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.65rem',
  alignItems: 'flex-start',
};

const eventGroupTotalStyle: React.CSSProperties = {
  fontSize: '1.35rem',
  lineHeight: 1,
};

const eventChipWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
};

const eventChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.45rem 0.55rem',
  border: '1px solid var(--border-color)',
  borderRadius: 999,
  background: 'var(--bg-card)',
  color: 'var(--text-secondary)',
  fontSize: '0.74rem',
};

const topLaunchesStyle: React.CSSProperties = {
  marginTop: '1.1rem',
};

const compactListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.65rem',
  marginTop: '0.85rem',
};

const compactListRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem',
  borderRadius: 10,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  textDecoration: 'none',
};

const lockedStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1.2rem',
  padding: '1.35rem',
  border: '1px solid var(--primary-border)',
  borderRadius: 12,
  background: 'var(--bg-card)',
};

const lockedIconStyle: React.CSSProperties = {
  ...iconBubbleStyle('warning'),
  width: 54,
  height: 54,
};

const lockedTitleStyle: React.CSSProperties = {
  marginTop: '0.65rem',
  fontSize: '1.25rem',
  letterSpacing: 0,
};

const lockedFeatureGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginTop: '0.9rem',
};

const lockedFeatureStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.45rem 0.6rem',
  borderRadius: 999,
  color: 'var(--text-secondary)',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  fontSize: '0.76rem',
};

const advancedSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const advancedHeaderStyle: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid var(--primary-border)',
  borderRadius: 12,
};

const advancedGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: '1rem',
};

const advancedTwoColumnStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '1rem',
};

const splitBarStyle: React.CSSProperties = {
  display: 'flex',
  height: 14,
  borderRadius: 999,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  overflow: 'hidden',
  marginTop: '1rem',
};

const splitBarSegmentStyle: React.CSSProperties = {
  display: 'block',
  background: 'var(--primary)',
  minWidth: 0,
};

const splitStatsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '0.7rem',
  marginTop: '0.85rem',
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
};

const funnelGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '0.7rem',
  marginTop: '1rem',
};

const metricPillStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  padding: '0.7rem',
  borderRadius: 10,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: '0.72rem',
};

const advancedGameRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '0.75rem',
  alignItems: 'center',
  padding: '0.85rem',
  borderRadius: 10,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-surface)',
};

const versionRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '0.7rem',
  alignItems: 'center',
  padding: '0.8rem',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  background: 'var(--bg-surface)',
};

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem',
  padding: '1.25rem',
  border: '1px dashed var(--border-strong)',
  borderRadius: 12,
  color: 'var(--text-secondary)',
};

const inlineEmptyStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '1rem',
  marginTop: '1rem',
  border: '1px dashed var(--border-color)',
  borderRadius: 10,
  color: 'var(--text-secondary)',
  background: 'var(--bg-surface)',
};

const errorPanelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem',
  padding: '1rem',
  color: 'var(--danger)',
  border: '1px solid var(--danger)',
  borderRadius: 12,
  background: 'var(--danger-soft)',
};

const skeletonWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1.25rem',
  borderRadius: 12,
  border: '1px solid var(--border-color)',
};

const skeletonHeaderStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const skeletonLineStyle: React.CSSProperties = {
  display: 'block',
  width: '56%',
  height: 14,
  borderRadius: 999,
  background: 'linear-gradient(90deg, var(--bg-surface), var(--surface-3), var(--bg-surface))',
  color: 'transparent',
  overflow: 'hidden',
};

const skeletonCardStyle: React.CSSProperties = {
  ...metricCardStyle,
  minHeight: 154,
};

const skeletonChartStyle: React.CSSProperties = {
  minHeight: 300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  background: 'var(--bg-surface)',
};

const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
