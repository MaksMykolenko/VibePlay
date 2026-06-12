import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, Search, BookOpen, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const MobileNavbar: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <nav style={mobileNavStyle} className="bg-glass">
      <NavLink to="/" style={({ isActive }) => ({ ...itemStyle, color: isActive ? 'var(--secondary)' : 'var(--text-secondary)' })}>
        <Home size={20} />
        <span style={textStyle}>Home</span>
      </NavLink>
      
      <NavLink to="/games" style={({ isActive }) => ({ ...itemStyle, color: isActive ? 'var(--secondary)' : 'var(--text-secondary)' })}>
        <Compass size={20} />
        <span style={textStyle}>Discover</span>
      </NavLink>

      <NavLink to="/search" style={({ isActive }) => ({ ...itemStyle, color: isActive ? 'var(--secondary)' : 'var(--text-secondary)' })}>
        <Search size={20} />
        <span style={textStyle}>Search</span>
      </NavLink>

      <NavLink to={currentUser ? '/library' : '/login'} style={({ isActive }) => ({ ...itemStyle, color: isActive ? 'var(--secondary)' : 'var(--text-secondary)' })}>
        <BookOpen size={20} />
        <span style={textStyle}>Library</span>
      </NavLink>

      <NavLink to={currentUser ? `/profile/${currentUser.username}` : '/login'} style={({ isActive }) => ({ ...itemStyle, color: isActive ? 'var(--secondary)' : 'var(--text-secondary)' })}>
        <User size={20} />
        <span style={textStyle}>Profile</span>
      </NavLink>
    </nav>
  );
};

const mobileNavStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: '64px',
  borderTop: '1px solid var(--border-color)',
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  zIndex: 1000,
  paddingBottom: 'safe-area-inset-bottom' // Safe area for modern phones
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.65rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const textStyle: React.CSSProperties = {
  marginTop: '2px'
};
