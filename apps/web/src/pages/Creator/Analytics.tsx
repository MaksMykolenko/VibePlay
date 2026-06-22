import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreatorAnalyticsDto, CreatorAnalyticsRange } from '@vibeplay/shared';
import {
  BarChart3,
  Clock,
  LockKeyhole,
  MessageSquare,
  Play,
  RotateCcw,
  Save,
  ThumbsUp,
  Users,
} from 'lucide-react';
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
}

export const CreatorAnalytics: React.FC = () => {
  const [range, setRange] = useState<CreatorAnalyticsRange>('30d');
  const [result, setResult] = useState<{
    range: CreatorAnalyticsRange | null;
    analytics: CreatorAnalyticsDto | null;
    error: string;
  }>({ range: null, analytics: null, error: '' });

  useEffect(() => {
    let active = true;
    api
      .creatorAnalytics(range)
      .then((value) => {
        if (active) setResult({ range, analytics: value, error: '' });
      })
      .catch((reason) => {
        if (active) setResult({ range, analytics: null, error: errorMessage(reason) });
      });
    return () => {
      active = false;
    };
  }, [range]);

  return (
    <CreatorAnalyticsView
      analytics={result.range === range ? result.analytics : null}
      range={range}
      loading={result.range !== range}
      error={result.range === range ? result.error : ''}
      onRangeChange={setRange}
    />
  );
};

