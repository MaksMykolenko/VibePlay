import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGames } from '../hooks/useGames';
import { useAuth } from '../hooks/useAuth';
import { GameCarousel } from '../components/GameCarousel';
import { UploadCloud } from 'lucide-react';
import { toast } from '../components/Toast';

export const LandingPage: React.FC = () => {
  const { games, library } = useGames();
  const { currentUser, becomeCreator } = useAuth();
  const navigate = useNavigate();

  // Filter published games
  const publishedGames = games.filter(g => g.status === 'published');

  // Time-aware greeting logic
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleBecomeCreator = () => {
    if (!currentUser) {
      toast.info('Please log in first.');
      navigate('/login');
      return;
    }
    becomeCreator();
    toast.success('You are now a Creator! Access your Creator Dashboard to publish games.');
    navigate('/creator');
  };

  // Section 1: Continue Playing (Recently Played games from library)
  const recentlyPlayedIds = library.recentlyPlayed.map(item => item.id);
  const continuePlayingGames = publishedGames.filter(g => recentlyPlayedIds.includes(g.id));

  // Section 2: Trending Now (Sorted by plays, take top 8)
  const trendingGames = [...publishedGames].sort((a, b) => b.plays - a.plays).slice(0, 8);

  // Section 3: Recommended for You (Take published games, excluding trending if possible, or just a curated slice)
  const recommendedGames = publishedGames.filter(g => !trendingGames.slice(0, 3).includes(g)).slice(0, 8);

  // Section 4: New & Rising (Sorted by updatedAt date, newest first)
  const newAndRisingGames = [...publishedGames]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  // Section 5: AI-Powered Creations (Disclosures that aren't "no")
  const aiPoweredGames = publishedGames.filter(g => g.aiDisclosure !== 'no').slice(0, 8);

  // Section 6: Popular Simulators
  const simulatorsGames = publishedGames.filter(g => g.category.toLowerCase() === 'simulator').slice(0, 8);

  // Section 7: Horror Games
  const horrorGames = publishedGames.filter(g => g.category.toLowerCase() === 'horror').slice(0, 8);

  return (
    <div className="landing-page-container">
      
      {/* Dynamic Greeting Header */}
      <div className="home-greeting">
        {currentUser ? (
          <div>
            <h1 className="home-greeting__title">
              {getGreeting()}, <span style={{ color: 'var(--primary)' }}>{currentUser.displayName}</span>
            </h1>
            <p className="home-greeting__subtitle">What will you play today?</p>
          </div>
        ) : (
          <div>
            <h1 className="home-greeting__title">Discover something new</h1>
            <p className="home-greeting__subtitle">Play instantly in your browser. No downloads required.</p>
          </div>
        )}
      </div>

      {/* Horizontal Carousels */}
      <GameCarousel 
        title="Continue Playing" 
        gamesList={continuePlayingGames} 
        linkTo="/library?tab=recent" 
      />

      <GameCarousel 
        title="Recommended for You" 
        gamesList={recommendedGames} 
        linkTo="/games" 
      />

      <GameCarousel 
        title="Trending Now" 
        gamesList={trendingGames} 
        linkTo="/games?sort=trending" 
      />

      <GameCarousel 
        title="New & Rising" 
        gamesList={newAndRisingGames} 
        linkTo="/games?sort=newest" 
      />

      <GameCarousel 
        title="AI-Powered Creations" 
        gamesList={aiPoweredGames} 
        linkTo="/games?ai=true" 
      />

      <GameCarousel 
        title="Popular Simulators" 
        gamesList={simulatorsGames} 
        linkTo="/games?category=simulator" 
      />

      <GameCarousel 
        title="Horror Games" 
        gamesList={horrorGames} 
        linkTo="/games?category=horror" 
      />

      {/* Explore Categories Box */}
      <section style={sectionWrapperStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>Explore Categories</h2>
        </div>
        <div style={categoriesGridStyle}>
          {[
            { name: 'Action', color: 'var(--primary)', count: publishedGames.filter(g => g.category.toLowerCase() === 'action').length },
            { name: 'Adventure', color: 'var(--accent)', count: publishedGames.filter(g => g.category.toLowerCase() === 'adventure').length },
            { name: 'Horror', color: 'var(--brand-peach-700)', count: publishedGames.filter(g => g.category.toLowerCase() === 'horror').length },
            { name: 'Simulator', color: 'var(--success)', count: publishedGames.filter(g => g.category.toLowerCase() === 'simulator').length },
            { name: 'Racing', color: 'var(--warning)', count: publishedGames.filter(g => g.category.toLowerCase() === 'racing').length },
            { name: 'Puzzle', color: 'var(--text-subtle)', count: publishedGames.filter(g => g.category.toLowerCase() === 'puzzle').length },
            { name: 'Multiplayer', color: 'var(--brand-peach-300)', count: publishedGames.filter(g => g.multiplayer).length },
            { name: 'Experimental', color: 'var(--danger)', count: publishedGames.filter(g => g.category.toLowerCase() === 'experimental').length }
          ].map(cat => (
            <Link 
              key={cat.name} 
              to={cat.name === 'Multiplayer' ? '/games?multiplayer=true' : `/games?category=${cat.name.toLowerCase()}`} 
              style={{ ...categoryBoxStyle, borderLeft: `4px solid ${cat.color}` }}
              className="bg-glass"
            >
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{cat.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{cat.count} games</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Creator Banner CTA */}
      <section style={{ marginTop: '1rem' }}>
        <div style={creatorCtaBoxStyle} className="bg-glass">
          <div style={creatorCtaInfoColStyle}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Built something cool? Publish it on VibePlay</h2>
            <p style={creatorCtaDescStyle}>
              We support raw HTML5, Phaser, PixiJS, Three.js, Babylon.js and WebGL project builds. Upload your project ZIP, pass security diagnostics, and launch to players instantly.
            </p>
            {currentUser?.role === 'creator' || currentUser?.role === 'admin' ? (
              <Link to="/creator" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                Go to Dashboard
              </Link>
            ) : (
              <button onClick={handleBecomeCreator} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                Become a Creator
              </button>
            )}
          </div>
          <div style={creatorCtaIconsColStyle}>
            <UploadCloud size={56} color="var(--secondary)" />
          </div>
        </div>
      </section>

    </div>
  );
};

// Styles
/* greetingBlockStyle, greetingTitleStyle, and greetingDescStyle removed to prevent unused locals compilation errors */

const sectionWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 700,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const categoriesGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: '1rem'
};

const categoryBoxStyle: React.CSSProperties = {
  padding: '1.25rem',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  transition: 'transform 0.2s, border-color 0.2s',
  cursor: 'pointer'
};

const creatorCtaBoxStyle: React.CSSProperties = {
  borderRadius: '16px',
  padding: '2rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '2rem',
  flexWrap: 'wrap',
  border: '1px solid var(--border-color)'
};

const creatorCtaInfoColStyle: React.CSSProperties = {
  flex: '1 1 400px',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem'
};

const creatorCtaDescStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
  maxWidth: '640px'
};

const creatorCtaIconsColStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  background: 'rgba(255, 255, 255, 0.02)',
  borderRadius: '12px'
};
