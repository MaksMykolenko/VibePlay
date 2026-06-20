import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreatorAnalyticsDto } from '@vibeplay/shared';
import { BarChart3, Clock, LockKeyhole, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/api/errors';
import { useI18n } from '../../i18n/useI18n';

export const CreatorAnalytics: React.FC = () => {
  const { t } = useI18n();
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
  if (!analytics) return <div style={messageStyle}>Loading analytics…</div>;

  const maxDaily = Math.max(1, ...(analytics.details?.dailyPlays.map((day) => day.plays) ?? [1]));
  return (
    <div style={containerStyle} className="animate-fade">
      <div>
        <h1>Creator Analytics</h1>
        <p style={descriptionStyle}>Verified platform play sessions and catalog performance.</p>
      </div>

      <div style={summaryGridStyle}>
        {[
          ['Games', analytics.totals.games],
          ['Published', analytics.totals.publishedGames],
          ['Plays', analytics.totals.plays],
          ['Likes', analytics.totals.likes],
        ].map(([label, value]) => (
          <div key={label} style={summaryCardStyle} className="bg-glass">
            <span>{label}</span>
            <strong>{Number(value).toLocaleString()}</strong>
          </div>
        ))}
      </div>

      {!analytics.advanced || !analytics.details ? (
        <div style={lockedStyle} className="bg-glass">
          <LockKeyhole size={30} color="var(--secondary)" />
          <div>
            <h2>Detailed analytics are included with Creator Plus</h2>
            <p style={descriptionStyle}>
              Unlock 30-day play trends, session duration, unique signed-in players, and per-game
              performance. VibePlay does not invent country, device, or referrer data that it does
              not collect.
            </p>
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
                <strong>{Math.round(analytics.details.averageSessionSeconds / 60)}m</strong>
                <span>Average completed session</span>
              </div>
            </div>
            <div style={metricCardStyle} className="bg-glass">
              <Users size={25} color="var(--success)" />
              <div>
                <strong>{analytics.details.uniquePlayers}</strong>
                <span>Unique signed-in players (30 days)</span>
              </div>
            </div>
          </div>

          <section style={chartCardStyle} className="bg-glass">
            <h2>
              <BarChart3 size={20} />
              30-day play trend
            </h2>
            <div style={chartStyle} aria-label="Daily plays over the last 30 days">
              {analytics.details.dailyPlays.map((day) => (
                <div key={day.date} style={barColumnStyle} title={`${day.date}: ${day.plays}`}>
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
            <h2>Per-game sessions (30 days)</h2>
            <div style={gameListStyle}>
              {analytics.details.games.map((game) => (
                <div key={game.gameId} style={gameRowStyle}>
                  <strong>{game.title}</strong>
                  <span>{game.plays} plays</span>
                  <span>{Math.round(game.averageSessionSeconds / 60)}m avg.</span>
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
