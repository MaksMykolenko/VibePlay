import { OnboardingCard } from '../../components/OnboardingCard';
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import { Play, ThumbsUp, Layers, HelpCircle, Activity, ArrowRight, Eye, Edit } from 'lucide-react';

export const CreatorOverview: React.FC = () => {
  const { currentUser } = useAuth();
  const { games, comments } = useGames();

  if (!currentUser) return null;

  // Filter games created by this user
  const myGames = games.filter((g) => g.creatorId === currentUser.id);

  const totalPlays = myGames.reduce((sum, g) => sum + g.plays, 0);
  const totalLikes = myGames.reduce((sum, g) => sum + g.likes, 0);
  const pendingReviews = myGames.filter((g) => g.status === 'pending').length;

  const statusSummary = [
    { label: 'Published', count: myGames.filter((game) => game.status === 'published').length },
    { label: 'In moderation', count: pendingReviews },
    { label: 'Draft', count: myGames.filter((game) => game.status === 'draft').length },
    { label: 'Rejected', count: myGames.filter((game) => game.status === 'rejected').length },
    { label: 'Hidden', count: myGames.filter((game) => game.status === 'hidden').length },
  ];

  // Get recent activity
  const recentComments = comments
    .filter((c) => myGames.some((mg) => mg.id === c.gameId))
    .slice(0, 3);

  return (
    <div style={containerStyle} className="animate-fade">
      <OnboardingCard
        storageKey="creator_v1"
        title="Publishing on VibePlay — how it works"
        steps={[
          'Create a game draft with title, description and cover art.',
          'Upload your build as a ZIP with index.html at the root (static files only — limits are shown on the upload screen).',
          'The pipeline validates the archive and scans it for malware; you see the real status at every step.',
          'A moderator reviews the build. Approved versions go live; rejections always include a reason so you can fix and re-upload.',
        ]}
      />
      {/* Welcome Message */}
      <div style={welcomeStyle}>
        <h1>Welcome, {currentUser.displayName}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Here is a summary of how your published browser builds are performing.
        </p>
      </div>

      {/* Stats row */}
      <div style={statsGridStyle}>
        <div style={statBoxStyle} className="bg-glass">
          <div style={statHeaderStyle}>
            <span style={statTitleStyle}>Total Games</span>
            <Layers size={18} color="var(--secondary)" />
          </div>
          <div style={statValueStyle}>{myGames.length}</div>
          <div style={statSubStyle}>Draft & published builds</div>
        </div>

        <div style={statBoxStyle} className="bg-glass">
          <div style={statHeaderStyle}>
            <span style={statTitleStyle}>Total Plays</span>
            <Play size={18} color="var(--primary)" />
          </div>
          <div style={statValueStyle}>{totalPlays.toLocaleString()}</div>
          <div style={statSubStyle}>Accumulated launches</div>
        </div>

        <div style={statBoxStyle} className="bg-glass">
          <div style={statHeaderStyle}>
            <span style={statTitleStyle}>Total Likes</span>
            <ThumbsUp size={18} color="var(--success)" />
          </div>
          <div style={statValueStyle}>{totalLikes.toLocaleString()}</div>
          <div style={statSubStyle}>Positive developer feedback</div>
        </div>

        <div style={statBoxStyle} className="bg-glass">
          <div style={statHeaderStyle}>
            <span style={statTitleStyle}>In Moderation</span>
            <HelpCircle size={18} color="var(--warning)" />
          </div>
          <div style={statValueStyle}>{pendingReviews}</div>
          <div style={statSubStyle}>Pending administrator reviews</div>
        </div>
      </div>

      {/* Portfolio and interaction summary */}
      <div style={layoutGridStyle}>
        <div style={chartCardStyle} className="bg-glass">
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>Build Status</h3>
            <span style={chartTotalStyle}>{myGames.length} total</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '12px',
              marginTop: '1.5rem',
            }}
          >
            {statusSummary.map((status) => (
              <div
                key={status.label}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{status.count}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  {status.label}
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '1rem' }}>
            Daily time-series analytics are not available in the private beta.
          </p>
        </div>

        {/* Recent comments/feedback activity */}
        <div style={activityCardStyle} className="bg-glass">
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>Player Interactions</h3>
            <Link
              to="/creator/my-games"
              style={{ fontSize: '0.8rem', color: 'var(--secondary)', fontWeight: 600 }}
            >
              My Games
            </Link>
          </div>

          <div style={activityListStyle}>
            {recentComments.length === 0 ? (
              <div style={emptyActivityStyle}>
                <Activity size={28} style={{ opacity: 0.15, marginBottom: '6px' }} />
                <span>No comments on your games yet.</span>
              </div>
            ) : (
              recentComments.map((c) => (
                <div key={c.id} style={activityItemStyle}>
                  <img src={c.userAvatar} alt={c.username} style={activityAvatarStyle} />
                  <div style={activityBodyStyle}>
                    <div style={{ fontSize: '0.85rem' }}>
                      <strong>{c.username}</strong> commented:
                    </div>
                    <p style={activityCommentStyle}>"{c.content}"</p>
                    <span style={activityTimeStyle}>
                      {new Date(c.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Latest Games Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            My Published Builds ({myGames.filter((g) => g.status === 'published').length})
          </h2>
          <Link to="/creator/my-games" style={linkBtnStyle}>
            <span>Manage All</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {myGames.length === 0 ? (
          <div style={emptyGamesStyle}>
            <p>You haven't uploaded any browser builds yet.</p>
            <Link
              to="/creator/publish"
              className="btn btn-primary btn-sm"
              style={{ marginTop: '0.75rem' }}
            >
              Publish Your First Game
            </Link>
          </div>
        ) : (
          <div style={listGridStyle}>
            {myGames.slice(0, 3).map((g) => (
              <div key={g.id} style={gameRowCardStyle} className="bg-glass">
                <img src={g.coverUrl} alt={g.title} style={rowCoverStyle} />
                <div style={rowMetaStyle}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{g.title}</h3>
                  <div
                    style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px' }}
                  >
                    <span
                      className={`badge ${g.status === 'published' ? 'badge-success' : g.status === 'pending' ? 'badge-warning' : 'badge-secondary'}`}
                    >
                      {g.status}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Plays: {g.plays.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link
                    to={`/game/${g.slug}`}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.4rem' }}
                  >
                    <Eye size={14} />
                  </Link>
                  <Link
                    to={`/creator/games/${g.id}/edit`}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.4rem' }}
                  >
                    <Edit size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
};

const welcomeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '1.25rem',
};

const statBoxStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const statHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const statTitleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  letterSpacing: '0.05em',
};

const statValueStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  color: 'var(--text-primary)',
  lineHeight: 1.1,
};

const statSubStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-secondary)',
};

const layoutGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
  flexWrap: 'wrap',
};

const chartCardStyle: React.CSSProperties = {
  flex: '2 1 400px',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1rem',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
};

const chartTotalStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--secondary)',
  fontWeight: 600,
};

const activityCardStyle: React.CSSProperties = {
  flex: '1 1 250px',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
};

const activityListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  flex: 1,
};

const emptyActivityStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '2rem',
  flex: 1,
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
};

const activityItemStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  paddingBottom: '10px',
  borderBottom: '1px solid var(--border-color)',
};

const activityAvatarStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  objectFit: 'cover',
};

const activityBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const activityCommentStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.3,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const activityTimeStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-secondary)',
  marginTop: '2px',
};

const linkBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.85rem',
  color: 'var(--secondary)',
  fontWeight: 600,
};

const emptyGamesStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px dashed var(--border-color)',
  borderRadius: '12px',
  padding: '3rem 2rem',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.9rem',
};

const listGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const gameRowCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1.25rem',
  padding: '10px 16px',
  borderRadius: '10px',
  border: '1px solid var(--border-color)',
};

const rowCoverStyle: React.CSSProperties = {
  width: '64px',
  height: '40px',
  objectFit: 'cover',
  borderRadius: '4px',
  backgroundColor: '#151928',
};

const rowMetaStyle: React.CSSProperties = {
  flex: 1,
};
