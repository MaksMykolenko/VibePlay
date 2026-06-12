import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { Search, Bell, Plus, User as UserIcon, Settings, LogOut, Shield, Layout, Check } from 'lucide-react';
import { toast } from './Toast';

export const Navbar: React.FC = () => {
  const { currentUser, logout, switchDemoRole } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(currentUser?.id);
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showDemoDropdown, setShowDemoDropdown] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (demoRef.current && !demoRef.current.contains(event.target as Node)) {
        setShowDemoDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handlePublishClick = () => {
    if (!currentUser) {
      toast.info('Please log in to publish a game.');
      navigate('/login');
    } else if (currentUser.role === 'player') {
      toast.info('Please become a Creator to publish games! Switch roles in your profile.');
      navigate(`/profile/${currentUser.username}`);
    } else {
      navigate('/creator/publish');
    }
  };

  const handleLogoutClick = () => {
    logout();
    toast.success('Logged out successfully.');
    navigate('/');
    setShowProfileDropdown(false);
  };

  const handleDemoSwitch = (role: 'player' | 'creator' | 'admin') => {
    switchDemoRole(role);
    toast.success(`Switched to demo ${role} account!`);
    setShowDemoDropdown(false);
    if (role === 'creator') navigate('/creator');
    else if (role === 'admin') navigate('/admin');
    else navigate('/');
  };

  return (
    <header style={headerStyle} className="bg-glass">
      <div style={navContainerStyle}>
        
        {/* Logo */}
        <Link to="/" style={logoContainerStyle}>
          <div style={logoIconStyle}>
            <span style={logoTextVStyle}>V</span>
            <div style={logoPlayStyle}></div>
          </div>
          <span style={logoTextStyle}>Vibe<span style={{ color: 'var(--primary)' }}>Play</span></span>
        </Link>

        {/* Links */}
        <nav style={navLinksStyle}>
          <Link to="/" className="nav-link" style={navLinkStyle}>Discover</Link>
          <Link to="/games" className="nav-link" style={navLinkStyle}>Browse</Link>
          <div className="nav-categories-container" style={dropdownHoverContainerStyle}>
            <span className="nav-link" style={navLinkStyle}>Categories</span>
            <div className="categories-dropdown" style={categoriesDropdownStyle}>
              {['Action', 'Adventure', 'Horror', 'Simulator', 'Racing', 'Puzzle', 'Multiplayer', 'Experimental'].map(cat => (
                <Link key={cat} to={`/games?category=${cat.toLowerCase()}`} style={dropdownItemStyle}>{cat}</Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={searchFormStyle}>
          <input
            type="text"
            placeholder="Search games, creators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchInputStyle}
          />
          <button type="submit" style={searchButtonStyle} aria-label="Search">
            <Search size={16} color="var(--text-secondary)" />
          </button>
        </form>

        {/* Right Section */}
        <div style={rightSectionStyle}>
          
          {/* Quick Demo Switch */}
          <div ref={demoRef} style={dropdownRelativeStyle}>
            <button onClick={() => setShowDemoDropdown(!showDemoDropdown)} style={demoBtnStyle}>
              Demo accounts
            </button>
            {showDemoDropdown && (
              <div style={demoDropdownContentStyle}>
                <div style={dropdownTitleStyle}>Quick Role Switch</div>
                <button onClick={() => handleDemoSwitch('player')} style={dropdownItemBtnStyle}>
                  Demo Player {currentUser?.role === 'player' && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--success)' }} />}
                </button>
                <button onClick={() => handleDemoSwitch('creator')} style={dropdownItemBtnStyle}>
                  Demo Creator {currentUser?.role === 'creator' && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--success)' }} />}
                </button>
                <button onClick={() => handleDemoSwitch('admin')} style={dropdownItemBtnStyle}>
                  Demo Admin {currentUser?.role === 'admin' && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--success)' }} />}
                </button>
              </div>
            )}
          </div>

          {/* Publish */}
          <button onClick={handlePublishClick} className="btn btn-primary btn-sm" style={publishBtnStyle}>
            <Plus size={16} />
            <span>Publish</span>
          </button>

          {/* Notifications */}
          {currentUser && (
            <div ref={notifRef} style={dropdownRelativeStyle}>
              <button 
                onClick={() => setShowNotifDropdown(!showNotifDropdown)} 
                style={iconBtnStyle} 
                aria-label={`${unreadCount} notifications`}
              >
                <Bell size={20} color="var(--text-primary)" />
                {unreadCount > 0 && <span style={badgeCountStyle}>{unreadCount}</span>}
              </button>
              
              {showNotifDropdown && (
                <div style={notifDropdownStyle}>
                  <div style={dropdownHeaderStyle}>
                    <h3>Notifications</h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} style={textLinkStyle}>Mark all read</button>
                    )}
                  </div>
                  <div style={notifListStyle}>
                    {notifications.length === 0 ? (
                      <div style={emptyNotifStyle}>No notifications</div>
                    ) : (
                      notifications.slice(0, 5).map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => {
                            markAsRead(n.id);
                            if (n.relatedSlug) navigate(`/game/${n.relatedSlug}`);
                            setShowNotifDropdown(false);
                          }} 
                          style={{
                            ...notifItemStyle,
                            backgroundColor: n.isRead ? 'transparent' : 'rgba(124, 92, 255, 0.06)'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '2px', color: 'var(--text-primary)' }}>{n.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{n.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                  <Link to="/notifications" onClick={() => setShowNotifDropdown(false)} style={viewAllNotifStyle}>View all notifications</Link>
                </div>
              )}
            </div>
          )}

          {/* User Profile */}
          {currentUser ? (
            <div ref={profileRef} style={dropdownRelativeStyle}>
              <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} style={avatarBtnStyle}>
                <img src={currentUser.avatar} alt={currentUser.displayName} style={avatarImgStyle} />
              </button>

              {showProfileDropdown && (
                <div style={profileDropdownStyle}>
                  <div style={userHeaderInfoStyle}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{currentUser.displayName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>@{currentUser.username}</div>
                    <span className={`badge ${currentUser.role === 'admin' ? 'badge-danger' : currentUser.role === 'creator' ? 'badge-success' : 'badge-primary'}`} style={{ marginTop: '6px' }}>
                      {currentUser.role}
                    </span>
                  </div>
                  
                  <hr style={hrStyle} />
                  
                  <Link to={`/profile/${currentUser.username}`} onClick={() => setShowProfileDropdown(false)} style={profileDropdownItemStyle}>
                    <UserIcon size={16} />
                    <span>My Profile</span>
                  </Link>

                  <Link to="/settings" onClick={() => setShowProfileDropdown(false)} style={profileDropdownItemStyle}>
                    <Settings size={16} />
                    <span>Settings</span>
                  </Link>

                  {currentUser.role === 'creator' && (
                    <Link to="/creator" onClick={() => setShowProfileDropdown(false)} style={profileDropdownItemStyle}>
                      <Layout size={16} />
                      <span>Creator Dashboard</span>
                    </Link>
                  )}

                  {currentUser.role === 'admin' && (
                    <Link to="/admin" onClick={() => setShowProfileDropdown(false)} style={profileDropdownItemStyle}>
                      <Shield size={16} />
                      <span>Admin Panel</span>
                    </Link>
                  )}

                  <hr style={hrStyle} />

                  <button onClick={handleLogoutClick} style={{ ...profileDropdownItemStyle, width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--danger)' }}>
                    <LogOut size={16} />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={authButtonsContainerStyle}>
              <Link to="/login" className="btn btn-secondary btn-sm" style={{ padding: '0.4rem 1rem' }}>Log In</Link>
              <Link to="/register" className="btn btn-primary btn-sm" style={{ padding: '0.4rem 1rem' }}>Sign Up</Link>
            </div>
          )}

        </div>

      </div>
    </header>
  );
};

// Styles
const headerStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1000,
  height: '70px',
  width: '100%',
  borderBottom: '1px solid var(--border-color)',
  display: 'flex',
  alignItems: 'center'
};

const navContainerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 'var(--container-max-width)',
  margin: '0 auto',
  padding: '0 1.5rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1.5rem'
};

const logoContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  cursor: 'pointer'
};

const logoIconStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  background: 'var(--gradient)',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const logoTextVStyle: React.CSSProperties = {
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '1.1rem',
  fontFamily: 'var(--font-display)',
  zIndex: 2,
  transform: 'translateX(-3px)'
};

const logoPlayStyle: React.CSSProperties = {
  width: '0',
  height: '0',
  borderTop: '5px solid transparent',
  borderBottom: '5px solid transparent',
  borderLeft: '9px solid #fff',
  position: 'absolute',
  right: '8px',
  top: '11px',
  zIndex: 1
};

const logoTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.3rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  letterSpacing: '-0.02em'
};

const navLinksStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1.5rem'
};

// Hidden on mobile using CSS later or display none on screen width
const navLinkStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  cursor: 'pointer'
};

