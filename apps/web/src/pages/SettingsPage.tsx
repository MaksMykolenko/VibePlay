import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionDto } from '@vibeplay/shared';
import { useAuth } from '../hooks/useAuth';
import { User, Shield, Key, Bell, Eye, EyeOff, Palette, Sun, Moon, Monitor } from 'lucide-react';
import { toast } from '../components/toastEvents';
import { useTheme } from '../hooks/useTheme';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api/errors';
import { useI18n } from '../i18n/useI18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export const SettingsPage: React.FC = () => {
  const { currentUser, account, refresh, updateProfile, logoutAll } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { t } = useI18n();

  // Tab state
  const [activeTab, setActiveTab] = useState<
    'profile' | 'account' | 'password' | 'notifications' | 'privacy' | 'appearance'
  >('profile');

  // Form states
  const [displayName, setDisplayName] = useState<string>();
  const [bio, setBio] = useState<string>();
  const [avatar, setAvatar] = useState<string>();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Sessions (Account tab)
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [dangerBusy, setDangerBusy] = useState(false);

  // Checks
  const [notifApprovals, setNotifApprovals] = useState<boolean>();
  const [notifComments, setNotifComments] = useState<boolean>();
  const [notifPlatform, setNotifPlatform] = useState<boolean>();
  const [privacySearch, setPrivacySearch] = useState(true);
  const [privacyActivity, setPrivacyActivity] = useState(true);

  useEffect(() => {
    if (activeTab !== 'account' || sessionsLoaded || !currentUser) return;
    api
      .listSessions()
      .then((rows) => {
        setSessions(rows);
        setSessionsLoaded(true);
      })
      .catch((error) => toast.danger(errorMessage(error)));
  }, [activeTab, currentUser, sessionsLoaded]);

  if (!currentUser) {
    return (
      <div style={unauthStyle}>
        <h2>{t('settings.login')}</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem' }}>
          You must be authenticated to view account settings.
        </p>
        <button onClick={() => navigate('/login')} className="btn btn-primary">
          Go to Login
        </button>
      </div>
    );
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = await updateProfile(
      displayName ?? currentUser.displayName,
      bio ?? currentUser.bio,
      avatar ?? currentUser.avatar,
    );
    if (error) {
      toast.danger(error);
    } else {
      setDisplayName(undefined);
      setBio(undefined);
      setAvatar(undefined);
      toast.success('Profile settings updated successfully!');
    }
  };

  const handleAccountSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.warning('Email changes are not available in the private beta.');
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await api.revokeSession(id);
      setSessions((rows) => rows.filter((row) => row.id !== id));
      toast.success('Session revoked.');
    } catch (error) {
      toast.danger(errorMessage(error));
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm('Log out of ALL sessions, including this one?')) return;
    await logoutAll();
    navigate('/login');
  };

  const handleDeletionRequest = async () => {
    if (
      !window.confirm(
        'Request deletion of your VibePlay account? An administrator will process the request within 30 days. This cannot be undone once processed.',
      )
    ) {
      return;
    }
    setDangerBusy(true);
    try {
      const message = await api.requestAccountDeletion();
      toast.success(message);
      await refresh();
      navigate('/login');
    } catch (error) {
      toast.danger(errorMessage(error));
    } finally {
      setDangerBusy(false);
    }
  };

  const handleExportRequest = async () => {
    setDangerBusy(true);
    try {
      const exported = await api.downloadDataExport();
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vibeplay-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Your data export was downloaded.');
    } catch (error) {
      toast.danger(errorMessage(error));
    } finally {
      setDangerBusy(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.danger('New passwords do not match!');
      return;
    }
    if (newPassword.length < 10) {
      toast.warning('New password must be at least 10 characters.');
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.danger(errorMessage(error));
    }
  };

  const handleNotificationsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateNotificationPrefs({
        moderationUpdates: notifApprovals ?? account?.notificationPrefs.moderationUpdates ?? true,
        social: notifComments ?? account?.notificationPrefs.social ?? true,
        platformNews: notifPlatform ?? account?.notificationPrefs.platformNews ?? false,
      });
      await refresh();
      setNotifApprovals(undefined);
      setNotifComments(undefined);
      setNotifPlatform(undefined);
      toast.success('Notification preferences saved.');
    } catch (error) {
      toast.danger(errorMessage(error));
    }
  };

  const handlePrivacySave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.warning('Privacy preference controls are not available in the private beta.');
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>{t('settings.title')}</h1>

      <div style={settingsLayoutStyle}>
        {/* Settings Sidebar Links */}
        <aside style={navSidebarStyle} className="settings-sidebar">
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              ...sidebarLinkStyle,
              backgroundColor: activeTab === 'profile' ? 'var(--bg-hover)' : 'transparent',
              color: activeTab === 'profile' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <User size={16} />
            <span>{t('settings.profile')}</span>
          </button>

          <button
            onClick={() => setActiveTab('account')}
            style={{
              ...sidebarLinkStyle,
              backgroundColor: activeTab === 'account' ? 'var(--bg-hover)' : 'transparent',
              color: activeTab === 'account' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <Shield size={16} />
            <span>{t('settings.account')}</span>
          </button>

          <button
            onClick={() => setActiveTab('password')}
            style={{
              ...sidebarLinkStyle,
              backgroundColor: activeTab === 'password' ? 'var(--bg-hover)' : 'transparent',
              color: activeTab === 'password' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <Key size={16} />
            <span>{t('settings.password')}</span>
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            style={{
              ...sidebarLinkStyle,
              backgroundColor: activeTab === 'notifications' ? 'var(--bg-hover)' : 'transparent',
              color:
                activeTab === 'notifications' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <Bell size={16} />
            <span>{t('settings.notifications')}</span>
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            style={{
              ...sidebarLinkStyle,
              backgroundColor: activeTab === 'privacy' ? 'var(--bg-hover)' : 'transparent',
              color: activeTab === 'privacy' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <Eye size={16} />
            <span>{t('settings.privacy')}</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            style={{
              ...sidebarLinkStyle,
              backgroundColor: activeTab === 'appearance' ? 'var(--bg-hover)' : 'transparent',
              color: activeTab === 'appearance' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <Palette size={16} />
            <span>{t('settings.appearance')}</span>
          </button>
        </aside>

        {/* Content Box */}
        <div style={contentBoxStyle} className="bg-glass animate-fade">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.profileTitle')}</h2>
              <p style={tabDescStyle}>Customize how your name and avatar appear across VibePlay.</p>

              <div style={avatarPreviewRowStyle}>
                <img src={avatar ?? currentUser.avatar} alt="Preview" style={avatarPreviewStyle} />
                <div style={{ flex: 1 }}>
                  <label className="form-label">Avatar URL</label>
                  <input
                    type="text"
                    value={avatar ?? currentUser.avatar}
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
                  value={displayName ?? currentUser.displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Biography</label>
                <textarea
                  value={bio ?? currentUser.bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="form-input"
                  style={{ minHeight: '120px', resize: 'vertical' }}
                  placeholder="Tell players and creators about yourself..."
                />
              </div>

              <button type="submit" className="btn btn-primary">
                Save Changes
              </button>
            </form>
          )}

          {/* Account Tab */}
          {activeTab === 'account' && (
            <form onSubmit={handleAccountSave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.accountTitle')}</h2>
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
                  value={currentUser.email}
                  className="form-input"
                  disabled
                  required
                />
                <span style={helperStyle}>Contact support to change the registered email.</span>
              </div>

              <button type="submit" className="btn btn-primary">
                Save Account Settings
              </button>

              {/* Active sessions */}
              <h3 style={sectionTitleStyle}>Active sessions</h3>
              <p style={tabDescStyle}>
                Sessions where this account is currently logged in. Revoke anything you don't
                recognize.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((session) => (
                  <div key={session.id} style={sessionRowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        {session.current ? 'This device' : (session.userAgent ?? 'Unknown device')}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Started {new Date(session.createdAt).toLocaleString()} · expires{' '}
                        {new Date(session.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    {!session.current && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={dangerGhostBtnStyle}
                        onClick={() => void handleRevokeSession(session.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
                {sessionsLoaded && sessions.length === 0 && (
                  <p style={helperStyle}>No active sessions found.</p>
                )}
              </div>
              <button
                type="button"
                className="btn"
                style={{ ...dangerGhostBtnStyle, marginTop: '0.75rem' }}
                onClick={() => void handleLogoutAll()}
              >
                Log out of all sessions
              </button>

              {/* Danger zone */}
              <h3 style={sectionTitleStyle}>Your data</h3>
              <p style={tabDescStyle}>
                Export or delete your account data as described in the{' '}
                <a href="/privacy" style={{ color: 'var(--secondary)' }}>
                  Privacy Policy
                </a>
                . Data exports download immediately. Deletion requests are processed by an
                administrator within 30 days.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  disabled={dangerBusy}
                  style={dangerGhostBtnStyle}
                  onClick={() => void handleExportRequest()}
                >
                  Download data export
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={dangerBusy}
                  style={dangerSolidBtnStyle}
                  onClick={() => void handleDeletionRequest()}
                >
                  Request account deletion
                </button>
              </div>
            </form>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.passwordTitle')}</h2>
              <p style={tabDescStyle}>
                Maintain your account security by updating passwords regularly.
              </p>

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
                <button type="button" onClick={() => setShowPass(!showPass)} style={eyeStyle}>
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

              <button type="submit" className="btn btn-primary">
                Change Password
              </button>
            </form>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleNotificationsSave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.notificationsTitle')}</h2>
              <p style={tabDescStyle}>
                Decide which triggers deliver alerts to your dashboard and email inbox.
              </p>

              <div style={checkboxStackStyle}>
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={notifApprovals ?? account?.notificationPrefs.moderationUpdates ?? true}
                    onChange={(e) => setNotifApprovals(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>Game Submissions & Moderation Updates</div>
                    <div style={chkDescStyle}>
                      Notify me when my uploaded games are approved, rejected, or featured.
                    </div>
                  </div>
                </label>

                <label className="checkbox-group" style={{ marginTop: '1rem' }}>
                  <input
                    type="checkbox"
                    checked={notifComments ?? account?.notificationPrefs.social ?? true}
                    onChange={(e) => setNotifComments(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>Social & Interactions</div>
                    <div style={chkDescStyle}>
                      Notify me when users leave comments or likes on my profile or games.
                    </div>
                  </div>
                </label>

                <label className="checkbox-group" style={{ marginTop: '1rem' }}>
                  <input
                    type="checkbox"
                    checked={notifPlatform ?? account?.notificationPrefs.platformNews ?? false}
                    onChange={(e) => setNotifPlatform(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>News and Platform Updates</div>
                    <div style={chkDescStyle}>
                      Receive newsletters, feature announcements, and developer highlights.
                    </div>
                  </div>
                </label>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                Save Preferences
              </button>
            </form>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <form onSubmit={handlePrivacySave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.privacyTitle')}</h2>
              <p style={tabDescStyle}>
                Control who can discover your VibePlay account and gameplay history.
              </p>

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
                    <div style={chkDescStyle}>
                      Allow search engines indexing and appearing in platform-wide Search results.
                    </div>
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
                    <div style={chkDescStyle}>
                      Show your "Recently Played" and "Liked" lists publicly on your Profile Page.
                    </div>
                  </div>
                </label>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                Save Privacy Settings
              </button>
            </form>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.appearanceTitle')}</h2>
              <p style={tabDescStyle}>
                Customize the visual theme and styling of your VibePlay experience.
              </p>

              <div className="settings-language-panel">
                <div>
                  <strong>{t('settings.languageTitle')}</strong>
                  <p>{t('settings.languageDescription')}</p>
                </div>
                <LanguageSwitcher />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '1rem',
                    marginTop: '0.5rem',
                  }}
                >
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
                      border:
                        '2px solid ' +
                        (theme === 'light' ? 'var(--primary)' : 'var(--border-color)'),
                      background: theme === 'light' ? 'var(--primary-soft)' : 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: theme === 'light' ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: '#FFF3EA',
                        border: '1px solid #FFECDD',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#C96F47',
                      }}
                    >
                      <Sun size={20} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('profile.light')}</div>
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
                      border:
                        '2px solid ' +
                        (theme === 'dark' ? 'var(--primary)' : 'var(--border-color)'),
                      background: theme === 'dark' ? 'var(--primary-soft)' : 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: theme === 'dark' ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: '#111B2A',
                        border: '1px solid #1B2638',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#F6B17A',
                      }}
                    >
                      <Moon size={20} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('profile.dark')}</div>
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
                      border:
                        '2px solid ' +
                        (theme === 'system' ? 'var(--primary)' : 'var(--border-color)'),
                      background: theme === 'system' ? 'var(--primary-soft)' : 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: theme === 'system' ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Monitor size={20} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('profile.system')}</div>
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
  textAlign: 'center',
};

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 'var(--container-max-width)',
  margin: '2rem auto',
  padding: '0 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.02em',
};

const settingsLayoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
};

const navSidebarStyle: React.CSSProperties = {
  flex: '1 1 200px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
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
  transition: 'all 0.2s',
};

const contentBoxStyle: React.CSSProperties = {
  flex: '3 1 500px',
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  padding: '2.5rem',
};

const tabTitleStyle: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  marginBottom: '0.25rem',
};

const tabDescStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginBottom: '2rem',
};

const avatarPreviewRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1.5rem',
  marginBottom: '1.5rem',
  flexWrap: 'wrap',
};

const avatarPreviewStyle: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  objectFit: 'cover',
  border: '1px solid var(--border-color)',
};

const helperStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginTop: '0.25rem',
};

const eyeStyle: React.CSSProperties = {
  position: 'absolute',
  right: '12px',
  top: '38px',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '4px',
};

const checkboxStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  margin: '2rem 0 0.25rem',
};

const sessionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--surface-1)',
};

const dangerGhostBtnStyle: React.CSSProperties = {
  border: '1px solid rgba(255,93,115,0.4)',
  color: 'var(--danger)',
  background: 'transparent',
};

const dangerSolidBtnStyle: React.CSSProperties = {
  border: '1px solid var(--danger)',
  color: '#fff',
  background: 'var(--danger)',
};

const chkLabelStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  lineHeight: 1.2,
};

const chkDescStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginTop: '2px',
  lineHeight: 1.4,
};
