import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGames } from '../hooks/useGames';
import { useAuth } from '../hooks/useAuth';
import { GameCarousel } from '../components/GameCarousel';
import { OnboardingCard } from '../components/OnboardingCard';
import { UploadCloud, Cloud } from 'lucide-react';
import { toast } from '../components/toastEvents';
import { useI18n } from '../i18n/useI18n';

export const LandingPage: React.FC = () => {
  const { games, library } = useGames();
  const { currentUser, becomeCreator } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  // Filter published games
  const publishedGames = games.filter((g) => g.status === 'published');

  // Time-aware greeting logic
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return t('home.goodMorning');
    if (hour >= 12 && hour < 18) return t('home.goodAfternoon');
    return t('home.goodEvening');
  };

  const handleBecomeCreator = () => {
    if (!currentUser) {
      toast.info(t('app.loginFirst'));
      navigate('/login');
      return;
    }
    if (!currentUser.emailVerified) {
      toast.warning(t('verification.beforeCreator'));
      return;
    }
    const notice = becomeCreator();
    if (notice) {
      toast.info(notice);
      return;
    }
    toast.success(t('app.creatorSuccess'));
    navigate('/creator');
  };

  // Section 1: Continue Playing (Recently Played games from library)
  const recentlyPlayedIds = library.recentlyPlayed.map((item) => item.id);
  const continuePlayingGames = publishedGames.filter((g) => recentlyPlayedIds.includes(g.id));

  // Section 2: Trending Now (Sorted by plays, take top 8)
  const trendingGames = [...publishedGames].sort((a, b) => b.plays - a.plays).slice(0, 8);

  // Section 3: Recommended for You (Take published games, excluding trending if possible, or just a curated slice)
  const recommendedGames = publishedGames
    .filter((g) => !trendingGames.slice(0, 3).includes(g))
    .slice(0, 8);

  // Section 4: New & Rising (Sorted by updatedAt date, newest first)
  const newAndRisingGames = [...publishedGames]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  // Section 5: AI-Powered Creations (Disclosures that aren't "no")
  const aiPoweredGames = publishedGames.filter((g) => g.aiDisclosure !== 'no').slice(0, 8);

  // Section 6: Popular Simulators
  const simulatorsGames = publishedGames
    .filter((g) => g.category.toLowerCase() === 'simulator')
    .slice(0, 8);

  // Section 7: Puzzle Games
  const puzzleGames = publishedGames
    .filter((g) => g.category.toLowerCase() === 'puzzle')
    .slice(0, 8);

  return (
    <div className="landing-page-container">
      {/* Dynamic Greeting Header */}
      <div className="home-greeting">
        {currentUser ? (
          <div>
            <h1 className="home-greeting__title">
              {getGreeting()},{' '}
              <span style={{ color: 'var(--primary)' }}>{currentUser.displayName}</span>
            </h1>
            <p className="home-greeting__subtitle">{t('home.playToday')}</p>
          </div>
        ) : (
          <div>
            <h1 className="home-greeting__title">{t('home.discoverNew')}</h1>
            <p className="home-greeting__subtitle">{t('home.guestSubtitle')}</p>
            <p className="cloud-save-tagline" style={{ marginTop: '0.6rem', maxWidth: '52ch' }}>
              <Cloud size={14} aria-hidden="true" />
              <span>
                <strong>{t('cloudSave.tagline')}</strong> {t('cloudSave.taglineBody')}
              </span>
            </p>
          </div>
        )}
      </div>

      {currentUser && (
        <OnboardingCard
          storageKey="player_v1"
          title={t('home.onboardingTitle')}
          steps={[
            t('home.onboardingBrowse'),
            t('home.onboardingLibrary'),
            t('home.onboardingReport'),
          ]}
        />
      )}

      {/* Horizontal Carousels */}
      <GameCarousel
        title={t('home.continuePlaying')}
        gamesList={continuePlayingGames}
        linkTo="/library?tab=recent"
        variant="continue"
      />

      <GameCarousel title={t('home.recommended')} gamesList={recommendedGames} linkTo="/games" />

      <GameCarousel
        title={t('home.trending')}
        gamesList={trendingGames}
        linkTo="/games?sort=trending"
      />

      <GameCarousel
        title={t('home.newRising')}
        gamesList={newAndRisingGames}
        linkTo="/games?sort=newest"
      />

      <GameCarousel
        title={t('home.aiCreations')}
        gamesList={aiPoweredGames}
        linkTo="/games?ai=true"
      />

      <GameCarousel
        title={t('home.simulators')}
        gamesList={simulatorsGames}
        linkTo="/games?category=simulator"
      />

      <GameCarousel
        title={t('home.puzzles')}
        gamesList={puzzleGames}
        linkTo="/games?category=puzzle"
      />

      {/* Explore Categories Box */}
      <section style={sectionWrapperStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>{t('home.exploreCategories')}</h2>
        </div>
        <div style={categoriesGridStyle}>
          {[
            {
              name: 'Action',
              color: 'var(--primary)',
              count: publishedGames.filter((g) => g.category.toLowerCase() === 'action').length,
            },
            {
              name: 'Adventure',
              color: 'var(--accent)',
              count: publishedGames.filter((g) => g.category.toLowerCase() === 'adventure').length,
            },
            {
              name: 'Arcade',
              color: 'var(--brand-peach-700)',
              count: publishedGames.filter((g) => g.category.toLowerCase() === 'arcade').length,
            },
            {
              name: 'Simulator',
              color: 'var(--success)',
              count: publishedGames.filter((g) => g.category.toLowerCase() === 'simulator').length,
            },
            {
              name: 'Racing',
              color: 'var(--warning)',
              count: publishedGames.filter((g) => g.category.toLowerCase() === 'racing').length,
            },
            {
              name: 'Puzzle',
              color: 'var(--text-subtle)',
              count: publishedGames.filter((g) => g.category.toLowerCase() === 'puzzle').length,
            },
            {
              name: 'Platformer',
              color: 'var(--brand-peach-300)',
              count: publishedGames.filter((g) => g.category.toLowerCase() === 'platformer').length,
            },
            {
              name: 'Strategy',
              color: 'var(--danger)',
              count: publishedGames.filter((g) => g.category.toLowerCase() === 'strategy').length,
            },
          ].map((cat) => (
            <Link
              key={cat.name}
              to={`/games?category=${cat.name.toLowerCase()}`}
              style={{ ...categoryBoxStyle, borderLeft: `4px solid ${cat.color}` }}
              className="bg-glass"
            >
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                {cat.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {t('home.gamesCount', { count: cat.count })}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Creator Banner CTA */}
      <section style={{ marginTop: '1rem' }}>
        <div style={creatorCtaBoxStyle} className="bg-glass">
          <div style={creatorCtaInfoColStyle}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{t('home.creatorTitle')}</h2>
            <p style={creatorCtaDescStyle}>{t('home.creatorDescription')}</p>
            {currentUser?.role === 'creator' || currentUser?.role === 'admin' || currentUser?.role === 'owner' ? (
              <Link to="/creator" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                {t('home.creatorDashboard')}
              </Link>
            ) : (
              <button
                onClick={handleBecomeCreator}
                className="btn btn-primary"
                style={{ alignSelf: 'flex-start' }}
              >
                {t('home.becomeCreator')}
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
  gap: '1rem',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 700,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const categoriesGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: '1rem',
};

const categoryBoxStyle: React.CSSProperties = {
  padding: '1.25rem',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  transition: 'transform 0.2s, border-color 0.2s',
  cursor: 'pointer',
};

const creatorCtaBoxStyle: React.CSSProperties = {
  borderRadius: '16px',
  padding: '2rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '2rem',
  flexWrap: 'wrap',
  border: '1px solid var(--border-color)',
};

const creatorCtaInfoColStyle: React.CSSProperties = {
  flex: '1 1 400px',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const creatorCtaDescStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
  maxWidth: '640px',
};

const creatorCtaIconsColStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  background: 'rgba(255, 255, 255, 0.02)',
  borderRadius: '12px',
};
