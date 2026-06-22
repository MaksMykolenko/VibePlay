import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SessionDto } from '@vibeplay/shared';
import { useAuth } from '../hooks/useAuth';
import {
  User,
  Shield,
  Key,
  Bell,
  Eye,
  EyeOff,
  Palette,
  Sun,
  Moon,
  Monitor,
  UploadCloud,
  Trash2,
  CreditCard,
} from 'lucide-react';
import { toast } from '../components/toastEvents';
import { useTheme } from '../hooks/useTheme';
import { api } from '../lib/api';
import { IS_DEMO } from '../lib/appMode';
import { errorMessage } from '../lib/api/errors';
import { useI18n } from '../i18n/useI18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { BillingPanel } from '../components/BillingPanel';

/** Accepted avatar image types and size limit, mirrored from the API. */
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export const SettingsPage: React.FC = () => {
  const { currentUser, account, refresh, updateProfile, logoutAll } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale } = useI18n();

  // Tab state
  const [activeTab, setActiveTab] = useState<
    'profile' | 'account' | 'password' | 'notifications' | 'privacy' | 'appearance' | 'billing'
  >(location.pathname.endsWith('/billing') ? 'billing' : 'profile');

  const selectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'billing') navigate('/settings/billing');
    else if (location.pathname.endsWith('/billing')) navigate('/settings');
  };

  // Form states
  const [displayName, setDisplayName] = useState<string>();
  const [bio, setBio] = useState<string>();
  const [avatar, setAvatar] = useState<string>();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
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
          {t('settings.authRequired')}
        </p>
        <button onClick={() => navigate('/login')} className="btn btn-primary">
          {t('settings.goToLogin')}
        </button>
      </div>
    );
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // `avatar` is undefined unless the URL field was edited; passing it through
    // unchanged would clobber an uploaded avatar, so we only send it when set.
    const error = await updateProfile(
      displayName ?? currentUser.displayName,
      bio ?? currentUser.bio,
      avatar,
    );
    if (error) {
      toast.danger(error);
    } else {
      setDisplayName(undefined);
      setBio(undefined);
      setAvatar(undefined);
      toast.success(t('settings.profileUpdated'));
    }
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type as (typeof AVATAR_TYPES)[number])) {
      toast.danger(t('avatar.unsupportedType'));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.danger(t('avatar.tooLarge'));
      return;
    }
    setAvatarUploading(true);
    try {
      const intent = await api.avatarUploadIntent({
        contentType: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
        fileName: file.name,
        size: file.size,
      });
      await api.uploadAvatarDirect(intent.objectKey, intent.token, file);
      await api.completeAvatar(intent.objectKey);
      await refresh(); // updates header/sidebar/profile/comments immediately
      setAvatar(undefined); // drop any stale URL-field edit
      toast.success(t('avatar.success'));
    } catch (error) {
      toast.danger(errorMessage(error));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarUploading(true);
    try {
      await api.removeAvatar();
      await refresh();
      setAvatar(undefined);
      toast.success(t('avatar.removed'));
    } catch (error) {
      toast.danger(errorMessage(error));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAccountSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.warning(t('settings.emailUnavailable'));
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await api.revokeSession(id);
      setSessions((rows) => rows.filter((row) => row.id !== id));
      toast.success(t('settings.sessionRevoked'));
    } catch (error) {
      toast.danger(errorMessage(error));
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm(t('settings.logoutAllConfirm'))) return;
    await logoutAll();
    navigate('/login');
  };

  const handleDeletionRequest = async () => {
    if (!window.confirm(t('settings.deleteConfirm'))) {
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
      toast.success(t('settings.exportDownloaded'));
    } catch (error) {
      toast.danger(errorMessage(error));
    } finally {
      setDangerBusy(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.danger(t('settings.passwordMismatch'));
      return;
    }
    if (newPassword.length < 10) {
      toast.warning(t('settings.passwordMinimum'));
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success(t('settings.passwordUpdated'));
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
      toast.success(t('settings.notificationsSaved'));
    } catch (error) {
      toast.danger(errorMessage(error));
    }
  };

  const handlePrivacySave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.warning(t('settings.privacyUnavailable'));
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>{t('settings.title')}</h1>

      <div style={settingsLayoutStyle}>
        {/* Settings Sidebar Links */}
        <aside style={navSidebarStyle} className="settings-sidebar">
          <button
            onClick={() => selectTab('profile')}
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
            onClick={() => selectTab('account')}
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
            onClick={() => selectTab('password')}
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
            onClick={() => selectTab('notifications')}
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
            onClick={() => selectTab('privacy')}
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
            onClick={() => selectTab('appearance')}
            style={{
              ...sidebarLinkStyle,
              backgroundColor: activeTab === 'appearance' ? 'var(--bg-hover)' : 'transparent',
              color: activeTab === 'appearance' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <Palette size={16} />
            <span>{t('settings.appearance')}</span>
          </button>

          {(currentUser.role === 'creator' ||
            currentUser.role === 'admin' ||
            currentUser.role === 'owner') && (
            <button
              onClick={() => selectTab('billing')}
              style={{
                ...sidebarLinkStyle,
                backgroundColor: activeTab === 'billing' ? 'var(--bg-hover)' : 'transparent',
                color: activeTab === 'billing' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <CreditCard size={16} />
              <span>{t('settings.billing')}</span>
            </button>
          )}
        </aside>

        {/* Content Box */}
        <div style={contentBoxStyle} className="bg-glass animate-fade">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.profileTitle')}</h2>
              <p style={tabDescStyle}>{t('settings.profileDescription')}</p>

              <div style={avatarPreviewRowStyle}>
                {currentUser.avatar ? (
                  <img
                    src={avatar ?? currentUser.avatar}
                    alt={t('settings.avatarPreviewAlt')}
                    style={avatarPreviewStyle}
                  />
                ) : (
                  <div style={avatarFallbackStyle} aria-hidden>
                    {(currentUser.displayName || currentUser.username || '?')
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!IS_DEMO && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <label
                        className="btn btn-secondary btn-sm"
                        style={{
                          cursor: avatarUploading ? 'wait' : 'pointer',
                          gap: '6px',
                          opacity: avatarUploading ? 0.7 : 1,
                        }}
                      >
                        <UploadCloud size={15} />
                        <span>
                          {avatarUploading
                            ? t('avatar.uploading')
                            : currentUser.avatar
                              ? t('avatar.changeButton')
                              : t('avatar.uploadButton')}
                        </span>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleAvatarFile}
                          disabled={avatarUploading}
                          style={{ display: 'none' }}
                        />
                      </label>
                      {currentUser.avatar && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={dangerGhostBtnStyle}
                          disabled={avatarUploading}
                          onClick={() => void handleAvatarRemove()}
                        >
                          <Trash2 size={14} style={{ marginRight: 4 }} />
                          {t('avatar.remove')}
                        </button>
                      )}
                    </div>
                  )}
                  <span style={helperStyle}>{t('avatar.fileHint')}</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('avatar.orUrl')}</label>
                <input
                  type="text"
                  value={avatar ?? currentUser.avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder={t('settings.avatarUrlPlaceholder')}
                  className="form-input"
                />
                <span style={helperStyle}>{t('avatar.urlHint')}</span>
              </div>

              <div className="form-group">
                <label className="form-label">{t('settings.displayName')}</label>
                <input
                  type="text"
                  value={displayName ?? currentUser.displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('settings.biography')}</label>
                <textarea
                  value={bio ?? currentUser.bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="form-input"
                  style={{ minHeight: '120px', resize: 'vertical' }}
                  placeholder={t('settings.biographyPlaceholder')}
                />
              </div>

              <button type="submit" className="btn btn-primary">
                {t('settings.save')}
              </button>
            </form>
          )}

          {/* Account Tab */}
          {activeTab === 'account' && (
            <form onSubmit={handleAccountSave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.accountTitle')}</h2>
              <p style={tabDescStyle}>{t('settings.accountDescription')}</p>

              <div className="form-group">
                <label className="form-label">{t('settings.registeredUsername')}</label>
                <input
                  type="text"
                  value={currentUser.username}
                  className="form-input"
                  disabled
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
                <span style={helperStyle}>{t('settings.usernameImmutable')}</span>
              </div>

              <div className="form-group">
                <label className="form-label">{t('settings.emailAddress')}</label>
                <input
                  type="email"
                  value={currentUser.email}
                  className="form-input"
                  disabled
                  required
                />
                <span style={helperStyle}>{t('settings.emailSupport')}</span>
              </div>

              <button type="submit" className="btn btn-primary">
                {t('settings.saveAccount')}
              </button>

              {/* Active sessions */}
              <h3 style={sectionTitleStyle}>{t('settings.activeSessions')}</h3>
              <p style={tabDescStyle}>{t('settings.activeSessionsDescription')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((session) => (
                  <div key={session.id} style={sessionRowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        {session.current
                          ? t('settings.thisDevice')
                          : (session.userAgent ?? t('settings.unknownDevice'))}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {t('settings.sessionDates', {
                          started: new Date(session.createdAt).toLocaleString(locale),
                          expires: new Date(session.expiresAt).toLocaleDateString(locale),
                        })}
                      </div>
                    </div>
                    {!session.current && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={dangerGhostBtnStyle}
                        onClick={() => void handleRevokeSession(session.id)}
                      >
                        {t('settings.revoke')}
                      </button>
                    )}
                  </div>
                ))}
                {sessionsLoaded && sessions.length === 0 && (
                  <p style={helperStyle}>{t('settings.noSessions')}</p>
                )}
              </div>
              <button
                type="button"
                className="btn"
                style={{ ...dangerGhostBtnStyle, marginTop: '0.75rem' }}
                onClick={() => void handleLogoutAll()}
              >
                {t('settings.logoutAll')}
              </button>

              {/* Danger zone */}
              <h3 style={sectionTitleStyle}>{t('settings.yourData')}</h3>
              <p style={tabDescStyle}>
                {t('settings.dataDescriptionPrefix')}{' '}
                <a href="/privacy" style={{ color: 'var(--secondary)' }}>
                  {t('footer.privacy')}
                </a>
                {t('settings.dataDescriptionSuffix')}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  disabled={dangerBusy}
                  style={dangerGhostBtnStyle}
                  onClick={() => void handleExportRequest()}
                >
                  {t('settings.downloadExport')}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={dangerBusy}
                  style={dangerSolidBtnStyle}
                  onClick={() => void handleDeletionRequest()}
                >
                  {t('settings.requestDeletion')}
                </button>
              </div>
            </form>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.passwordTitle')}</h2>
              <p style={tabDescStyle}>{t('settings.passwordDescription')}</p>

              <div className="form-group">
                <label className="form-label">{t('settings.currentPassword')}</label>
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
                <label className="form-label">{t('settings.newPassword')}</label>
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
                  aria-label={t(showPass ? 'auth.hidePassword' : 'auth.showPassword')}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">{t('settings.confirmNewPassword')}</label>
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
                {t('settings.changePassword')}
              </button>
            </form>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleNotificationsSave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.notificationsTitle')}</h2>
              <p style={tabDescStyle}>{t('settings.notificationsDescription')}</p>

              <div style={checkboxStackStyle}>
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={notifApprovals ?? account?.notificationPrefs.moderationUpdates ?? true}
                    onChange={(e) => setNotifApprovals(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>{t('settings.moderationNotifications')}</div>
                    <div style={chkDescStyle}>
                      {t('settings.moderationNotificationsDescription')}
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
                    <div style={chkLabelStyle}>{t('settings.socialNotifications')}</div>
                    <div style={chkDescStyle}>{t('settings.socialNotificationsDescription')}</div>
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
                    <div style={chkLabelStyle}>{t('settings.platformNotifications')}</div>
                    <div style={chkDescStyle}>{t('settings.platformNotificationsDescription')}</div>
                  </div>
                </label>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                {t('settings.savePreferences')}
              </button>
            </form>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <form onSubmit={handlePrivacySave} className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.privacyTitle')}</h2>
              <p style={tabDescStyle}>{t('settings.privacyDescription')}</p>

              <div style={checkboxStackStyle}>
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={privacySearch}
                    onChange={(e) => setPrivacySearch(e.target.checked)}
                    className="checkbox-input"
                  />
                  <div>
                    <div style={chkLabelStyle}>{t('settings.publicDiscoverability')}</div>
                    <div style={chkDescStyle}>{t('settings.publicDiscoverabilityDescription')}</div>
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
                    <div style={chkLabelStyle}>{t('settings.activityVisibility')}</div>
                    <div style={chkDescStyle}>{t('settings.activityVisibilityDescription')}</div>
                  </div>
                </label>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                {t('settings.savePrivacy')}
              </button>
            </form>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="animate-fade">
              <h2 style={tabTitleStyle}>{t('settings.appearanceTitle')}</h2>
              <p style={tabDescStyle}>{t('settings.appearanceDescription')}</p>

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

          {activeTab === 'billing' && (
            <BillingPanel
              canUpgrade={
                currentUser.role === 'creator' ||
                currentUser.role === 'admin' ||
                currentUser.role === 'owner'
              }
            />
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

const avatarFallbackStyle: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  border: '1px solid var(--border-color)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.6rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  background: 'var(--surface-2)',
  flexShrink: 0,
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
