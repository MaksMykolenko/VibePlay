import React from 'react';
import { useI18n } from '../i18n/useI18n';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGames } from '../hooks/useGames';
import { GameCard } from '../components/GameCard';
import { BookOpen, Star, Clock, ThumbsUp, ShieldAlert } from 'lucide-react';

export const LibraryPage: React.FC = () => {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { games, library } = useGames();
  const navigate = useNavigate();
  const location = useLocation();

  const getInitialTab = (): 'favorites' | 'recently' | 'liked' => {
    const queryParams = new URLSearchParams(location.search);
    const tabParam = queryParams.get('tab');
    const pathname = location.pathname;

    if (
      tabParam === 'recent' ||
      tabParam === 'recently' ||
      pathname.includes('/recent') ||
      pathname.includes('/recently-played')
    ) {
      return 'recently';
    }
    if (tabParam === 'liked' || pathname.includes('/liked')) {
      return 'liked';
    }
    return 'favorites';
  };

  const activeTab = getInitialTab();
  const selectTab = (tab: 'favorites' | 'recently' | 'liked') => {
    navigate(`/library?tab=${tab}`);
  };

  if (!currentUser) {
    return (
      <div style={unauthContainerStyle}>
        <ShieldAlert size={48} color="var(--danger)" />
        <h2 style={{ marginTop: '1rem' }}>{t('library.login')}</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem' }}>
          Your game library is tied to your account.
        </p>
        <button onClick={() => navigate('/login')} className="btn btn-primary">
          Log In
        </button>
      </div>
    );
  }

  // Load games based on lists
  const favoriteGames = games.filter((g) => library.favorites.includes(g.id));
  const recentlyPlayed = library.recentlyPlayed
    .map((item) => games.find((g) => g.id === item.id))
    .filter((g): g is (typeof games)[0] => !!g);
  const likedGames = games.filter((g) => library.likes.includes(g.id));

  const getActiveList = () => {
    if (activeTab === 'favorites') return favoriteGames;
    if (activeTab === 'recently') return recentlyPlayed;
    return likedGames;
  };

  const activeGames = getActiveList();

  return (
    <div style={containerStyle}>
      {/* Title */}
      <div style={headerStyle}>
        <BookOpen size={28} color="var(--secondary)" />
        <h1 style={titleStyle}>{t('library.title')}</h1>
      </div>

      {/* Tabs */}
      <div style={tabsContainerStyle}>
        <button
          onClick={() => selectTab('favorites')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'favorites' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'favorites' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <Star size={16} />
          <span>Favorites ({favoriteGames.length})</span>
        </button>

        <button
          onClick={() => selectTab('recently')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'recently' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'recently' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <Clock size={16} />
          <span>Recently Played ({recentlyPlayed.length})</span>
        </button>

        <button
          onClick={() => selectTab('liked')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'liked' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'liked' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <ThumbsUp size={16} />
          <span>Liked Games ({likedGames.length})</span>
        </button>
      </div>

      {/* Content */}
      <div style={contentStyle} className="animate-fade">
        {activeGames.length === 0 ? (
          <div style={emptyContainerStyle}>
            <BookOpen size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h3>{t('library.empty')}</h3>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                marginTop: '0.25rem',
                marginBottom: '1.5rem',
              }}
            >
              {activeTab === 'favorites' && "You haven't added any games to your favorites yet."}
              {activeTab === 'recently' && "You haven't played any games on VibePlay yet."}
              {activeTab === 'liked' && "You haven't liked any games on VibePlay yet."}
            </p>
            <Link to="/games" className="btn btn-primary btn-sm">
              Discover Games
            </Link>
          </div>
        ) : (
          <div className="games-grid">
            {activeGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Styles
const unauthContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 140px)',
  textAlign: 'center',
  padding: '2rem',
};

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 'var(--container-max-width)',
  margin: '2rem auto',
  padding: '0 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.02em',
};

const tabsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  borderBottom: '1px solid var(--border-color)',
  flexWrap: 'wrap',
};

const tabItemStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderBottom: '3px solid transparent',
  padding: '12px 6px',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  transition: 'all 0.2s',
};

const contentStyle: React.CSSProperties = {
  minHeight: '300px',
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