export const CreatorAnalyticsView: React.FC<CreatorAnalyticsViewProps> = ({
  analytics,
  range,
  loading,
  error,
  onRangeChange,
}) => {
  const { t, locale } = useI18n();
  const duration = (seconds: number | null): string => {
    if (seconds === null) return t('analytics.notEnoughData');
    if (seconds < 60) return t('analytics.secondsShort', { count: seconds });
    return t('analytics.minutesShort', { count: Math.round(seconds / 60) });
  };

  return (
    <div style={containerStyle} className="animate-fade">
      <div style={headerStyle}>
        <div>
          <h1>{t('analytics.title')}</h1>
          <p style={descriptionStyle}>{t('analytics.subtitle')}</p>
        </div>
        <label style={rangeLabelStyle}>
          <span>{t('analytics.range')}</span>
          <select
            value={range}
            onChange={(event) => onRangeChange(event.target.value as CreatorAnalyticsRange)}
            aria-label={t('analytics.range')}
          >
            <option value="7d">{t('analytics.range7d')}</option>
            <option value="30d">{t('analytics.range30d')}</option>
            <option value="90d">{t('analytics.range90d')}</option>
          </select>
        </label>
      </div>

      {loading && !analytics ? <div style={messageStyle}>{t('analytics.loading')}</div> : null}
      {error ? (
        <div style={errorStyle} role="alert">
          {t('analytics.loadError', { message: error })}
        </div>
      ) : null}
      {analytics ? (
        <>
          {loading ? <div style={refreshStyle}>{t('analytics.refreshing')}</div> : null}
          <div style={summaryGridStyle}>
            {[
              [t('analytics.totalPlays'), analytics.summary.totalPlays],
              [t('analytics.playsInRange'), analytics.summary.playsInRange],
              [t('analytics.likes'), analytics.summary.likes],
              [t('analytics.comments'), analytics.summary.comments],
              [t('analytics.published'), analytics.summary.publishedGames],
              [t('analytics.inModeration'), analytics.summary.inModerationGames],
            ].map(([label, value]) => (
              <div key={label} style={summaryCardStyle} className="bg-glass">
                <span>{label}</span>
                <strong>{formatNumber(Number(value), locale)}</strong>
              </div>
            ))}
            <div style={summaryCardStyle} className="bg-glass">
              <span>{t('analytics.averageSession')}</span>
              <strong>{duration(analytics.summary.averageDurationSeconds)}</strong>
            </div>
          </div>

          <div style={statusGridStyle}>
            <span>{t('analytics.gamesTotal', { count: analytics.summary.totalGames })}</span>
            <span>{t('analytics.drafts', { count: analytics.summary.draftGames })}</span>
            <span>{t('analytics.rejected', { count: analytics.summary.rejectedGames })}</span>
          </div>

          {analytics.summary.totalPlays === 0 ? (
            <section style={emptyStyle} className="bg-glass">
              <Play size={34} color="var(--secondary)" />
              <h2>{t('analytics.emptyTitle')}</h2>
              <p style={descriptionStyle}>{t('analytics.emptyBody')}</p>
            </section>
          ) : analytics.summary.playsInRange === 0 ? (
            <section style={emptyStyle} className="bg-glass">
              <h2>{t('analytics.noRangeTitle')}</h2>
              <p style={descriptionStyle}>{t('analytics.noRangeBody')}</p>
            </section>
          ) : (
            <section style={chartCardStyle} className="bg-glass">
              <h2 style={sectionTitleStyle}>
                <BarChart3 size={20} />
                {t('analytics.playTrend')}
              </h2>
              <div
                style={{
                  ...chartStyle,
                  gridTemplateColumns: `repeat(${analytics.timeseries.length}, minmax(3px, 1fr))`,
                }}
                aria-label={t('analytics.chartLabel')}
              >
                {analytics.timeseries.map((day) => {
                  const maxDaily = Math.max(...analytics.timeseries.map((item) => item.plays));
                  return (
                    <div
                      key={day.date}
                      style={barColumnStyle}
                      title={t('analytics.dailyPlays', {
                        date: formatDate(day.date, locale),
                        count: formatNumber(day.plays, locale),
                      })}
                    >
                      <div
                        style={{
                          ...barStyle,
                          height: maxDaily > 0 ? `${(day.plays / maxDaily) * 100}%` : '0',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section style={chartCardStyle} className="bg-glass">
            <h2 style={sectionTitleStyle}>{t('analytics.topGames')}</h2>
            {analytics.topGames.length === 0 ? (
              <p style={descriptionStyle}>{t('analytics.noTopGames')}</p>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th>{t('analytics.game')}</th>
                      <th>{t('analytics.plays')}</th>
                      <th>{t('analytics.likes')}</th>
                      <th>{t('analytics.comments')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topGames.map((game) => (
                      <tr key={game.gameId}>
                        <td>
                          <Link to={`/game/${game.slug}`}>{game.title}</Link>
                        </td>
                        <td>{formatNumber(game.plays, locale)}</td>
                        <td>{formatNumber(game.likes, locale)}</td>
                        <td>{formatNumber(game.comments, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={chartCardStyle} className="bg-glass">
            <h2 style={sectionTitleStyle}>{t('analytics.recentActivity')}</h2>
            <div style={activityGridStyle}>
              {analytics.recentActivity.map((activity) => {
                const Icon =
                  activity.type === 'PLAY'
                    ? Play
                    : activity.type === 'LIKE'
                      ? ThumbsUp
                      : MessageSquare;
                return (
                  <div key={activity.type} style={activityCardStyle}>
                    <Icon size={19} color="var(--secondary)" />
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
                  </div>
                );
              })}
            </div>
          </section>

          <section style={chartCardStyle} className="bg-glass">
            <h2 style={sectionTitleStyle}>{t('analytics.internalEventsTitle')}</h2>
            <p style={descriptionStyle}>{t('analytics.internalEventsBody')}</p>
            <div style={{ ...summaryGridStyle, marginTop: '1rem' }}>
              {[
                [t('analytics.launchSuccesses'), analytics.eventMetrics.launchSuccesses],
                [t('analytics.launchFailures'), analytics.eventMetrics.launchFailures],
                [t('analytics.playsStarted'), analytics.eventMetrics.playsStarted],
              ].map(([label, value]) => (
                <div key={label} style={summaryCardStyle}>
                  <span>{label}</span>
                  <strong>{formatNumber(Number(value), locale)}</strong>
                </div>
              ))}
            </div>
            {analytics.eventMetrics.recent.length === 0 ? (
              <p style={descriptionStyle}>{t('analytics.noInternalEvents')}</p>
            ) : (
              <div style={activityGridStyle}>
                {analytics.eventMetrics.recent.map((event) => (
                  <div key={event.type} style={activityCardStyle}>
                    <strong>{t(`analytics.event.${event.type}`)}</strong>
                    <span>{formatNumber(event.count, locale)}</span>
                  </div>
                ))}
              </div>
            )}
            {analytics.eventMetrics.topGamesByLaunch.length > 0 ? (
              <div style={gameListStyle}>
                {analytics.eventMetrics.topGamesByLaunch.map((game) => (
                  <div key={game.gameId} style={gameRowStyle}>
                    <Link to={`/game/${game.slug}`}>
                      <strong>{game.title}</strong>
                    </Link>
                    <span>
                      {t('analytics.launchCount', {
                        count: formatNumber(game.launches, locale),
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {!analytics.entitlements.advancedAnalytics || !analytics.advanced ? (
            <div style={lockedStyle} className="bg-glass">
              <LockKeyhole size={30} color="var(--secondary)" />
              <div style={{ flex: 1 }}>
                <h2>{t('analytics.creatorPlusTitle')}</h2>
                <p style={descriptionStyle}>{t('analytics.creatorPlusBody')}</p>
              </div>
              <Link to="/settings/billing" className="btn btn-primary">
                {t('billing.upgrade')}
              </Link>
            </div>
          ) : (
            <AdvancedAnalytics analytics={analytics} duration={duration} />
          )}
        </>
      ) : null}
    </div>
  );
};

const AdvancedAnalytics: React.FC<{
  analytics: CreatorAnalyticsDto;
  duration: (seconds: number | null) => string;
}> = ({ analytics, duration }) => {
  const { t, locale } = useI18n();
  const advanced = analytics.advanced!;
  return (
    <section style={advancedSectionStyle}>
      <div>
        <h2>{t('analytics.advancedTitle')}</h2>
        <p style={descriptionStyle}>{t('analytics.advancedBody')}</p>
      </div>
      <div style={summaryGridStyle}>
        {[
          [Users, t('analytics.uniquePlayers'), advanced.uniquePlayers],
          [Play, t('analytics.loggedInPlays'), advanced.loggedInPlays],
          [Play, t('analytics.guestPlays'), advanced.guestPlays],
          [RotateCcw, t('analytics.returningPlayers'), advanced.returningPlayers],
          [Save, t('analytics.cloudSaveUsers'), advanced.cloudSaveUsers],
        ].map(([Icon, label, value]) => {
          const MetricIcon = Icon as typeof Users;
          return (
            <div key={String(label)} style={metricCardStyle} className="bg-glass">
              <MetricIcon size={22} color="var(--secondary)" />
              <div>
                <strong>{formatNumber(Number(value), locale)}</strong>
                <span>{String(label)}</span>
              </div>
            </div>
          );
        })}
        <div style={metricCardStyle} className="bg-glass">
          <Save size={22} color="var(--secondary)" />
          <div>
            <strong>
              {advanced.cloudSaveAdoptionPercent === null
                ? t('analytics.notEnoughData')
                : t('analytics.percent', { count: advanced.cloudSaveAdoptionPercent })}
            </strong>
            <span>{t('analytics.cloudSaveAdoption')}</span>
          </div>
        </div>
        <div style={metricCardStyle} className="bg-glass">
          <Clock size={22} color="var(--warning)" />
          <div>
            <strong>{duration(advanced.durationPercentiles?.p50Seconds ?? null)}</strong>
            <span>{t('analytics.durationP50')}</span>
          </div>
        </div>
        <div style={metricCardStyle} className="bg-glass">
          <Clock size={22} color="var(--warning)" />
          <div>
            <strong>{duration(advanced.durationPercentiles?.p90Seconds ?? null)}</strong>
            <span>{t('analytics.durationP90')}</span>
          </div>
        </div>
      </div>

      <section style={chartCardStyle} className="bg-glass">
        <h3>{t('analytics.periodComparison')}</h3>
        <p style={descriptionStyle}>
          {t('analytics.previousPeriodPlays', {
            count: formatNumber(advanced.comparison.previousPeriodPlays, locale),
          })}
        </p>
        <strong>
          {advanced.comparison.changePercent === null
            ? t('analytics.notEnoughComparison')
            : t('analytics.changePercent', { count: advanced.comparison.changePercent })}
        </strong>
      </section>

      <section style={chartCardStyle} className="bg-glass">
        <h3>{t('analytics.perGame')}</h3>
        {advanced.games.length === 0 ? (
          <p style={descriptionStyle}>{t('analytics.noTopGames')}</p>
        ) : (
          <div style={gameListStyle}>
            {advanced.games.map((game) => (
              <div key={game.gameId} style={gameRowStyle}>
                <div>
                  <Link to={`/game/${game.slug}`}>
                    <strong>{game.title}</strong>
                  </Link>
                  <p style={descriptionStyle}>
                    {t('analytics.gameBreakdown', {
                      plays: formatNumber(game.plays, locale),
                      players: formatNumber(game.uniquePlayers, locale),
                      guests: formatNumber(game.guestPlays, locale),
                    })}
                  </p>
                </div>
                <span>{duration(game.averageDurationSeconds)}</span>
                <span>
                  {t('analytics.saveCount', { count: formatNumber(game.cloudSaveUsers, locale) })}
                </span>
                <span>
                  {game.versions.length > 0
                    ? game.versions
                        .map((version) =>
                          t('analytics.versionPlays', {
                            version: version.version,
                            count: formatNumber(version.plays, locale),
                          }),
                        )
                        .join(', ')
                    : t('analytics.noVersionData')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={chartCardStyle} className="bg-glass">
        <h3>{t('analytics.eventInsightsTitle')}</h3>
        <div style={activityGridStyle}>
          <div style={activityCardStyle}>
            <strong>{t('analytics.launchSuccessRate')}</strong>
            <span>
              {advanced.eventInsights.launchSuccessRate === null
                ? t('analytics.notEnoughInternalData')
                : t('analytics.percent', {
                    count: advanced.eventInsights.launchSuccessRate,
                  })}
            </span>
          </div>
          <div style={activityCardStyle}>
            <strong>{t('analytics.cloudSaveFunnel')}</strong>
            <span>
              {t('analytics.cloudSaveFunnelValues', {
                shown: advanced.eventInsights.cloudSaveFunnel.ctaShown,
                clicked:
                  advanced.eventInsights.cloudSaveFunnel.signupClicks +
                  advanced.eventInsights.cloudSaveFunnel.loginClicks,
                synced: advanced.eventInsights.cloudSaveFunnel.syncAccepted,
              })}
            </span>
          </div>
        </div>
        {advanced.eventInsights.launchFailureReasons.length > 0 ? (
          <p style={descriptionStyle}>
            {t('analytics.failureReasons', {
              reasons: advanced.eventInsights.launchFailureReasons
                .map((reason) => `${reason.code}: ${reason.count}`)
                .join(', '),
            })}
          </p>
        ) : null}
        {advanced.eventInsights.customEvents.length > 0 ? (
          <p style={descriptionStyle}>
            {t('analytics.customEvents', {
              events: advanced.eventInsights.customEvents
                .map((event) => `${event.name}: ${event.count}`)
                .join(', '),
            })}
          </p>
        ) : null}
      </section>

      <section style={chartCardStyle} className="bg-glass">
        <h3>{t('analytics.conversionTitle')}</h3>
        <p style={descriptionStyle}>
          {advanced.conversion.registrationCta === 'NOT_ENOUGH_INTERNAL_DATA'
            ? t('analytics.notEnoughInternalData')
            : t('analytics.conversionValues', {
                registrationClicks: advanced.conversion.registrationClicks,
                registrationCompletions: advanced.conversion.registrationCompletions,
                loginClicks: advanced.conversion.loginClicks,
                loginCompletions: advanced.conversion.loginCompletions,
              })}
        </p>
      </section>
    </section>
  );
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'end',
  flexWrap: 'wrap',
  gap: '1rem',
};
const rangeLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
};
const descriptionStyle: React.CSSProperties = {
  marginTop: '0.35rem',
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
  lineHeight: 1.5,
};
const messageStyle: React.CSSProperties = {
  padding: '3rem',
  color: 'var(--text-secondary)',
  textAlign: 'center',
};
const errorStyle: React.CSSProperties = {
  padding: '1rem',
  color: 'var(--danger)',
  border: '1px solid var(--danger)',
  borderRadius: '10px',
};
const refreshStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.75rem',
};
const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
  gap: '1rem',
};
const summaryCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '1.1rem',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
};
const statusGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem 1.5rem',
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
};
const emptyStyle: React.CSSProperties = {
  padding: '2rem',
  textAlign: 'center',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
};
const metricCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.8rem',
  padding: '1.1rem',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
};
const lockedStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem',
  padding: '1.5rem',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
};
const chartCardStyle: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
};
const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};
const chartStyle: React.CSSProperties = {
  display: 'grid',
  gap: '3px',
  height: '180px',
  alignItems: 'end',
  marginTop: '1rem',
};
const barColumnStyle: React.CSSProperties = { height: '100%', display: 'flex', alignItems: 'end' };
const barStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--secondary)',
  borderRadius: '3px 3px 0 0',
};
const tableWrapStyle: React.CSSProperties = { overflowX: 'auto', marginTop: '1rem' };
const tableStyle: React.CSSProperties = { width: '100%', textAlign: 'left', borderSpacing: '1rem' };
const activityGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.75rem',
  marginTop: '1rem',
};
const activityCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '0.9rem',
  background: 'var(--bg-surface)',
  borderRadius: '8px',
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
};
const advancedSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};
const gameListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  marginTop: '1rem',
};
const gameRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 2fr) repeat(3, minmax(120px, 1fr))',
  gap: '1rem',
  padding: '0.9rem',
  overflowX: 'auto',
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-color)',
  fontSize: '0.8rem',
};
