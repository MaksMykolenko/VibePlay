import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import { Users, AlertTriangle, Play, HelpCircle } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { users } = useAuth();
  const { games, reports } = useGames();

  // Platform metrics
  const totalUsers = users.length;
  const totalCreators = users.filter(u => u.role === 'creator').length;
  const publishedGames = games.filter(g => g.status === 'published').length;
  const pendingReviews = games.filter(g => g.status === 'pending').length;
  const openReports = reports.filter(r => r.status === 'open' || r.status === 'reviewing').length;

  const totalPlays = games.reduce((sum, g) => sum + g.plays, 0);

  // Recent 3 registrations
  const recentUsers = [...users]
    .sort((a, b) => new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime())
    .slice(0, 3);

  // Recent 3 submissions
  const pendingGames = games.filter(g => g.status === 'pending').slice(0, 3);

  return (
    <div style={containerStyle} className="animate-fade">
      
      {/* Title */}
      <div>
        <h1 style={titleStyle}>Platform Overview</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Administrative dashboard for VibePlay platform controls.</p>
      </div>

      {/* Stats Cards Grid */}
      <div style={statsGridStyle}>
        
        <div style={statBoxStyle} className="bg-glass">
          <div style={statHeaderStyle}>
            <span style={statTitleStyle}>Total Registrants</span>
            <Users size={18} color="var(--secondary)" />
          </div>
          <div style={statValueStyle}>{totalUsers}</div>
          <div style={statSubStyle}>{totalCreators} verified creators</div>
        </div>

        <div style={statBoxStyle} className="bg-glass">
          <div style={statHeaderStyle}>
            <span style={statTitleStyle}>Published Games</span>
            <Play size={18} color="var(--success)" />
          </div>
          <div style={statValueStyle}>{publishedGames}</div>
          <div style={statSubStyle}>{totalPlays.toLocaleString()} total plays</div>
        </div>

        <div className="bg-glass" style={{ ...statBoxStyle, borderColor: pendingReviews > 0 ? 'var(--warning)' : 'var(--border-color)', backgroundColor: pendingReviews > 0 ? 'rgba(255,184,77,0.03)' : 'var(--bg-card)' }}>
          <div style={statHeaderStyle}>
            <span style={statTitleStyle}>Pending Reviews</span>
            <HelpCircle size={18} color="var(--warning)" />
          </div>
          <div style={{ ...statValueStyle, color: pendingReviews > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{pendingReviews}</div>
          <div style={statSubStyle}>Moderation queue items</div>
        </div>

        <div className="bg-glass" style={{ ...statBoxStyle, borderColor: openReports > 0 ? 'var(--danger)' : 'var(--border-color)', backgroundColor: openReports > 0 ? 'rgba(255,93,115,0.03)' : 'var(--bg-card)' }}>
          <div style={statHeaderStyle}>
            <span style={statTitleStyle}>Open Complaints</span>
            <AlertTriangle size={18} color="var(--danger)" />
          </div>
          <div style={{ ...statValueStyle, color: openReports > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{openReports}</div>
          <div style={statSubStyle}>Reports needing resolution</div>
        </div>

      </div>

      {/* Splits Panels */}
      <div style={splitGridStyle}>
        
        {/* Pending Submissions */}
        <div style={cardBoxStyle} className="bg-glass">
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>Pending Moderation ({pendingReviews})</h3>
            <Link to="/admin/moderation" style={cardLinkStyle}>Moderation Queue</Link>
          </div>

          <div style={listStyle}>
            {pendingGames.length === 0 ? (
              <div style={emptyTextStyle}>No builds currently pending review.</div>
            ) : (
              pendingGames.map(g => (
                <div key={g.id} style={listItemStyle}>
                  <img src={g.coverUrl} alt="" style={coverStyle} />
                  <div style={itemMetaStyle}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{g.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>by @{g.creatorName} • {g.category}</div>
                  </div>
                  <Link to={`/admin/moderation?game=${g.id}`} className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                    Review
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent user accounts */}
        <div style={cardBoxStyle} className="bg-glass">
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>Recent Registrations</h3>
            <Link to="/admin/users" style={cardLinkStyle}>Manage Users</Link>
          </div>

          <div style={listStyle}>
            {recentUsers.map(user => (
              <div key={user.id} style={listItemStyle}>
                <img src={user.avatar} alt="" style={userAvatarStyle} />
                <div style={itemMetaStyle}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{user.displayName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>@{user.username} • {user.email}</div>
                </div>
                <span className={`badge ${user.role === 'admin' ? 'badge-danger' : user.role === 'creator' ? 'badge-success' : 'badge-primary'}`} style={{ fontSize: '0.65rem' }}>
                  {user.role}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2.5rem'
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.02em'
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

const splitGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
  flexWrap: 'wrap'
};

const cardBoxStyle: React.CSSProperties = {
  flex: '1 1 300px',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem'
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700
};

const cardLinkStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--secondary)',
  fontWeight: 600
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
};

const emptyTextStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
  padding: '2rem'
};

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  paddingBottom: '10px',
  borderBottom: '1px solid var(--border-color)'
};

const coverStyle: React.CSSProperties = {
  width: '48px',
  height: '30px',
  objectFit: 'cover',
  borderRadius: '4px',
  backgroundColor: '#151928'
};

const userAvatarStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  objectFit: 'cover'
};

const itemMetaStyle: React.CSSProperties = {
  flex: 1
};
