import React from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  Gamepad2,
  PlusCircle,
  BarChart2,
  ArrowLeft,
  User,
  ShieldAlert,
} from 'lucide-react';
import { ToastContainer } from '../components/Toast';

export const CreatorLayout: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Route guarding: Only allow Creator
  if (!currentUser || (currentUser.role !== 'creator' && currentUser.role !== 'admin')) {
    return (
      <div style={unauthorizedContainerStyle}>
        <ShieldAlert size={48} color="var(--danger)" />
        <h2 style={{ marginTop: '1rem', fontSize: '1.5rem' }}>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem' }}>
          You must be logged in as a Creator to access this dashboard.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => navigate('/login')} className="btn btn-primary">
            Log In
          </button>
          <button onClick={() => navigate('/')} className="btn btn-secondary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={dashboardWrapperStyle}>
      <ToastContainer />

      {/* Sidebar */}
      <aside style={sidebarStyle} className="creator-sidebar">
        {/* Sidebar Header */}
        <div style={sidebarHeaderStyle}>
          <Link to="/" style={backBtnStyle}>
            <ArrowLeft size={16} />
            <span>VibePlay Home</span>
          </Link>
          <div style={titleContainerStyle}>
            <LayoutDashboard size={20} color="var(--success)" />
            <h2 style={titleStyle}>Creator Hub</h2>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav style={navStyle}>
          <NavLink
            to="/creator"
            end
            style={({ isActive }) => ({
              ...navLinkStyle,
              backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
              color: isActive ? 'var(--success)' : 'var(--text-secondary)',
            })}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </NavLink>

          <NavLink
            to="/creator/my-games"
            style={({ isActive }) => ({
              ...navLinkStyle,
              backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
              color: isActive ? 'var(--success)' : 'var(--text-secondary)',
            })}
          >
            <Gamepad2 size={18} />
            <span>My Games</span>
          </NavLink>

          <NavLink
            to="/creator/publish"
            style={({ isActive }) => ({
              ...navLinkStyle,
              backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
              color: isActive ? 'var(--success)' : 'var(--text-secondary)',
            })}
          >
            <PlusCircle size={18} />
            <span>Publish Game</span>
          </NavLink>

          <NavLink
            to="/creator/analytics"
            style={({ isActive }) => ({
              ...navLinkStyle,
              backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
              color: isActive ? 'var(--success)' : 'var(--text-secondary)',
            })}
          >
            <BarChart2 size={18} />
            <span>Analytics</span>
          </NavLink>
        </nav>

        {/* Sidebar Footer User info */}
        <div style={sidebarFooterStyle}>
          <img src={currentUser.avatar} alt={currentUser.displayName} style={avatarStyle} />
          <div style={userInfoStyle}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {currentUser.displayName}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Creator Account
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={contentAreaStyle}>
        {/* Top Mini Header */}
        <header style={topHeaderStyle}>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', fontFamily: 'var(--font-display)' }}>
            Creator Studio
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="badge badge-success">Creator Mode</span>
            <Link
              to={`/profile/${currentUser.username}`}
              className="btn btn-secondary btn-sm"
              style={{ gap: '6px' }}
            >
              <User size={14} />
              Profile
            </Link>
          </div>
        </header>

        {/* Child Router Views */}
        <div style={outletWrapperStyle}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};

// Styles
const unauthorizedContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-primary)',
  padding: '2rem',
  textAlign: 'center',
};

const dashboardWrapperStyle: React.CSSProperties = {
  display: 'flex',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-primary)',
};

const sidebarStyle: React.CSSProperties = {
  width: '240px',
  backgroundColor: 'var(--bg-surface)',
  borderRight: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  position: 'sticky',
  top: 0,
  height: '100vh',
  zIndex: 100,
};

const sidebarHeaderStyle: React.CSSProperties = {
  padding: '1.5rem',
  borderBottom: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const backBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const titleContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
};

const navStyle: React.CSSProperties = {
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  flex: 1,
};

const navLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 12px',
  borderRadius: '8px',
  fontSize: '0.9rem',
  fontWeight: 500,
  transition: 'all 0.2s',
};

const sidebarFooterStyle: React.CSSProperties = {
  padding: '1rem 1.5rem',
  borderTop: '1px solid var(--border-color)',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  backgroundColor: 'rgba(255,255,255,0.01)',
};

const avatarStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  objectFit: 'cover',
};

const userInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const contentAreaStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  overflowX: 'hidden',
};

const topHeaderStyle: React.CSSProperties = {
  height: '64px',
  borderBottom: '1px solid var(--border-color)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 2rem',
  backgroundColor: 'var(--bg-surface)',
};

const outletWrapperStyle: React.CSSProperties = {
  padding: '2rem',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
};
