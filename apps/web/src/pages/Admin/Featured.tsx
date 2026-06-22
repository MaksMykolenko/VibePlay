import React from 'react';
import { useGames } from '../../hooks/useGames';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../../components/toastEvents';
import { Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';

export const AdminFeatured: React.FC = () => {
  const { games, toggleFeaturedGame } = useGames();
  const { currentUser } = useAuth();
  const { t } = useI18n();

  const publishedGames = games.filter((g) => g.status === 'published');

  const featuredLabel = (category: string | null | undefined): string => {
    if (category === 'hero') return t('admin.featured.hero');
    if (category === 'trending') return t('admin.featured.trending');
    if (category === 'editors_choice') return t('admin.featured.editorsChoice');
    return t('admin.featured.featured');
  };

  const handleFeatureToggle = (
    gameId: string,
    category: 'hero' | 'trending' | 'editors_choice' | null,
    title: string,
  ) => {
    if (!currentUser) return;
    toggleFeaturedGame(gameId, category, currentUser.id, currentUser.displayName);
    toast.success(t('admin.featured.updated', { title }));
  };

  return (
    <div style={containerStyle} className="animate-fade">
      {/* Header */}
      <div>
        <h1>{t('admin.featured.title')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
          {t('admin.featured.subtitle')}
        </p>
      </div>

      <hr style={hrStyle} />

      {/* Grid Table */}
      <div style={tableWrapperStyle} className="bg-glass">
        <table style={tableStyle}>
          <thead>
            <tr style={tableHeaderRowStyle}>
              <th style={thStyle}>{t('admin.featured.colGame')}</th>
              <th style={thStyle}>{t('admin.featured.colCategory')}</th>
              <th style={thStyle}>{t('admin.featured.colStatus')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{t('admin.featured.colAssign')}</th>
            </tr>
          </thead>
          <tbody>
            {publishedGames.map((game) => (
              <tr key={game.id} style={tableBodyRowStyle}>
                {/* Game Title */}
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src={game.coverUrl} alt="" style={coverStyle} />
                    <div>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{game.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {t('admin.featured.by', { name: game.creatorName })}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Category */}
                <td style={tdStyle}>{t(`category.${game.category}`)}</td>

                {/* Status Badges */}
                <td style={tdStyle}>
                  {game.isFeatured ? (
                    <span className="badge badge-primary" style={{ gap: '4px' }}>
                      <Sparkles size={10} />
                      {featuredLabel(game.featuredCategory)}
                    </span>
                  ) : (
                    <span className="badge badge-secondary">{t('admin.featured.standard')}</span>
                  )}
                </td>

                {/* Operations selectors */}
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={actionsRowStyle}>
                    <button
                      onClick={() => handleFeatureToggle(game.id, 'hero', game.title)}
                      className={
                        game.featuredCategory === 'hero'
                          ? 'btn btn-primary btn-sm'
                          : 'btn btn-secondary btn-sm'
                      }
                      style={gridBtnStyle}
                    >
                      {t('admin.featured.hero')}
                    </button>
                    <button
                      onClick={() => handleFeatureToggle(game.id, 'trending', game.title)}
                      className={
                        game.featuredCategory === 'trending'
                          ? 'btn btn-primary btn-sm'
                          : 'btn btn-secondary btn-sm'
                      }
                      style={gridBtnStyle}
                    >
                      {t('admin.featured.trending')}
                    </button>
                    <button
                      onClick={() => handleFeatureToggle(game.id, 'editors_choice', game.title)}
                      className={
                        game.featuredCategory === 'editors_choice'
                          ? 'btn btn-primary btn-sm'
                          : 'btn btn-secondary btn-sm'
                      }
                      style={gridBtnStyle}
                    >
                      {t('admin.featured.editorsChoice')}
                    </button>
                    {game.isFeatured && (
                      <button
                        onClick={() => handleFeatureToggle(game.id, null, game.title)}
                        className="btn btn-danger btn-sm"
                        style={gridBtnStyle}
                      >
                        {t('admin.featured.clear')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '0.25rem 0',
};

const tableWrapperStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
  fontSize: '0.9rem',
};

const tableHeaderRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-surface)',
};

const thStyle: React.CSSProperties = {
  padding: '1rem 1.25rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  letterSpacing: '0.05em',
};

const tableBodyRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-color)',
  transition: 'background-color 0.2s',
};

const tdStyle: React.CSSProperties = {
  padding: '1.25rem',
  verticalAlign: 'middle',
};

const coverStyle: React.CSSProperties = {
  width: '56px',
  height: '35px',
  objectFit: 'cover',
  borderRadius: '4px',
  backgroundColor: '#151928',
  border: '1px solid var(--border-color)',
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
};

const gridBtnStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  padding: '6px 12px',
};
