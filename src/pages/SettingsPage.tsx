import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { User, Shield, Key, Bell, Eye, EyeOff, Palette, Sun, Moon, Monitor } from 'lucide-react';
import { toast } from '../components/Toast';
import { useTheme } from '../hooks/useTheme';

export const SettingsPage: React.FC = () => {
  const { currentUser, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  // Tab state
  const [activeTab, setActiveTab] = useState<'profile' | 'account' | 'password' | 'notifications' | 'privacy' | 'appearance'>('profile');

  // Form states
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');

  const [email, setEmail] = useState(currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Checks
  const [notifApprovals, setNotifApprovals] = useState(true);
  const [notifComments, setNotifComments] = useState(true);
  const [notifPlatform, setNotifPlatform] = useState(false);
  const [privacySearch, setPrivacySearch] = useState(true);
  const [privacyActivity, setPrivacyActivity] = useState(true);

  if (!currentUser) {
    return (
      <div style={unauthStyle}>
        <h2>Please Log In</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem' }}>You must be authenticated to view account settings.</p>
        <button onClick={() => navigate('/login')} className="btn btn-primary">Go to Login</button>
      </div>
    );
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile(displayName, bio, avatar);
    toast.success('Profile settings updated successfully!');
  };

  const handleAccountSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Account credentials updated (simulated).');
  };

  const handlePasswordSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.danger('New passwords do not match!');
      return;
    }
    if (newPassword.length < 6) {
      toast.warning('New password must be at least 6 characters.');
      return;
    }
    toast.success('Password updated successfully (simulated).');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleNotificationsSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Notification preferences updated.');
  };

  const handlePrivacySave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Privacy settings saved.');
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Settings</h1>

      <div style={settingsLayoutStyle}>
        
        {/* Settings Sidebar Links */}
        <aside style={navSidebarStyle} className="settings-sidebar">
          <button 
            onClick={() => setActiveTab('profile')} 
            style={{ ...sidebarLinkStyle, backgroundColor: activeTab === 'profile' ? 'var(--bg-hover)' : 'transparent', color: activeTab === 'profile' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            <User size={16} />
            <span>Profile</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('account')} 
            style={{ ...sidebarLinkStyle, backgroundColor: activeTab === 'account' ? 'var(--bg-hover)' : 'transparent', color: activeTab === 'account' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            <Shield size={16} />
            <span>Account</span>
          </button>

          <button 
            onClick={() => setActiveTab('password')} 
            style={{ ...sidebarLinkStyle, backgroundColor: activeTab === 'password' ? 'var(--bg-hover)' : 'transparent', color: activeTab === 'password' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            <Key size={16} />
            <span>Password</span>
          </button>

          <button 
            onClick={() => setActiveTab('notifications')} 
            style={{ ...sidebarLinkStyle, backgroundColor: activeTab === 'notifications' ? 'var(--bg-hover)' : 'transparent', color: activeTab === 'notifications' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            <Bell size={16} />
            <span>Notifications</span>
          </button>

          <button 
            onClick={() => setActiveTab('privacy')} 
            style={{ ...sidebarLinkStyle, backgroundColor: activeTab === 'privacy' ? 'var(--bg-hover)' : 'transparent', color: activeTab === 'privacy' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            <Eye size={16} />
            <span>Privacy & Safety</span>
          </button>

          <button 
            onClick={() => setActiveTab('appearance')} 
            style={{ ...sidebarLinkStyle, backgroundColor: activeTab === 'appearance' ? 'var(--bg-hover)' : 'transparent', color: activeTab === 'appearance' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            <Palette size={16} />
            <span>Appearance</span>
          </button>
        </aside>

        {/* Content Box */}
        <div style={contentBoxStyle} className="bg-glass animate-fade">
          
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSave} className="animate-fade">
              <h2 style={tabTitleStyle}>Profile Customization</h2>
              <p style={tabDescStyle}>Customize how your name and avatar appear across VibePlay.</p>
              
              <div style={avatarPreviewRowStyle}>
                <img src={avatar || currentUser.avatar} alt="Preview" style={avatarPreviewStyle} />
                <div style={{ flex: 1 }}>
                  <label className="form-label">Avatar URL</label>
                  <input
                    type="text"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="form-input"
                  />
                  <span style={helperStyle}>Provide an absolute path to a square image.</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Biography</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="form-input"
                  style={{ minHeight: '120px', resize: 'vertical' }}
                  placeholder="Tell players and creators about yourself..."
                />
              </div>

              <button type="submit" className="btn btn-primary">Save Changes</button>
            </form>
          )}

          {/* Account Tab */}
          {activeTab === 'account' && (
            <form onSubmit={handleAccountSave} className="animate-fade">
              <h2 style={tabTitleStyle}>Account Details</h2>
              <p style={tabDescStyle}>Manage your platform credentials and contact details.</p>

              <div className="form-group">
                <label className="form-label">Registered Username</label>
                <input
                  type="text"
                  value={currentUser.username}
                  className="form-input"
                  disabled
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
                <span style={helperStyle}>Usernames cannot be changed once registered.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary">Save Account Settings</button>
            </form>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSave} className="animate-fade">
              <h2 style={tabTitleStyle}>Change Password</h2>
              <p style={tabDescStyle}>Maintain your account security by updating passwords regularly.</p>

              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="form-input"
                  required
                  placeholder="••••••••"
                />
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">New Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="form-input"
                  required
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={eyeStyle}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="form-input"
                  required
                  placeholder="••••••••"
                />
              </div>

              <button type="submit" className="btn btn-primary">Change Password</button>
            </form>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleNotificationsSave} className="animate-fade">
              <h2 style={tabTitleStyle}>Notification Preferences</h2>
              <p style={tabDescStyle}>Decide which triggers deliver alerts to your dashboard and email inbox.</p>

              <div style={checkboxStackStyle}>
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={notifApprovals}
                    onChange={(e) => setNotifApprovals(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>Game Submissions & Moderation Updates</div>
                    <div style={chkDescStyle}>Notify me when my uploaded games are approved, rejected, or featured.</div>
                  </div>
                </label>

                <label className="checkbox-group" style={{ marginTop: '1rem' }}>
                  <input
                    type="checkbox"
                    checked={notifComments}
                    onChange={(e) => setNotifComments(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>Social & Interactions</div>
                    <div style={chkDescStyle}>Notify me when users leave comments or likes on my profile or games.</div>
                  </div>
                </label>

                <label className="checkbox-group" style={{ marginTop: '1rem' }}>
                  <input
                    type="checkbox"
                    checked={notifPlatform}
                    onChange={(e) => setNotifPlatform(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>News and Platform Updates</div>
                    <div style={chkDescStyle}>Receive newsletters, feature announcements, and developer highlights.</div>
                  </div>
                </label>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>Save Preferences</button>
            </form>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <form onSubmit={handlePrivacySave} className="animate-fade">
              <h2 style={tabTitleStyle}>Privacy Controls</h2>
              <p style={tabDescStyle}>Control who can discover your VibePlay account and gameplay history.</p>

              <div style={checkboxStackStyle}>
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={privacySearch}
                    onChange={(e) => setPrivacySearch(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>Public Discoverability</div>
                    <div style={chkDescStyle}>Allow search engines indexing and appearing in platform-wide Search results.</div>
                  </div>
                </label>

                <label className="checkbox-group" style={{ marginTop: '1rem' }}>
                  <input
                    type="checkbox"
                    checked={privacyActivity}
                    onChange={(e) => setPrivacyActivity(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>Activity Feed Visbility</div>
                    <div style={chkDescStyle}>Show your "Recently Played" and "Liked" lists publicly on your Profile Page.</div>
                  </div>
                </label>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>Save Privacy Settings</button>
            </form>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="animate-fade">
              <h2 style={tabTitleStyle}>Appearance Settings</h2>
              <p style={tabDescStyle}>Customize the visual theme and styling of your VibePlay experience.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '1rem',
                  marginTop: '0.5rem'
                }}>
                  {/* Light Theme Option */}
                  <button
                    onClick={() => setTheme('light')}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '1.5rem 1rem',
                      borderRadius: '12px',
                      border: '2px solid ' + (theme === 'light' ? 'var(--primary)' : 'var(--border-color)'),
                      background: theme === 'light' ? 'var(--primary-soft)' : 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: theme === 'light' ? 'var(--shadow-sm)' : 'none'
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: '#FFF3EA',
                      border: '1px solid #FFECDD',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#C96F47'
                    }}>
                      <Sun size={20} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Light Theme</div>
                  </button>

                  {/* Dark Theme Option */}
                  <button
                    onClick={() => setTheme('dark')}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '1.5rem 1rem',
                      borderRadius: '12px',
                      border: '2px solid ' + (theme === 'dark' ? 'var(--primary)' : 'var(--border-color)'),
                      background: theme === 'dark' ? 'var(--primary-soft)' : 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: theme === 'dark' ? 'var(--shadow-sm)' : 'none'
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: '#111B2A',
                      border: '1px solid #1B2638',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#F6B17A'
                    }}>
                      <Moon size={20} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Dark Theme</div>
                  </button>

                  {/* System Theme Option */}
                  <button
                    onClick={() => setTheme('system')}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '1.5rem 1rem',
                      borderRadius: '12px',
                      border: '2px solid ' + (theme === 'system' ? 'var(--primary)' : 'var(--border-color)'),
                      background: theme === 'system' ? 'var(--primary-soft)' : 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: theme === 'system' ? 'var(--shadow-sm)' : 'none'
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-default)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)'
                    }}>
                      <Monitor size={20} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>System Default</div>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

// Styles
const unauthStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 150px)',
  textAlign: 'center'
};

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 'var(--container-max-width)',
  margin: '2rem auto',
  padding: '0 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem'
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.02em'
};

const settingsLayoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
  flexWrap: 'wrap',
  alignItems: 'flex-start'
};

const navSidebarStyle: React.CSSProperties = {
  flex: '1 1 200px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const sidebarLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 16px',
  borderRadius: '8px',
  border: 'none',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'all 0.2s'
};

const contentBoxStyle: React.CSSProperties = {
  flex: '3 1 500px',
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  padding: '2.5rem'
};

const tabTitleStyle: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  marginBottom: '0.25rem'
};

const tabDescStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginBottom: '2rem'
};

const avatarPreviewRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1.5rem',
  marginBottom: '1.5rem',
  flexWrap: 'wrap'
};

const avatarPreviewStyle: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  objectFit: 'cover',
  border: '1px solid var(--border-color)'
};

const helperStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginTop: '0.25rem'
};

const eyeStyle: React.CSSProperties = {
  position: 'absolute',
  right: '12px',
  top: '38px',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '4px'
};

const checkboxStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const chkLabelStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  lineHeight: 1.2
};

const chkDescStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginTop: '2px',
  lineHeight: 1.4
};