const dropdownHoverContainerStyle: React.CSSProperties = {
  position: 'relative',
  cursor: 'pointer'
};

const categoriesDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: '8px',
  width: '180px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '6px',
  boxShadow: 'var(--shadow-lg)',
  display: 'none', // Managed via CSS hover or simple CSS classes
  flexDirection: 'column',
  zIndex: 100
};

// In App.css we will add the hover logic to show it:
// .dropdownHoverContainerStyle:hover .categoriesDropdownStyle { display: flex; }
const dropdownItemStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  fontSize: '0.85rem',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  transition: 'all 0.2s'
};

const searchFormStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  maxWidth: '320px'
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 2.5rem 0.5rem 1rem',
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: '999px',
  color: 'var(--text-primary)',
  fontSize: '0.875rem'
};

const searchButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer'
};

const rightSectionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem'
};

const dropdownRelativeStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block'
};

const demoBtnStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 184, 77, 0.1)',
  color: 'var(--warning)',
  border: '1px solid rgba(255, 184, 77, 0.2)',
  padding: '0.4rem 0.8rem',
  borderRadius: '6px',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer'
};

const demoDropdownContentStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '8px',
  width: '180px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '6px',
  boxShadow: 'var(--shadow-lg)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  zIndex: 100
};

const dropdownTitleStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-secondary)'
};

const dropdownItemBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderRadius: '6px',
  fontSize: '0.85rem',
  color: 'var(--text-primary)',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.2s'
};

const publishBtnStyle: React.CSSProperties = {
  gap: '4px'
};

const iconBtnStyle: React.CSSProperties = {
  position: 'relative',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center'
};

const badgeCountStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-2px',
  right: '-2px',
  backgroundColor: 'var(--danger)',
  color: '#fff',
  fontSize: '0.65rem',
  fontWeight: 'bold',
  borderRadius: '999px',
  padding: '1px 5px',
  minWidth: '16px',
  textAlign: 'center'
};

const notifDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '12px',
  width: '320px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 100,
  overflow: 'hidden'
};

const dropdownHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-surface)'
};

const textLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--secondary)',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer'
};

const notifListStyle: React.CSSProperties = {
  maxHeight: '260px',
  overflowY: 'auto'
};

const notifItemStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-color)',
  cursor: 'pointer',
  transition: 'background-color 0.2s'
};

const emptyNotifStyle: React.CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.85rem'
};

const viewAllNotifStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  padding: '10px',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--secondary)',
  borderTop: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-surface)'
};

const avatarBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  borderRadius: '50%',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const avatarImgStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  objectFit: 'cover',
  borderRadius: '50%'
};

const profileDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '12px',
  width: '220px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '8px',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 100
};

const userHeaderInfoStyle: React.CSSProperties = {
  padding: '8px 12px'
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '8px 0'
};

const profileDropdownItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  transition: 'all 0.2s',
  cursor: 'pointer'
};

const authButtonsContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem'
};
