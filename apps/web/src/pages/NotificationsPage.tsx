import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { Bell, Check, ArrowRight, ShieldAlert, Sparkles, Cpu, AlertTriangle } from 'lucide-react';
import { toast } from '../components/Toast';

export const NotificationsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { notifications, markAsRead, markAllAsRead } = useNotifications(currentUser?.id);
  const navigate = useNavigate();

  if (!currentUser) {
    return (
      <div style={unauthContainerStyle}>
        <ShieldAlert size={48} color="var(--danger)" />
        <h2 style={{ marginTop: '1rem' }}>Log in to view Notifications</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem' }}>
          Please authenticate to access your notifications stream.
        </p>
        <button onClick={() => navigate('/login')} className="btn btn-primary">Log In</button>
      </div>
    );
  }

  const handleMarkAllRead = () => {
    markAllAsRead();
    toast.success('All notifications marked as read.');
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'game_approved': return <ShieldCheckStyle color="var(--success)" />;
      case 'game_rejected': return <ShieldAlertIconStyle color="var(--danger)" />;
      case 'game_featured': return <Sparkles size={20} color="var(--primary)" />;
      case 'new_comment': return <Cpu size={20} color="var(--secondary)" />;
      default: return <Bell size={20} color="var(--text-secondary)" />;
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={containerStyle}>
      
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Bell size={28} color="var(--secondary)" />
          <h1 style={titleStyle}>Notifications</h1>
        </div>
        {notifications.some(n => !n.isRead) && (
          <button onClick={handleMarkAllRead} className="btn btn-secondary btn-sm" style={{ gap: '6px' }}>
            <Check size={14} />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      <hr style={hrStyle} />

      {/* Notifications list */}
      <div style={listAreaStyle} className="animate-fade">
        {notifications.length === 0 ? (
          <div style={emptyContainerStyle}>
            <Bell size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h3>No notifications yet</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              We will alert you here when your games get reviewed or users comment on your builds.
            </p>
          </div>
        ) : (
          notifications.map(n => (
            <div 
              key={n.id} 
              style={{
                ...notifCardStyle,
                borderLeft: n.isRead ? '4px solid transparent' : '4px solid var(--secondary)',
                backgroundColor: n.isRead ? 'var(--bg-card)' : 'rgba(0, 207, 255, 0.02)'
              }}
              className="animate-fade"
            >
              <div style={iconBoxStyle}>
                {getNotifIcon(n.type)}
              </div>

              <div style={bodyStyle}>
                <div style={titleRowStyle}>
                  <strong style={{ fontSize: '1rem', color: n.isRead ? 'var(--text-primary)' : '#fff' }}>{n.title}</strong>
                  <span style={timeStyle}>{formatTime(n.timestamp)}</span>
                </div>
                <p style={descStyle}>{n.message}</p>
                
                {n.relatedSlug && (
                  <Link to={`/game/${n.relatedSlug}`} onClick={() => markAsRead(n.id)} style={linkStyle}>
                    <span>View Game Details</span>
                    <ArrowRight size={12} />
                  </Link>
                )}
              </div>

              {!n.isRead && (
                <button 
                  onClick={() => markAsRead(n.id)} 
                  style={markReadBtnStyle}
                  title="Mark as read"
                >
                  <Check size={16} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

    </div>
  );
};

// Notification helper icons
const ShieldCheckStyle: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ display: 'inline-flex', padding: '6px', borderRadius: '50%', backgroundColor: 'rgba(61,220,151,0.1)' }}>
    <Check size={18} color={color} />
  </div>
);

const ShieldAlertIconStyle: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ display: 'inline-flex', padding: '6px', borderRadius: '50%', backgroundColor: 'rgba(255,93,115,0.1)' }}>
    <AlertTriangle size={18} color={color} />
  </div>
);

// Styles
const unauthContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 140px)',
  textAlign: 'center',
  padding: '2rem'
};

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '800px',
  margin: '2rem auto',
  padding: '0 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  minHeight: '400px'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px'
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.02em'
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '0.25rem 0'
};

const listAreaStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
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
  borderRadius: '12px'
};

const notifCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1.25rem',
  padding: '1.5rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  position: 'relative'
};

const iconBoxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  paddingTop: '2px'
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '8px'
};

const timeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)'
};

const descStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.4
};

const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.8rem',
  color: 'var(--secondary)',
  fontWeight: 600,
  marginTop: '0.5rem',
  alignSelf: 'flex-start'
};

const markReadBtnStyle: React.CSSProperties = {
  alignSelf: 'center',
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.2s'
};

// Hover managed in CSS
// markReadBtnStyle:hover { color: var(--success); border-color: rgba(61,220,151,0.3); background-color: rgba(61,220,151,0.05); }
