import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreatorAnalyticsDto } from '@vibeplay/shared';
import { BarChart3, Clock, LockKeyhole, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/api/errors';
import { useI18n } from '../../i18n/useI18n';
import { formatDate, formatNumber } from '../../lib/formatTime';

export const CreatorAnalytics: React.FC = () => {
  const { t, locale } = useI18n();
  const [analytics, setAnalytics] = useState<CreatorAnalyticsDto | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .creatorAnalytics()
      .then((value) => {
        if (active) setAnalytics(value);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <div style={messageStyle}>{error}</div>;
  if (!analytics) return <div style={messageStyle}>{t('analytics.loading')}</div>;

  const maxDaily = Math.max(1, ...(analytics.details?.dailyPlays.map((day) => day.plays) ?? [1]));
  return (
    <div style={containerStyle} className="animate-fade">
      <div>
        <h1>{t('analytics.title')}</h1>
        <p style={descriptionStyle}>{t('analytics.subtitle')}</p>
      </div>

      <div style={summaryGridStyle}>
        {[
          [t('analytics.games'), analytics.totals.games],
          [t('analytics.published'), analytics.totals.publishedGames],
          [t('analytics.plays'), analytics.totals.plays],
          [t('analytics.likes'), analytics.totals.likes],
        ].map(([label, value]) => (
          <div key={label} style={summaryCardStyle} className="bg-glass">
            <span>{label}</span>
            <strong>{formatNumber(Number(value), locale)}</strong>
          </div>
        ))}
      </div>

      {!analytics.advanced || !analytics.details ? (
        <div style={lockedStyle} className="bg-glass">
          <LockKeyhole size={30} color="var(--secondary)" />
          <div>
            <h2>{t('analytics.creatorPlusTitle')}</h2>
            <p style={descriptionStyle}>{t('analytics.creatorPlusBody')}</p>
          </div>
          <Link to="/settings/billing" className="btn btn-primary">
            {t('billing.upgrade')}
          </Link>
        </div>
      ) : (
        <>
          <div style={summaryGridStyle}>
            <div style={metricCardStyle} className="bg-glass">
              <Clock size={25} color="var(--warning)" />
              <div>
                <strong>
                  {t('analytics.minutesShort', {
                    count: Math.round(analytics.details.averageSessionSeconds / 60),
                  })}
                </strong>
                <span>{t('analytics.averageSession')}</span>
              </div>
            </div>
            <div style={metricCardStyle} className="bg-glass">
              <Users size={25} color="var(--success)" />
              <div>
                <strong>{formatNumber(analytics.details.uniquePlayers, locale)}</strong>
                <span>{t('analytics.uniquePlayers')}</span>
              </div>
            </div>
          </div>

          <section style={chartCardStyle} className="bg-glass">
            <h2>
              <BarChart3 size={20} />
              {t('analytics.playTrend')}
            </h2>
            <div style={chartStyle} aria-label={t('analytics.chartLabel')}>
              {analytics.details.dailyPlays.map((day) => (
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
                      height: `${Math.max(3, (day.plays / maxDaily) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
          </section>

          <section style={chartCardStyle} className="bg-glass">
            <h2>{t('analytics.perGame')}</h2>
            <div style={gameListStyle}>
              {analytics.details.games.map((game) => (
                <div key={game.gameId} style={gameRowStyle}>
                  <strong>{game.title}</strong>
                  <span>
                    {t('analytics.playCount', { count: formatNumber(game.plays, locale) })}
                  </span>
                  <span>
                    {t('analytics.averageMinutes', {
                      count: Math.round(game.averageSessionSeconds / 60),
                    })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
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

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
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

const metricCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.8rem',
  padding: '1.25rem',
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

const chartStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(30, minmax(3px, 1fr))',
  gap: '4px',
  height: '180px',
  alignItems: 'end',
  marginTop: '1rem',
};

const barColumnStyle: React.CSSProperties = { height: '100%', display: 'flex', alignItems: 'end' };
const barStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '3px',
  background: 'var(--secondary)',
  borderRadius: '3px 3px 0 0',
};

const gameListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginTop: '1rem',
};

const gameRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto auto',
  gap: '1rem',
  padding: '0.7rem',
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-color)',
  fontSize: '0.8rem',
};
