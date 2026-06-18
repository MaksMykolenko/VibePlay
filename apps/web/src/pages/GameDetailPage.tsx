import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGames } from '../hooks/useGames';

import { GameCard } from '../components/GameCard';
import { CommentsSection } from '../components/CommentsSection';
import { toast } from '../components/toastEvents';
import { useI18n } from '../i18n/useI18n';
import {
  Play,
  ThumbsUp,
  Heart,
  AlertTriangle,
  Monitor,
  Smartphone,
  Tablet,
  Bot,
  Sparkles,
} from 'lucide-react';

export const GameDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { currentUser } = useAuth();
  const { games, isLoading, library, toggleLikeGame, toggleFavoriteGame, submitReport } =
    useGames();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<'info' | 'screenshots' | 'changelog'>('info');
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState(0);

  // Locate the game
  const game = games.find((g) => g.slug === slug);

  if (isLoading && !game) {
    return <div style={notFoundContainerStyle}>{t('game.loading')}</div>;
  }

  if (!game) {
    return (
      <div style={notFoundContainerStyle}>
        <ShieldAlertStyle />
        <h2>{t('game.notFound')}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          The game you are looking for does not exist or has been removed.
        </p>
        <Link to="/games" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
          Back to Catalog
        </Link>
      </div>
    );
  }

  const isOwner = currentUser?.id === game.creatorId;
  const isAdmin = currentUser?.role === 'admin';

  // Guard: If not published, only owner or admin can see
  if (game.status !== 'published' && !isOwner && !isAdmin) {
    return (
      <div style={notFoundContainerStyle}>
        <ShieldAlertStyle />
        <h2>{t('game.accessDenied')}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          This game is currently undergoing moderation and is unavailable.
        </p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
          Back to Home
        </Link>
      </div>
    );
  }

  const hasLiked = currentUser ? library.likes.includes(game.id) : false;
  const hasFavorited = currentUser ? library.favorites.includes(game.id) : false;

  const handleLike = () => {
    if (!currentUser) {
      toast.info('Please log in to like games.');
      navigate('/login');
      return;
    }
    toggleLikeGame(game.id, currentUser.id);
    toast.success(hasLiked ? 'Removed like.' : 'Liked this game!');
  };

  const handleFavorite = () => {
    if (!currentUser) {
      toast.info('Please log in to add games to your library.');
      navigate('/login');
      return;
    }
    toggleFavoriteGame(game.id, currentUser.id);
    toast.success(hasFavorited ? 'Removed from library.' : 'Added to library favorites!');
  };

  const handleReport = () => {
    if (!currentUser) {
      toast.info('Please log in to submit complaints.');
      navigate('/login');
      return;
    }
    const reason = window.prompt('Provide a detailed reason for reporting this game:');
    if (reason && reason.trim()) {
      submitReport(
        currentUser.id,
        currentUser.displayName,
        'game',
        game.id,
        game.title,
        reason.trim(),
      );
      toast.success('Complaint filed. Admins will investigate this build.');
    }
  };

  const handlePlayNow = () => {
    navigate(`/play/${game.slug}`);
  };

  // Find related games in same category (excluding current)
  const relatedGames = games
    .filter((g) => g.status === 'published' && g.id !== game.id && g.category === game.category)
    .slice(0, 3);

  // Fallback if no matching categories
  const fallbackRelated =
    relatedGames.length > 0
      ? relatedGames
      : games.filter((g) => g.status === 'published' && g.id !== game.id).slice(0, 3);

  const formatPlays = (plays: number) => {
    return plays.toLocaleString();
  };

  const likeRatio =
    game.likes + game.dislikes > 0
      ? Math.round((game.likes / (game.likes + game.dislikes)) * 100)
      : 100;

  return (
    <div style={detailPageStyle}>
      {/* Moderation Warnings for Creator/Admin */}
      {game.status !== 'published' && (
        <div
          style={{
            ...warnBannerStyle,
            backgroundColor:
              game.status === 'pending'
                ? 'rgba(255, 184, 77, 0.15)'
                : game.status === 'rejected'
                  ? 'rgba(255, 93, 115, 0.15)'
                  : 'rgba(255, 255, 255, 0.05)',
            borderColor:
              game.status === 'pending'
                ? 'var(--warning)'
                : game.status === 'rejected'
                  ? 'var(--danger)'
                  : 'var(--border-color)',
          }}
        >
          <AlertTriangle
            size={20}
            color={game.status === 'rejected' ? 'var(--danger)' : 'var(--warning)'}
          />
          <div>
            <strong>Status: {game.status.toUpperCase()}</strong>
            {game.status === 'pending' && (
              <p style={{ fontSize: '0.85rem' }}>
                This build is currently in the moderation queue. Only you and administrators can
                preview it.
              </p>
            )}
            {game.status === 'rejected' && (
              <p style={{ fontSize: '0.85rem' }}>
                Rejection Reason: <span style={{ color: '#ff8a9a' }}>"{game.rejectReason}"</span>.
                Please edit details or re-upload a compliant archive.
              </p>
            )}
            {game.status === 'draft' && (
              <p style={{ fontSize: '0.85rem' }}>
                This game is a Draft. Submit for review in the Creator Hub to publish it.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hero Backdrop Panel */}
      <div
        style={{
          ...backdropStyle,
          backgroundImage: `linear-gradient(to bottom, rgba(8,10,18,0.2) 0%, rgba(8,10,18,0.95) 100%), url(${game.coverUrl})`,
        }}
      ></div>

      {/* Main Info Blocks */}
      <div style={contentLayoutStyle} className="container animate-fade">
        {/* Info Column */}
        <div style={leftColStyle}>
          {/* Header Row */}
          <div style={gameHeaderStyle}>
            <div style={titleWrapperStyle}>
              {/* Badges */}
              <div style={badgeRowStyle}>
                {game.isFeatured && (
                  <span className="badge badge-primary">
                    <Sparkles size={10} style={{ marginRight: '3px' }} /> Featured
                  </span>
                )}
                {game.aiDisclosure !== 'no' && (
                  <span className="badge badge-secondary">
                    <Bot size={10} style={{ marginRight: '3px' }} /> AI-assisted
                  </span>
                )}
                <span className="badge badge-success">{game.category}</span>
              </div>

              <h1 style={titleStyle}>{game.title}</h1>

              <div style={creatorRowStyle}>
                <img src={game.creatorAvatar} alt={game.creatorName} style={creatorAvatarStyle} />
                <span style={{ fontSize: '0.95rem' }}>
                  by{' '}
                  <Link
                    to={`/profile/${game.creatorUsername ?? game.creatorName}`}
                    style={creatorLinkStyle}
                  >
                    @{game.creatorUsername ?? game.creatorName}
                  </Link>
                </span>
              </div>
            </div>

            {/* Platform Stats Row */}
            <div style={statsBoxStyle} className="bg-glass">
              <div style={statColStyle}>
                <strong>{formatPlays(game.plays)}</strong>
                <span>{t('game.plays')}</span>
              </div>
              <div style={statDividerStyle}></div>
              <div style={statColStyle}>
                <strong style={{ color: 'var(--success)' }}>{likeRatio}%</strong>
                <span>Rating ({game.likes} likes)</span>
              </div>
              <div style={statDividerStyle}></div>
              <div style={statColStyle}>
                <strong>v{game.version}</strong>
                <span>{t('game.version')}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div style={actionsRowStyle}>
            <button
              onClick={handlePlayNow}
              className="btn btn-primary"
              style={{ flex: 2, gap: '8px', padding: '1rem' }}
            >
              <Play size={20} fill="#fff" />
              <strong style={{ fontSize: '1.05rem' }}>{t('game.playNow')}</strong>
            </button>

            <button
              onClick={handleLike}
              className="btn btn-secondary"
              style={{
                flex: 1,
                gap: '6px',
                color: hasLiked ? 'var(--accent)' : 'var(--text-primary)',
                borderColor: hasLiked ? 'var(--accent-border)' : 'var(--border-color)',
              }}
            >
              <ThumbsUp size={16} fill={hasLiked ? 'var(--accent)' : 'none'} />
              <span>{hasLiked ? 'Liked' : 'Like'}</span>
            </button>

            <button
              onClick={handleFavorite}
              className="btn btn-secondary"
              style={{
                flex: 1,
                gap: '6px',
                color: hasFavorited ? 'var(--primary)' : 'var(--text-primary)',
                borderColor: hasFavorited ? 'var(--primary-border)' : 'var(--border-color)',
              }}
            >
              <Heart size={16} fill={hasFavorited ? 'var(--primary)' : 'none'} />
              <span>{hasFavorited ? 'In Library' : 'Add to Library'}</span>
            </button>

            <button
              onClick={handleReport}
              className="btn btn-danger btn-sm"
              style={{ padding: '0.75rem' }}
              title="Report Game"
            >
              <AlertTriangle size={16} />
            </button>
          </div>

          {/* Tabs Navigation */}
          <div style={tabsContainerStyle}>
            <button
              onClick={() => setActiveTab('info')}
              style={{
                ...tabItemStyle,
                borderBottomColor: activeTab === 'info' ? 'var(--secondary)' : 'transparent',
                color: activeTab === 'info' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('screenshots')}
              style={{
                ...tabItemStyle,
                borderBottomColor: activeTab === 'screenshots' ? 'var(--secondary)' : 'transparent',
                color:
                  activeTab === 'screenshots' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              Media ({game.screenshots.length})
            </button>
            <button
              onClick={() => setActiveTab('changelog')}
              style={{
                ...tabItemStyle,
                borderBottomColor: activeTab === 'changelog' ? 'var(--secondary)' : 'transparent',
                color: activeTab === 'changelog' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              Changelog
            </button>
          </div>

          {/* Tab Content Panels */}
          <div style={tabContentStyle}>
            {/* Info Tab */}
            {activeTab === 'info' && (
              <div style={infoTabStyle} className="animate-fade">
                <div style={descBoxStyle}>
                  <h3 style={tabHeadingStyle}>{t('game.about')}</h3>
                  <p style={descriptionStyle}>{game.fullDescription}</p>
                </div>

                <div style={metaGridStyle}>
                  {/* Controls Box */}
                  <div style={metaCardStyle} className="bg-glass">
                    <h4 style={metaCardTitleStyle}>{t('game.controls')}</h4>
                    <ul style={listStyle}>
                      {game.controls.map((ctrl, i) => (
                        <li key={i} style={listItemStyle}>
                          {ctrl}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Compatibility Box */}
                  <div style={metaCardStyle} className="bg-glass">
                    <h4 style={metaCardTitleStyle}>{t('game.devices')}</h4>
                    <div style={devicesRowStyle}>
                      {game.devices.includes('desktop') && (
                        <span style={deviceBadgeStyle}>
                          <Monitor size={14} /> Desktop
                        </span>
                      )}
                      {game.devices.includes('mobile') && (
                        <span style={deviceBadgeStyle}>
                          <Smartphone size={14} /> Mobile
                        </span>
                      )}
                      {game.devices.includes('tablet') && (
                        <span style={deviceBadgeStyle}>
                          <Tablet size={14} /> Tablet
                        </span>
                      )}
                    </div>
                    <div
                      style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}
                    >
                      {game.devices
                        .filter((d) => d !== 'desktop' && d !== 'mobile' && d !== 'tablet')
                        .map((dev) => (
                          <span
                            key={dev}
                            style={deviceBadgeStyle}
                            className="badge badge-secondary"
                          >
                            {dev}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>

                {/* AI Disclosures Panel */}
                <div style={aiCardStyle} className="bg-glass">
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <Bot size={28} color="var(--secondary)" />
                    <div>
                      <h4
                        style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}
                      >
                        AI-Assisted Build Disclosure
                      </h4>
                      <p
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                          marginTop: '4px',
                          lineHeight: 1.5,
                        }}
                      >
                        {game.aiDisclosure === 'no'
                          ? 'This game was built entirely by human hands. No generative AI code assistants or asset generation tools were used during production.'
                          : game.aiDisclosure === 'assisted'
                            ? `This game development was assisted by AI tools. Code fragments, bug analysis, or asset prototyping were generated using ${game.aiTools.join(', ')}.`
                            : `This game is mostly AI-generated. The core code structure, game assets, and shaders were generated with AI assistance from ${game.aiTools.join(', ')}.`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Screenshots Tab */}
            {activeTab === 'screenshots' && (
              <div style={screenshotsTabStyle} className="animate-fade">
                <div style={screenshotActiveWrapperStyle}>
                  <img
                    src={game.screenshots[selectedScreenshotIndex]}
                    alt="Screenshot active"
                    style={screenshotActiveStyle}
                  />
                </div>

                {/* Thumbnails */}
                {game.screenshots.length > 1 && (
                  <div style={screenshotThumbnailsStyle}>
                    {game.screenshots.map((scr, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedScreenshotIndex(idx)}
                        style={{
                          ...screenshotThumbStyle,
                          borderColor:
                            selectedScreenshotIndex === idx
                              ? 'var(--secondary)'
                              : 'var(--border-color)',
                        }}
                      >
                        <img src={scr} alt="Thumb" style={screenshotThumbImgStyle} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Changelog Tab */}
            {activeTab === 'changelog' && (
              <div style={changelogTabStyle} className="animate-fade">
                <h3 style={tabHeadingStyle}>{t('game.history')}</h3>
                <div style={timelineStyle}>
                  {game.changelog.map((log, i) => (
                    <div key={i} style={timelineItemStyle}>
                      <div style={timelinePointStyle}></div>
                      <div style={timelineContentStyle}>
                        <div style={timelineHeaderStyle}>
                          <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            v{log.version}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {new Date(log.date).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={timelineNotesStyle}>{log.notes}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Platform comments integration */}
          <CommentsSection gameId={game.id} />
        </div>

        {/* Sidebar Column: Related Games */}
        <aside style={rightColStyle}>
          <h3 style={sidebarTitleStyle}>{t('game.related')}</h3>
          <div style={sidebarGridStyle}>
            {fallbackRelated.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};

// Simple visual shield helper
const ShieldAlertStyle = () => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '64px',
      height: '64px',
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 93, 115, 0.1)',
      margin: '0 auto 1rem',
    }}
  >
    <AlertTriangle size={32} color="var(--danger)" />
  </div>
);

// Styles
const notFoundContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 140px)',
  textAlign: 'center',
  padding: '2rem',
};

const detailPageStyle: React.CSSProperties = {
  position: 'relative',
  paddingBottom: '4rem',
};

const backdropStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '420px',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  zIndex: 1,
  pointerEvents: 'none',
  opacity: 0.25,
};

const warnBannerStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 'var(--z-content-raised)',
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 20px',
  borderBottom: '1px solid transparent',
  color: 'var(--text-primary)',
};

const contentLayoutStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  paddingTop: '200px', // Shift past background banner
  display: 'flex',
  gap: '3rem',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};

const leftColStyle: React.CSSProperties = {
  flex: '2 1 600px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
};

const rightColStyle: React.CSSProperties = {
  flex: '1 1 280px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  position: 'sticky',
  top: '90px',
};

const gameHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  gap: '1.5rem',
};

const titleWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const badgeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2.5rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.02em',
  lineHeight: 1.1,
};

const creatorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '0.25rem',
};

const creatorAvatarStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  objectFit: 'cover',
};

const creatorLinkStyle: React.CSSProperties = {
  fontWeight: 600,
  color: 'var(--secondary)',
};

const statsBoxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '1rem 1.25rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  gap: '1.25rem',
  backgroundColor: 'rgba(20, 24, 39, 0.4)',
};

const statColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  gap: '2px',
};

const statDividerStyle: React.CSSProperties = {
  width: '1px',
  height: '28px',
  backgroundColor: 'var(--border-color)',
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
};

const tabsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  borderBottom: '1px solid var(--border-color)',
};

const tabItemStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderBottom: '3px solid transparent',
  padding: '12px 4px',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const tabContentStyle: React.CSSProperties = {
  minHeight: '200px',
};

const infoTabStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
};

const descBoxStyle: React.CSSProperties = {
  lineHeight: 1.6,
};

const tabHeadingStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 700,
  marginBottom: '0.75rem',
};

const descriptionStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.95rem',
};

const metaGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  gap: '1.5rem',
};

const metaCardStyle: React.CSSProperties = {
  padding: '1.25rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const metaCardTitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  letterSpacing: '0.05em',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const listItemStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  position: 'relative',
  paddingLeft: '12px',
};

// In App.css list bullets
// .listItemStyle::before { content: '•'; position: absolute; left: 0; color: var(--secondary); }

const devicesRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

const deviceBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  borderRadius: '6px',
  backgroundColor: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border-color)',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};

const aiCardStyle: React.CSSProperties = {
  padding: '1.5rem',
  borderRadius: '12px',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--info-soft)',
};

const screenshotsTabStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const screenshotActiveWrapperStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  overflow: 'hidden',
  paddingTop: '56.25%', // 16:9 aspect ratio
  position: 'relative',
  backgroundColor: '#000',
};

const screenshotActiveStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};

const screenshotThumbnailsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  overflowX: 'auto',
  paddingBottom: '4px',
};

const screenshotThumbStyle: React.CSSProperties = {
  flex: '0 0 100px',
  height: '60px',
  borderRadius: '8px',
  border: '2px solid transparent',
  overflow: 'hidden',
  padding: 0,
  background: 'none',
  cursor: 'pointer',
};

const screenshotThumbImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const changelogTabStyle: React.CSSProperties = {};

const timelineStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  position: 'relative',
  paddingLeft: '1.5rem',
  borderLeft: '2px dashed var(--border-color)',
  marginLeft: '8px',
};

const timelineItemStyle: React.CSSProperties = {
  position: 'relative',
};

const timelinePointStyle: React.CSSProperties = {
  position: 'absolute',
  left: 'calc(-1.5rem - 6px)',
  top: '6px',
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  backgroundColor: 'var(--secondary)',
  boxShadow: '0 0 8px var(--secondary)',
};

const timelineContentStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.01)',
  border: '1px solid var(--border-color)',
  padding: '1rem',
  borderRadius: '8px',
};

const timelineHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '6px',
};

const timelineNotesStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
};

const sidebarTitleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-primary)',
};

const sidebarGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
};
