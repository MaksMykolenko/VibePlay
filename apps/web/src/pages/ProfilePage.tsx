import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGames } from '../hooks/useGames';
import { GameCard } from '../components/GameCard';
import { Calendar, UserCheck, Edit3, ShieldAlert, Sparkles } from 'lucide-react';
import { toast } from '../components/toastEvents';
import { useI18n } from '../i18n/useI18n';
import { formatNumber } from '../lib/formatTime';
import { api } from '../lib/api';
import type { User } from '../types';
import { CreatorPlusBadge } from '../components/CreatorPlusBadge';

export const ProfilePage: React.FC = () => {
  const { t, locale } = useI18n();
  const { username } = useParams<{ username: string }>();
  const { currentUser, becomeCreator } = useAuth();
  const { games, library } = useGames();
  const navigate = useNavigate();

  const [profileUser, setProfileUser] = useState<User | null>(
    currentUser?.username === username ? currentUser : null,
  );
  const [profileMissing, setProfileMissing] = useState(false);
  const [activeTab, setActiveTab] = useState<'games' | 'favorites' | 'recently' | 'about'>(
    profileUser?.role === 'creator' ||
      profileUser?.role === 'admin' ||
      profileUser?.role === 'owner'
      ? 'games'
      : 'favorites',
  );

  useEffect(() => {
    if (!username) return;
    let active = true;
    api
      .getProfile(username)
      .then(({ profile }) => {
        if (!active) return;
        setProfileUser({
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          email: currentUser?.id === profile.id ? currentUser.email : '',
          emailVerified: currentUser?.id === profile.id ? currentUser.emailVerified : true,
          role: profile.role.toLowerCase() as User['role'],
          bio: profile.bio,
          avatar: profile.avatarUrl ?? '',
          joinDate: profile.createdAt,
          followersCount: 0,
          creatorPlus: profile.creatorPlus,
        });
        setActiveTab(
          profile.role === 'CREATOR' || profile.role === 'ADMIN' || profile.role === 'OWNER'
            ? 'games'
            : 'favorites',
        );
        setProfileMissing(false);
      })
      .catch(() => {
        if (active) setProfileMissing(true);
      });
    return () => {
      active = false;
    };
  }, [currentUser, username]);

  if (!profileUser && profileMissing) {
    return (
      <div style={notFoundContainerStyle}>
        <ShieldAlert size={48} color="var(--danger)" />
        <h2 style={{ marginTop: '1rem' }}>{t('profile.notFound')}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{t('profile.notFoundBody')}</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
          {t('game.backHome')}
        </Link>
      </div>
    );
  }
  if (!profileUser) return null;

  const isOwnProfile = currentUser?.id === profileUser.id;

  // Filter games created by this user
  const creatorGames = games.filter(
    (g) => g.creatorId === profileUser.id && g.status === 'published',
  );
  // Filter creator draft/pending games (show only to self)
  const creatorPrivateGames = games.filter(
    (g) => g.creatorId === profileUser.id && g.status !== 'published',
  );

  // Libraries are private; only the signed-in user's own lists are available.
  const favoriteGames = isOwnProfile
    ? games.filter((game) => library.favorites.includes(game.id))
    : [];

  const recentlyPlayed = isOwnProfile
    ? games.filter((game) => library.recentlyPlayed.some((item) => item.id === game.id))
    : [];

  // Aggregate statistics
  const totalPlays = games
    .filter((g) => g.creatorId === profileUser.id)
    .reduce((sum, g) => sum + g.plays, 0);

  const totalLikes = games
    .filter((g) => g.creatorId === profileUser.id)
    .reduce((sum, g) => sum + g.likes, 0);

  const handleBecomeCreator = () => {
    if (currentUser && !currentUser.emailVerified) {
      toast.warning(t('verification.beforeCreator'));
      return;
    }
    const notice = becomeCreator();
    if (notice) {
      toast.info(notice);
      return;
    }
    toast.success(t('app.creatorSuccess'));
    setActiveTab('games');
    navigate('/creator');
  };

  return (
    <div style={wrapperStyle}>
      {/* Banner / Header Box */}
      <div style={headerCardStyle} className="bg-glass animate-fade">
        <div style={headerFlexStyle}>
          <img src={profileUser.avatar} alt={profileUser.displayName} style={avatarStyle} />

          <div style={metaStyle}>
            <div style={nameRowStyle}>
              <h1 style={displayNameStyle}>{profileUser.displayName}</h1>
              <span
                className={`badge ${profileUser.role === 'owner' ? 'badge-danger' : profileUser.role === 'admin' ? 'badge-danger' : profileUser.role === 'creator' ? 'badge-success' : 'badge-primary'}`}
              >
                {t(`role.${profileUser.role}`)}
              </span>
              {profileUser.creatorPlus && <CreatorPlusBadge />}
            </div>

            <div style={usernameStyle}>@{profileUser.username}</div>

            <div style={joinDateStyle}>
              <Calendar size={14} style={{ marginRight: '6px' }} />
              {t('profile.joined', {
                date: new Date(profileUser.joinDate).toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'long',
                }),
              })}
            </div>

            {/* Basic Info Bar */}
            <div style={statsRowStyle}>
              <div style={statItemStyle}>
                <strong>{profileUser.followersCount}</strong>
                <span>{t('profile.followers')}</span>
              </div>
              {(profileUser.role === 'creator' ||
                profileUser.role === 'admin' ||
                profileUser.role === 'owner') && (
                <>
                  <div style={statDividerStyle}></div>
                  <div style={statItemStyle}>
                    <strong>{creatorGames.length}</strong>
                    <span>{t('profile.games')}</span>
                  </div>
                  <div style={statDividerStyle}></div>
                  <div style={statItemStyle}>
                    <strong>{formatNumber(totalPlays, locale)}</strong>
                    <span>{t('profile.plays')}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div style={actionColStyle}>
            {isOwnProfile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <Link to="/settings" className="btn btn-secondary btn-sm" style={{ gap: '6px' }}>
                  <Edit3 size={14} />
                  {t('profile.editProfile')}
                </Link>
                {profileUser.role === 'player' && (
                  <button
                    onClick={handleBecomeCreator}
                    className="btn btn-primary btn-sm"
                    style={{ gap: '6px' }}
                  >
                    <Sparkles size={14} />
                    {t('home.becomeCreator')}
                  </button>
                )}
              </div>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                style={{ gap: '6px', width: '120px' }}
                disabled
                title={t('profile.followUnavailableTitle')}
              >
                <UserCheck size={14} />
                {t('profile.followUnavailable')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div style={tabsContainerStyle}>
        {(profileUser.role === 'creator' ||
          profileUser.role === 'admin' ||
          profileUser.role === 'owner') && (
          <button
            onClick={() => setActiveTab('games')}
            style={{
              ...tabItemStyle,
              borderBottomColor: activeTab === 'games' ? 'var(--secondary)' : 'transparent',
              color: activeTab === 'games' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {t('profile.games')}
          </button>
        )}
        <button
          onClick={() => setActiveTab('favorites')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'favorites' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'favorites' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {t('profile.favorites')}
        </button>
        <button
          onClick={() => setActiveTab('recently')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'recently' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'recently' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {t('profile.recentlyPlayed')}
        </button>
        <button
          onClick={() => setActiveTab('about')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'about' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'about' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {t('profile.about')}
        </button>
      </div>

      {/* Tab Panels */}
      <div style={tabPanelStyle}>
        {/* Games Panel */}
        {activeTab === 'games' && (
          <div className="animate-fade">
            <h2 style={panelTitleStyle}>{t('profile.publishedGames')}</h2>
            {creatorGames.length === 0 ? (
              <div style={emptyPanelStyle}>{t('profile.noPublished')}</div>
            ) : (
              <div className="games-grid">
                {creatorGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}

            {isOwnProfile && creatorPrivateGames.length > 0 && (
              <div style={{ marginTop: '3rem' }}>
                <h2 style={{ ...panelTitleStyle, color: 'var(--warning)' }}>
                  {t('profile.draftsQueue')}
                </h2>
                <div className="games-grid">
                  {creatorPrivateGames.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Favorites Panel */}
        {activeTab === 'favorites' && (
          <div className="animate-fade">
            <h2 style={panelTitleStyle}>{t('profile.favoriteGames')}</h2>
            {favoriteGames.length === 0 ? (
              <div style={emptyPanelStyle}>
                {isOwnProfile ? t('profile.emptyFavoritesOwn') : t('profile.emptyFavoritesOther')}
                {isOwnProfile && (
                  <Link
                    to="/games"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '1rem' }}
                  >
                    {t('profile.browseGames')}
                  </Link>
                )}
              </div>
            ) : (
              <div className="games-grid">
                {favoriteGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recently Played Panel */}
        {activeTab === 'recently' && (
          <div className="animate-fade">
            <h2 style={panelTitleStyle}>{t('profile.recentlyPlayed')}</h2>
            {recentlyPlayed.length === 0 ? (
              <div style={emptyPanelStyle}>
                {isOwnProfile ? t('profile.emptyRecentOwn') : t('profile.emptyRecentOther')}
                {isOwnProfile && (
                  <Link
                    to="/games"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '1rem' }}
                  >
                    {t('profile.playSomeGames')}
                  </Link>
                )}
              </div>
            ) : (
              <div className="games-grid">
                {recentlyPlayed.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* About Panel */}
        {activeTab === 'about' && (
          <div style={aboutCardStyle} className="animate-fade">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>{t('profile.biography')}</h2>
            <p style={bioTextStyle}>{profileUser.bio || t('profile.noBio')}</p>

            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--border-color)',
                margin: '1.5rem 0',
              }}
            />

            <h3
              style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}
            >
              {t('profile.platformStats')}
            </h3>
            <div style={aboutStatsGridStyle}>
              <div style={aboutStatBoxStyle}>
                <div style={aboutStatValStyle}>{t(`role.${profileUser.role}`)}</div>
                <div style={aboutStatLblStyle}>{t('profile.accountRole')}</div>
              </div>
              <div style={aboutStatBoxStyle}>
                <div style={aboutStatValStyle}>{profileUser.followersCount}</div>
                <div style={aboutStatLblStyle}>{t('profile.followers')}</div>
              </div>
              {(profileUser.role === 'creator' ||
                profileUser.role === 'admin' ||
                profileUser.role === 'owner') && (
                <>
                  <div style={aboutStatBoxStyle}>
                    <div style={aboutStatValStyle}>{creatorGames.length}</div>
                    <div style={aboutStatLblStyle}>{t('profile.activeGames')}</div>
                  </div>
                  <div style={aboutStatBoxStyle}>
                    <div style={aboutStatValStyle}>{totalLikes}</div>
                    <div style={aboutStatLblStyle}>{t('profile.totalLikes')}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

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

const wrapperStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 'var(--container-max-width)',
  margin: '2rem auto',
  padding: '0 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
};

const headerCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  padding: '2.5rem',
  border: '1px solid var(--border-color)',
};

const headerFlexStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2.5rem',
  flexWrap: 'wrap',
};

const avatarStyle: React.CSSProperties = {
  width: '120px',
  height: '120px',
  borderRadius: '50%',
  objectFit: 'cover',
  border: '3px solid rgba(255,255,255,0.08)',
};

const metaStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  minWidth: '250px',
};

const nameRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
};

const displayNameStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
};

const usernameStyle: React.CSSProperties = {
  fontSize: '1rem',
  color: 'var(--text-secondary)',
  fontWeight: 500,
};

const joinDateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginTop: '0.25rem',
};

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  marginTop: '1rem',
  alignItems: 'center',
};

const statItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: '0.9rem',
};

const statDividerStyle: React.CSSProperties = {
  width: '1px',
  height: '24px',
  backgroundColor: 'var(--border-color)',
};

const actionColStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
  minWidth: '150px',
};

const tabsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
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

const tabPanelStyle: React.CSSProperties = {
  minHeight: '200px',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  marginBottom: '1.5rem',
};

const emptyPanelStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px dashed var(--border-color)',
  borderRadius: '12px',
  padding: '4rem 2rem',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.95rem',
};

const aboutCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '2rem',
};

const bioTextStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  lineHeight: 1.6,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap',
};

const aboutStatsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '1rem',
  marginTop: '1rem',
};

const aboutStatBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  padding: '1.25rem',
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const aboutStatValStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 700,
  color: 'var(--secondary)',
};

const aboutStatLblStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  fontWeight: 600,
};
