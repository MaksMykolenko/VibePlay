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
  const myGames = games.filter(g => g.creatorId === currentUser.id);

  const totalPlays = myGames.reduce((sum, g) => sum + g.plays, 0);
  const totalLikes = myGames.reduce((sum, g) => sum + g.likes, 0);
  const pendingReviews = myGames.filter(g => g.status === 'pending').length;

  // Simulated Weekly stats data for SVG Chart
  const weeklyPlays = [1200, 1500, 1100, 1900, 2400, 2800, 3100];
  const weeklyLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // SVG Chart Geometry
  const chartWidth = 500;
  const chartHeight = 160;
  const padding = 20;
  
  const maxPlay = Math.max(...weeklyPlays);
  const points = weeklyPlays.map((val, idx) => {
    const x = padding + (idx * (chartWidth - padding * 2)) / (weeklyPlays.length - 1);
    const y = chartHeight - padding - (val * (chartHeight - padding * 2)) / maxPlay;
    return { x, y, val };
  });

  const pathD = `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`;
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

  // Get recent activity
  const recentComments = comments
    .filter(c => myGames.some(mg => mg.id === c.gameId))
    .slice(0, 3);

  return (
    <div style={containerStyle} className="animate-fade">
      
      {/* Welcome Message */}
      <div style={welcomeStyle}>
        <h1>Welcome, {currentUser.displayName}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Here is a summary of how your published browser builds are performing.</p>
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

      {/* Analytics Chart Block */}
      <div style={layoutGridStyle}>
        
        {/* SVG Graph */}
        <div style={chartCardStyle} className="bg-glass">
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>Launch Stats (Last 7 Days)</h3>
            <span style={chartTotalStyle}>+{(weeklyPlays[weeklyPlays.length - 1] - weeklyPlays[0])} plays</span>
          </div>

          <div style={chartWrapperStyle}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padding + ratio * (chartHeight - padding * 2);
                return (
                  <line 
                    key={idx} 
                    x1={padding} 
                    y1={y} 
                    x2={chartWidth - padding} 
                    y2={y} 
                    stroke="rgba(255,255,255,0.03)" 
                    strokeWidth="1" 
                  />
                );
              })}

              {/* Area gradient under path */}
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--secondary)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--secondary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={areaD} fill="url(#chartGradient)" />

              {/* Chart Line path */}
              <path 
                d={pathD} 
                fill="none" 
                stroke="var(--secondary)" 
                strokeWidth="3" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />

              {/* Dots & Labels */}
              {points.map((p, idx) => (
                <g key={idx}>
                  <circle 
                    cx={p.x} 
                    cy={p.y} 
                    r="5" 
                    fill="var(--bg-card)" 
                    stroke="var(--secondary)" 
                    strokeWidth="2.5" 
                  />
                  
                  {/* Tooltip on hover */}
                  <text 
                    x={p.x} 
                    y={p.y - 10} 
                    textAnchor="middle" 
                    fill="#fff" 
                    fontSize="9" 
                    fontWeight="600"
                  >
                    {p.val}
                  </text>

                  {/* Day Label */}
                  <text 
                    x={p.x} 
                    y={chartHeight - 4} 
                    textAnchor="middle" 
                    fill="var(--text-secondary)" 
                    fontSize="9" 
                    fontWeight="500"
                  >
                    {weeklyLabels[idx]}
                  </text>
                </g>
              ))}

            </svg>
          </div>
        </div>

        {/* Recent comments/feedback activity */}
        <div style={activityCardStyle} className="bg-glass">
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>Player Interactions</h3>
            <Link to="/creator/my-games" style={{ fontSize: '0.8rem', color: 'var(--secondary)', fontWeight: 600 }}>
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
              recentComments.map(c => (
                <div key={c.id} style={activityItemStyle}>
                  <img src={c.userAvatar} alt={c.username} style={activityAvatarStyle} />
                  <div style={activityBodyStyle}>
                    <div style={{ fontSize: '0.85rem' }}>
                      <strong>{c.username}</strong> commented:
                    </div>
                    <p style={activityCommentStyle}>"{c.content}"</p>
                    <span style={activityTimeStyle}>{new Date(c.timestamp).toLocaleDateString()}</span>
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
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>My Published Builds ({myGames.filter(g => g.status === 'published').length})</h2>
          <Link to="/creator/my-games" style={linkBtnStyle}>
            <span>Manage All</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {myGames.length === 0 ? (
          <div style={emptyGamesStyle}>
            <p>You haven't uploaded any browser builds yet.</p>
            <Link to="/creator/publish" className="btn btn-primary btn-sm" style={{ marginTop: '0.75rem' }}>Publish Your First Game</Link>
          </div>
        ) : (
          <div style={listGridStyle}>
            {myGames.slice(0, 3).map(g => (
              <div key={g.id} style={gameRowCardStyle} className="bg-glass">
                <img src={g.coverUrl} alt={g.title} style={rowCoverStyle} />
                <div style={rowMetaStyle}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{g.title}</h3>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px' }}>
                    <span className={`badge ${g.status === 'published' ? 'badge-success' : g.status === 'pending' ? 'badge-warning' : 'badge-secondary'}`}>
                      {g.status}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Plays: {g.plays.toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link to={`/game/${g.slug}`} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }}>
                    <Eye size={14} />
                  </Link>
                  <Link to={`/creator/games/${g.id}/edit`} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }}>
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
  gap: '2rem'
};

const welcomeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '1.25rem'
};

const statBoxStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const statHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const statTitleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  letterSpacing: '0.05em'
};

const statValueStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  color: 'var(--text-primary)',
  lineHeight: 1.1
};

const statSubStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-secondary)'
};

const layoutGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
  flexWrap: 'wrap'
};

const chartCardStyle: React.CSSProperties = {
  flex: '2 1 400px',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  padding: '1.5rem'
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1rem'
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700
};

const chartTotalStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--secondary)',
  fontWeight: 600
};

const chartWrapperStyle: React.CSSProperties = {
  width: '100%',
  height: '180px',
  paddingTop: '10px'
};

const activityCardStyle: React.CSSProperties = {
  flex: '1 1 250px',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column'
};

const activityListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  flex: 1
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
  fontSize: '0.85rem'
};

const activityItemStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  paddingBottom: '10px',
  borderBottom: '1px solid var(--border-color)'
};

const activityAvatarStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  objectFit: 'cover'
};

const activityBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
};

const activityCommentStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.3,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
};

const activityTimeStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-secondary)',
  marginTop: '2px'
};

const linkBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.85rem',
  color: 'var(--secondary)',
  fontWeight: 600
};

const emptyGamesStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px dashed var(--border-color)',
  borderRadius: '12px',
  padding: '3rem 2rem',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.9rem'
};

const listGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const gameRowCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1.25rem',
  padding: '10px 16px',
  borderRadius: '10px',
  border: '1px solid var(--border-color)'
};

const rowCoverStyle: React.CSSProperties = {
  width: '64px',
  height: '40px',
  objectFit: 'cover',
  borderRadius: '4px',
  backgroundColor: '#151928'
};

const rowMetaStyle: React.CSSProperties = {
  flex: 1
};
