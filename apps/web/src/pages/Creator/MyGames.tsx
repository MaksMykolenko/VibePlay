import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import type { Game } from '../../types';
import { toast } from '../../components/toastEvents';
import { useI18n } from '../../i18n/useI18n';
import { IS_DEMO } from '../../lib/appMode';
import {
  Edit2,
  Eye,
  EyeOff,
  Trash2,
  ArrowUpCircle,
  Plus,
  LayoutGrid,
  CheckCircle,
} from 'lucide-react';

export const MyGames: React.FC = () => {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { games, submitForReview, hideGame, publishGameDraft, deleteGame } = useGames();

  if (!currentUser) return null;

  const myGames = games.filter((g) => g.creatorId === currentUser.id);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <span className="badge badge-success">Published</span>;
      case 'pending':
        return <span className="badge badge-warning">Pending Review</span>;
      case 'rejected':
        return <span className="badge badge-danger">Rejected</span>;
      case 'hidden':
        return <span className="badge badge-secondary">Hidden</span>;
      default:
        return <span className="badge badge-primary">Draft</span>;
    }
  };

  const handleSubmitReview = (gameId: string, title: string) => {
    if (!IS_DEMO) {
      toast.warning('Submit a validated ZIP version through the publishing flow.');
      return;
    }
    submitForReview(gameId);
    toast.success(`"${title}" submitted for administration review!`);
  };

  const handleHideToggle = (game: Game) => {
    if (game.status === 'published') {
      hideGame(game.id);
      toast.info(`"${game.title}" is now hidden from the public catalog.`);
    } else if (IS_DEMO) {
      publishGameDraft(game.id);
      toast.success(`"${game.title}" is now published and public.`);
    } else {
      toast.warning('Only an administrator can restore a hidden game in the private beta.');
    }
  };

  const handleDelete = (gameId: string, title: string) => {
    const message = IS_DEMO
      ? `Are you sure you want to delete "${title}" from this browser demo?`
      : `Archive "${title}" and remove it from the public catalog?`;
    if (window.confirm(message)) {
      deleteGame(gameId);
      toast.info(
        IS_DEMO ? `"${title}" was removed from this browser demo.` : `"${title}" was archived.`,
      );
    }
  };

  return (
    <div style={containerStyle} className="animate-fade">
      {/* Title Header */}
      <div style={headerStyle}>
        <div>
          <h1>{t('myGames.title')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            Upload, submit, and manage versions of your browser builds.
          </p>
        </div>
        <Link to="/creator/publish" className="btn btn-primary btn-sm" style={{ gap: '6px' }}>
          <Plus size={16} />
          <span>{t('myGames.publish')}</span>
        </Link>
      </div>

      <hr style={hrStyle} />

      {myGames.length === 0 ? (
        <div style={emptyContainerStyle}>
          <LayoutGrid size={48} style={{ opacity: 0.15, marginBottom: '1rem' }} />
          <h3>{t('myGames.empty')}</h3>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              marginTop: '0.25rem',
              marginBottom: '1.5rem',
              maxWidth: '300px',
            }}
          >
            Get started by uploading your first Phaser, Three.js or WebGL zip project.
          </p>
          <Link to="/creator/publish" className="btn btn-primary">
            Publish Your First Game
          </Link>
        </div>
      ) : (
        <div style={tableWrapperStyle} className="bg-glass">
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeaderRowStyle}>
                <th style={{ ...thStyle, width: '80px' }}>{t('myGames.build')}</th>
                <th style={thStyle}>{t('myGames.gameTitle')}</th>
                <th style={thStyle}>{t('myGames.status')}</th>
                <th style={thStyle}>{t('game.plays')}</th>
                <th style={thStyle}>{t('myGames.likes')}</th>
                <th style={thStyle}>{t('myGames.updated')}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{t('myGames.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {myGames.map((game) => (
                <tr key={game.id} style={tableBodyRowStyle}>
                  {/* Build Cover */}
                  <td style={tdStyle}>
                    <img src={game.coverUrl} alt="" style={coverStyle} />
                  </td>

                  {/* Title & Category */}
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{game.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {game.category} • v{game.version}
                    </div>
                  </td>

                  {/* Status */}
                  <td style={tdStyle}>
                    {getStatusBadge(game.status)}
                    {game.status === 'rejected' && (
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--danger)',
                          marginTop: '4px',
                          maxWidth: '180px',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                        title={game.rejectReason}
                      >
                        Reason: {game.rejectReason}
                      </div>
                    )}
                  </td>

                  {/* Plays */}
                  <td style={tdStyle}>{game.plays.toLocaleString()}</td>

                  {/* Likes */}
                  <td style={tdStyle}>{game.likes.toLocaleString()}</td>

                  {/* Updated date */}
                  <td style={tdStyle}>{new Date(game.updatedAt).toLocaleDateString()}</td>

                  {/* Operations actions */}
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={actionsContainerStyle}>
                      {/* Preview */}
                      {(game.status === 'published' ||
                        game.status === 'pending' ||
                        game.status === 'rejected') && (
                        <Link
                          to={`/game/${game.slug}`}
                          className="btn btn-secondary btn-sm"
                          style={actionBtnStyle}
                          title="Preview Detail Page"
                        >
                          <Eye size={14} />
                        </Link>
                      )}

                      {/* Edit */}
                      <Link
                        to={`/creator/games/${game.id}/edit`}
                        className="btn btn-secondary btn-sm"
                        style={actionBtnStyle}
                        title="Edit Details"
                      >
                        <Edit2 size={14} />
                      </Link>

                      {/* Submit for Review (Draft or Rejected builds) */}
                      {IS_DEMO && (game.status === 'draft' || game.status === 'rejected') && (
                        <button
                          onClick={() => handleSubmitReview(game.id, game.title)}
                          className="btn btn-secondary btn-sm"
                          style={{ ...actionBtnStyle, color: 'var(--warning)' }}
                          title="Submit to Moderation Queue"
                        >
                          <ArrowUpCircle size={14} />
                        </button>
                      )}

                      {/* Hide/Reveal toggle (Published or Hidden builds) */}
                      {(game.status === 'published' || (IS_DEMO && game.status === 'hidden')) && (
                        <button
                          onClick={() => handleHideToggle(game)}
                          className="btn btn-secondary btn-sm"
                          style={actionBtnStyle}
                          title={game.status === 'published' ? 'Hide Game' : 'Publish Game'}
                        >
                          {game.status === 'published' ? (
                            <EyeOff size={14} />
                          ) : (
                            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                          )}
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(game.id, game.title)}
                        className="btn btn-danger btn-sm"
                        style={actionBtnStyle}
                        title={IS_DEMO ? 'Delete Demo Build' : 'Archive Build'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '0.25rem 0',
};

const emptyContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6rem 2rem',
  textAlign: 'center',
  backgroundColor: 'var(--bg-card)',
  border: '1px dashed var(--border-color)',
  borderRadius: '12px',
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

// Hover managed in CSS
// tableBodyRowStyle:hover { backgroundColor: rgba(255,255,255,0.01); }

const tdStyle: React.CSSProperties = {
  padding: '1rem 1.25rem',
  verticalAlign: 'middle',
};

const coverStyle: React.CSSProperties = {
  width: '64px',
  height: '40px',
  objectFit: 'cover',
  borderRadius: '4px',
  backgroundColor: '#151928',
  border: '1px solid var(--border-color)',
};

const actionsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  justifyContent: 'flex-end',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
};
