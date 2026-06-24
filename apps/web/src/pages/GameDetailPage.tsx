import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGames } from '../hooks/useGames';

import { GameCard } from '../components/GameCard';
import { CommentsSection } from '../components/CommentsSection';
import { GameControlsCard } from '../components/GameControlsCard';
import { CreatorPlusBadge } from '../components/CreatorPlusBadge';
import { toast } from '../components/toastEvents';
import { useI18n } from '../i18n/useI18n';
import { trackEvent } from '../lib/analytics';
import { trackInternalEvent } from '../lib/internalAnalytics';
import { canShowCta, suppressCta } from '../lib/cloudSaveCta';
import { withReturnTo } from '../lib/returnTo';
import { formatDate, formatNumber } from '../lib/formatTime';
import { api } from '../lib/api';
import { IS_DEMO } from '../lib/appMode';
import { multiplayerUi, roomErrorKey } from '../lib/rooms';
import { MultiplayerActions } from '../components/MultiplayerActions';
import {
  Play,
  ThumbsUp,
  Heart,
  AlertTriangle,
  Monitor,
  Smartphone,
  Tablet,
  Gamepad2,
  Bot,
  Sparkles,
  Cloud,
  X,
} from 'lucide-react';

export const GameDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { currentUser } = useAuth();
  const { games, isLoading, library, toggleLikeGame, toggleFavoriteGame, submitReport } =
    useGames();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  const [activeTab, setActiveTab] = useState<'info' | 'screenshots' | 'changelog'>('info');
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState(0);
  const [showGuestCta, setShowGuestCta] = useState(() => canShowCta(!currentUser));
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Locate the game
  const game = games.find((g) => g.slug === slug);

  useEffect(() => {
    if (!game) return;
    trackEvent('view_game', {
      game_id: game.id,
      game_slug: game.slug,
      source: 'game_detail',
      logged_in: Boolean(currentUser),
    });
    trackInternalEvent('game_page_view', { gameId: game.id });
  }, [currentUser, game]);

  useEffect(() => {
    if (!game || currentUser || !showGuestCta) return;
    const params = {
      game_id: game.id,
      game_slug: game.slug,
      source: 'game_detail',
      cta_location: 'near_play',
      logged_in: false,
    } as const;
    trackEvent('signup_cta_shown', params);
    trackEvent('cloud_save_cta_shown', params);
  }, [currentUser, game, showGuestCta]);

  if (isLoading && !game) {
    return <div style={notFoundContainerStyle}>{t('game.loading')}</div>;
  }

  if (!game) {
    return (
      <div style={notFoundContainerStyle}>
        <ShieldAlertStyle />
        <h2>{t('game.notFound')}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{t('game.notFoundBody')}</p>
        <Link to="/games" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
          {t('game.backToCatalog')}
        </Link>
      </div>
    );
  }

  const isOwner = currentUser?.id === game.creatorId;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  // Multiplayer affordances. Hidden entirely when multiplayer is off or in demo;
  // the wsUrl warning is owner/admin-only and never shown to normal players.
  const mpUi = multiplayerUi({
    multiplayer: game.multiplayer,
    isDemo: IS_DEMO,
    info: game.multiplayerInfo,
    isOwnerOrAdmin: isOwner || isAdmin,
  });

  // Guard: If not published, only owner or admin can see
  if (game.status !== 'published' && !isOwner && !isAdmin) {
    return (
      <div style={notFoundContainerStyle}>
        <ShieldAlertStyle />
        <h2>{t('game.accessDenied')}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{t('game.moderationUnavailable')}</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
          {t('game.backHome')}
        </Link>
      </div>
    );
  }

  const hasLiked = currentUser ? library.likes.includes(game.id) : false;
  const hasFavorited = currentUser ? library.favorites.includes(game.id) : false;

  const handleLike = () => {
    if (!currentUser) {
      toast.info(t('game.loginToLike'));
      navigate('/login');
      return;
    }
    toggleLikeGame(game.id, currentUser.id);
    toast.success(hasLiked ? t('game.likeRemoved') : t('game.liked'));
  };

  const handleFavorite = () => {
    if (!currentUser) {
      toast.info(t('game.loginToFavorite'));
      navigate('/login');
      return;
    }
    toggleFavoriteGame(game.id, currentUser.id);
    toast.success(hasFavorited ? t('game.favoriteRemoved') : t('game.favorited'));
  };

  const handleReport = () => {
    if (!currentUser) {
      toast.info(t('game.loginToReport'));
      navigate('/login');
      return;
    }
    const reason = window.prompt(t('game.reportPrompt'));
    if (reason && reason.trim()) {
      submitReport(
        currentUser.id,
        currentUser.displayName,
        'game',
        game.id,
        game.title,
        reason.trim(),
      );
      toast.success(t('game.reported'));
    }
  };

  const handlePlayNow = () => {
    trackEvent('click_play_game', {
      game_id: game.id,
      game_slug: game.slug,
      source: 'game_detail',
      logged_in: Boolean(currentUser),
    });
    navigate(`/play/${game.slug}`);
  };

  // Create a multiplayer room (works for logged-in users and guests) and open the
  // lobby. `mode` is set for Quick Play. The backend enforces multiplayer eligibility.
  const handleCreateRoom = async (mode?: string) => {
    if (creatingRoom) return;
    setCreatingRoom(true);
    try {
      const res = await api.createRoom(game.id, mode ? { mode } : undefined);
      trackEvent('click_play_game', {
        game_id: game.id,
        game_slug: game.slug,
        source: mode === 'quick_play' ? 'quick_play' : 'play_with_friends',
        logged_in: Boolean(currentUser),
      });
      navigate(`/rooms/${res.roomCode}`);
    } catch (err) {
      toast.danger(t(roomErrorKey(err)));
      setCreatingRoom(false);
    }
  };

  const handleCreateAccount = () => {
    trackEvent('signup_cta_clicked', {
      game_id: game.id,
      game_slug: game.slug,
      source: 'game_detail',
      cta_location: 'near_play',
      logged_in: false,
    });
    navigate(withReturnTo('/register', `/game/${game.slug}`));
  };

  const handleLogin = () => {
    trackEvent('login_cta_clicked', {
      game_id: game.id,
      game_slug: game.slug,
      source: 'game_detail',
      cta_location: 'near_play',
      logged_in: false,
    });
    navigate(withReturnTo('/login', `/game/${game.slug}`));
  };

  const handleDismissCta = () => {
    suppressCta();
    setShowGuestCta(false);
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
    return formatNumber(plays, locale);
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
            <strong>{t('game.statusLabel', { status: t(`status.${game.status}`) })}</strong>
            {game.status === 'pending' && (
              <p style={{ fontSize: '0.85rem' }}>{t('game.statusPendingHint')}</p>
            )}
            {game.status === 'rejected' && (
              <p style={{ fontSize: '0.85rem' }}>
                {t('game.rejectionReason')}{' '}
                <span style={{ color: '#ff8a9a' }}>"{game.rejectReason}"</span>.{' '}
                {t('game.rejectionEditHint')}
              </p>
            )}
            {game.status === 'draft' && (
              <p style={{ fontSize: '0.85rem' }}>{t('game.draftHint')}</p>
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
                    <Sparkles size={10} style={{ marginRight: '3px' }} /> {t('card.badge.featured')}
                  </span>
                )}
                {game.aiDisclosure !== 'no' && (
                  <span className="badge badge-secondary">
                    <Bot size={10} style={{ marginRight: '3px' }} /> {t('games.aiAssisted')}
                  </span>
                )}
                <span className="badge badge-success">{t(`category.${game.category}`)}</span>
              </div>

              <h1 style={titleStyle}>{game.title}</h1>

              <div style={creatorRowStyle}>
                <img src={game.creatorAvatar} alt={game.creatorName} style={creatorAvatarStyle} />
                <span style={{ fontSize: '0.95rem' }}>
                  {t('game.byPrefix')}{' '}
                  <Link
                    to={`/profile/${game.creatorUsername ?? game.creatorName}`}
                    style={creatorLinkStyle}
                  >
                    @{game.creatorUsername ?? game.creatorName}
                  </Link>
                </span>
                {game.creatorPlus && <CreatorPlusBadge />}
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
                <span>{t('game.ratingLikes', { count: game.likes })}</span>
              </div>
              <div style={statDividerStyle}></div>
              <div style={statColStyle}>
                <strong>v{game.version}</strong>
                <span>{t('game.version')}</span>
              </div>
            </div>
          </div>

          {/* Owner/admin-only heads-up when external multiplayer has no server URL. */}
          {mpUi.ownerWsWarning && (
            <div
              className="bg-glass"
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid var(--warning)',
                backgroundColor: 'rgba(255, 184, 77, 0.12)',
              }}
              data-testid="mp-ws-warning"
            >
              <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {t('game.multiplayerWsWarning')}
              </span>
            </div>
          )}

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

            <MultiplayerActions
              ui={mpUi}
              creating={creatingRoom}
              onPlayWithFriends={() => void handleCreateRoom()}
              onQuickPlay={() => void handleCreateRoom('quick_play')}
              t={t}
            />

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
              <span>{t(hasLiked ? 'game.actionLiked' : 'game.actionLike')}</span>
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
              <span>{t(hasFavorited ? 'game.actionInLibrary' : 'game.actionAddLibrary')}</span>
            </button>

            <button
              onClick={handleReport}
              className="btn btn-danger btn-sm"
              style={{ padding: '0.75rem' }}
              title={t('game.reportGame')}
            >
              <AlertTriangle size={16} />
            </button>
          </div>

          {/* Site copy: play instantly as guest, save with a free account. */}
          {!currentUser && showGuestCta && (
            <div className="guest-registration-inline">
              <button
                type="button"
                className="guest-registration-inline__close"
                onClick={handleDismissCta}
                aria-label={t('common.close')}
              >
                <X size={15} aria-hidden="true" />
              </button>
              <p className="cloud-save-tagline">
                <Cloud size={14} aria-hidden="true" />
                <span>
                  <strong>{t('cloudSave.ctaTitle')}</strong> {t('cloudSave.available')}
                </span>
              </p>
              <div className="guest-registration-inline__actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleCreateAccount}
                >
                  {t('cloudSave.createAccount')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogin}>
                  {t('cloudSave.logIn')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleDismissCta}>
                  {t('cloudSave.continuePlaying')}
                </button>
              </div>
            </div>
          )}

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
              {t('game.tabDetails')}
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
              {t('game.tabMedia', { count: game.screenshots.length })}
            </button>
            <button
              onClick={() => setActiveTab('changelog')}
              style={{
                ...tabItemStyle,
                borderBottomColor: activeTab === 'changelog' ? 'var(--secondary)' : 'transparent',
                color: activeTab === 'changelog' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {t('game.tabChangelog')}
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
                  {game.controls.length > 0 && (
                    <GameControlsCard controls={game.controls} title={t('game.controls')} />
                  )}

                  {/* Compatibility Box */}
                  <div style={metaCardStyle} className="bg-glass">
                    <h4 style={metaCardTitleStyle}>{t('game.devices')}</h4>
                    <div style={devicesRowStyle}>
                      {game.devices.includes('desktop') && (
                        <span style={deviceBadgeStyle}>
                          <Monitor size={14} /> {t('device.desktop')}
                        </span>
                      )}
                      {game.devices.includes('mobile') && (
                        <span style={deviceBadgeStyle}>
                          <Smartphone size={14} /> {t('device.mobile')}
                        </span>
                      )}
                      {game.devices.includes('tablet') && (
                        <span style={deviceBadgeStyle}>
                          <Tablet size={14} /> {t('device.tablet')}
                        </span>
                      )}
                      {game.devices.includes('gamepad') && (
                        <span style={deviceBadgeStyle}>
                          <Gamepad2 size={14} /> {t('device.gamepad')}
                        </span>
                      )}
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
                        {t('game.aiDisclosureTitle')}
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
                          ? t('game.aiDisclosureNone')
                          : game.aiDisclosure === 'assisted'
                            ? t('game.aiDisclosureAssisted', { tools: game.aiTools.join(', ') })
                            : t('game.aiDisclosureGenerated', { tools: game.aiTools.join(', ') })}
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
                    alt={t('game.screenshotAlt')}
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
                        <img src={scr} alt={t('game.thumbAlt')} style={screenshotThumbImgStyle} />
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
                            {formatDate(log.date, locale)}
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
