import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useGames } from '../hooks/useGames';
import { useAuth } from '../hooks/useAuth';
import { GameCard } from '../components/GameCard';
import { Search } from 'lucide-react';

export const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { games } = useGames();
  const { users } = useAuth();

  const [activeTab, setActiveTab] = useState<'all' | 'games' | 'creators'>('all');

  // Perform search queries
  const matchedGames = games
    .filter((g) => g.status === 'published')
    .filter((g) => {
      const term = query.toLowerCase();
      return (
        g.title.toLowerCase().includes(term) ||
        g.shortDescription.toLowerCase().includes(term) ||
        g.category.toLowerCase().includes(term) ||
        g.tags.some((t) => t.toLowerCase().includes(term))
      );
    });

  const matchedCreators = users
    .filter((u) => u.role === 'creator')
    .filter((u) => {
      const term = query.toLowerCase();
      return (
        u.displayName.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        u.bio.toLowerCase().includes(term)
      );
    });

  const totalResults = matchedGames.length + matchedCreators.length;

  return (
    <div style={containerStyle}>
      {/* Title */}
      <div style={headerStyle}>
        <Search size={28} color="var(--secondary)" />
        <h1 style={titleStyle}>Search Results</h1>
      </div>
      <p style={subtitleStyle}>
        Showing results for "<strong>{query}</strong>" ({totalResults} matches found)
      </p>

      {/* Tabs */}
      <div style={tabsContainerStyle}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'all' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          All Results ({totalResults})
        </button>

        <button
          onClick={() => setActiveTab('games')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'games' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'games' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          Games ({matchedGames.length})
        </button>

        <button
          onClick={() => setActiveTab('creators')}
          style={{
            ...tabItemStyle,
            borderBottomColor: activeTab === 'creators' ? 'var(--secondary)' : 'transparent',
            color: activeTab === 'creators' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          Creators ({matchedCreators.length})
        </button>
      </div>

      {/* Result list panels */}
      <div style={resultsAreaStyle} className="animate-fade">
        {totalResults === 0 ? (
          <div style={emptyContainerStyle}>
            <Search size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h3>No results found</h3>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                marginTop: '0.25rem',
                marginBottom: '1.5rem',
              }}
            >
              We couldn't find any games or creators matching "{query}".
            </p>
            <Link to="/games" className="btn btn-primary btn-sm">
              Explore All Games
            </Link>
          </div>
        ) : (
          <>
            {/* Games block */}
            {(activeTab === 'all' || activeTab === 'games') && matchedGames.length > 0 && (
              <div style={sectionStyle}>
                {activeTab === 'all' && (
                  <h2 style={sectionTitleStyle}>Games ({matchedGames.length})</h2>
                )}
                <div className="games-grid">
                  {matchedGames.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              </div>
            )}

            {/* Creators block */}
            {(activeTab === 'all' || activeTab === 'creators') && matchedCreators.length > 0 && (
              <div style={{ ...sectionStyle, marginTop: activeTab === 'all' ? '3rem' : '0' }}>
                {activeTab === 'all' && (
                  <h2 style={sectionTitleStyle}>Creators ({matchedCreators.length})</h2>
                )}
                <div style={creatorsGridStyle}>
                  {matchedCreators.map((user) => (
                    <div key={user.id} style={creatorCardStyle} className="bg-glass">
                      <img src={user.avatar} alt={user.displayName} style={creatorAvatarStyle} />
                      <div style={creatorInfoStyle}>
                        <Link to={`/profile/${user.username}`} style={creatorNameStyle}>
                          {user.displayName}
                        </Link>
                        <div style={creatorUsernameStyle}>@{user.username}</div>
                        <p style={creatorBioStyle}>{user.bio}</p>
                        <div style={creatorFollowersStyle}>{user.followersCount} followers</div>
                      </div>
                      <Link
                        to={`/profile/${user.username}`}
                        className="btn btn-secondary btn-sm"
                        style={{ alignSelf: 'center' }}
                      >
                        View Profile
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 'var(--container-max-width)',
  margin: '2rem auto',
  padding: '0 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  minHeight: '400px',
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

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  color: 'var(--text-secondary)',
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
  transition: 'all 0.2s',
};

const resultsAreaStyle: React.CSSProperties = {
  marginTop: '1rem',
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

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 700,
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '0.5rem',
  color: 'var(--text-secondary)',
};

const creatorsGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const creatorCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  padding: '1.25rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  flexWrap: 'wrap',
};

const creatorAvatarStyle: React.CSSProperties = {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  objectFit: 'cover',
};

const creatorInfoStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: '200px',
};

const creatorNameStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
};

const creatorUsernameStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  fontWeight: 500,
};

const creatorBioStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  margin: '6px 0',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const creatorFollowersStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--secondary)',
  fontWeight: 600,
};
