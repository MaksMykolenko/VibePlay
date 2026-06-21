import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { sanitizeReturnTo, withReturnTo } from '../lib/returnTo';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { errorMessage, isApiError } from '../lib/api/errors';
import { API_URL, IS_DEMO } from '../lib/appMode';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  ShieldCheck,
  Gamepad2,
  Wrench,
  KeyRound,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { toast } from '../components/toastEvents';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useI18n } from '../i18n/useI18n';
import { useVerificationResend } from '../hooks/useVerificationResend';

const PasswordToggle: React.FC<{ shown: boolean; onToggle: () => void }> = ({
  shown,
  onToggle,
}) => {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      style={eyeButtonStyle}
      aria-label={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}
      aria-pressed={shown}
    >
      {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
    </button>
  );
};

const AuthLanguageControl = () => (
  <div className="auth-language-control">
    <LanguageSwitcher compact />
  </div>
);

const GoogleOAuthButton = () => {
  const { t } = useI18n();
  if (IS_DEMO) return null;

  return (
    <>
      <a
        href={`${API_URL.replace(/\/$/, '')}/auth/google/start`}
        className="btn auth-google-button"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.614Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.963 10.706A5.42 5.42 0 0 1 3.681 9c0-.592.102-1.167.282-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.507.454 3.441 1.345l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
          />
        </svg>
        {t('auth.continueGoogle')}
      </a>
      <div className="auth-divider">
        <span className="auth-divider__line" />
        <span>{t('auth.or')}</span>
        <span className="auth-divider__line" />
      </div>
    </>
  );
};

export const LoginPage: React.FC = () => {
  const { login, switchDemoRole, demoRolesEnabled } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));
  const oauthError = searchParams.get('oauth_error');
  const oauthErrorMessage = oauthError
    ? ((
        {
          invalid_state: t('auth.googleInvalidState'),
          provider_error: t('auth.googleProviderError'),
          unverified_email: t('auth.googleUnverifiedEmail'),
          account_suspended: t('auth.googleAccountSuspended'),
          account_banned: t('auth.googleAccountBanned'),
          invite_required: t('auth.googleInviteRequired'),
          oauth_failed: t('auth.googleFailed'),
        } as Record<string, string>
      )[oauthError] ?? t('auth.googleFailed'))
    : null;
  const visibleError = formError ?? oauthErrorMessage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    const error = await login(email, password);
    setLoading(false);

    if (error) {
      const localizedError =
        error === 'Invalid email or password' ? t('auth.invalidCredentials') : error;
      setFormError(localizedError);
      toast.danger(localizedError);
    } else {
      toast.success(t('auth.loginSuccess'));
      navigate(returnTo);
    }
  };

  const handleDemoLogin = (role: 'player' | 'creator' | 'admin') => {
    switchDemoRole(role);
    toast.success(`Demo build: logged in as Demo ${role.toUpperCase()}.`);
    if (role === 'creator') navigate('/creator');
    else if (role === 'admin') navigate('/admin');
    else navigate('/');
  };

  return (
    <main className="auth-page auth-page--login">
      <section className="auth-card auth-card--login animate-slide-up">
        <AuthLanguageControl />
        <h1 className="auth-title">{t('auth.welcomeBack')}</h1>
        <p className="auth-subtitle">{t('auth.loginSubtitle')}</p>

        <GoogleOAuthButton />

        <form onSubmit={handleSubmit} className="auth-form auth-form--login" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              {t('auth.email')}
            </label>
            <div style={inputWrapperStyle}>
              <Mail size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group">
            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}
            >
              <label className="form-label" htmlFor="login-password" style={{ marginBottom: 0 }}>
                {t('auth.password')}
              </label>
              <Link to="/forgot-password" style={forgotStyle}>
                {t('auth.forgotPassword')}
              </Link>
            </div>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '3rem' }}
              />
              <PasswordToggle
                shown={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
              />
            </div>
          </div>

          <div aria-live="polite" role="status">
            {visibleError && <p style={errorTextStyle}>{visibleError}</p>}
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary auth-submit">
            {t(loading ? 'auth.loggingIn' : 'auth.login')}
          </button>
        </form>

        <div className="auth-footer">
          {t('auth.noAccount')}{' '}
          <Link to={withReturnTo('/register', returnTo)} style={{ color: 'var(--secondary)' }}>
            {t('auth.signUp')}
          </Link>
        </div>

        {import.meta.env.APP_MODE === 'demo' && demoRolesEnabled && (
          <div style={demoBoxStyle}>
            <div style={demoTitleStyle}>Demo accounts (demo build only)</div>
            <p style={demoDescStyle}>
              This is the GitHub Pages demo. Data lives only in your browser.
            </p>
            <div style={demoGridStyle}>
              <button
                onClick={() => handleDemoLogin('player')}
                style={{ ...demoBtnStyle, minHeight: '44px' }}
              >
                <Gamepad2 size={14} aria-hidden="true" />
                <span>Demo Player</span>
              </button>
              <button
                onClick={() => handleDemoLogin('creator')}
                style={{
                  ...demoBtnStyle,
                  minHeight: '44px',
                  color: 'var(--success)',
                  borderColor: 'rgba(61,220,151,0.2)',
                  backgroundColor: 'rgba(61,220,151,0.05)',
                }}
              >
                <Wrench size={14} aria-hidden="true" />
                <span>Demo Creator</span>
              </button>
              <button
                onClick={() => handleDemoLogin('admin')}
                style={{
                  ...demoBtnStyle,
                  minHeight: '44px',
                  color: 'var(--danger)',
                  borderColor: 'rgba(255,93,115,0.2)',
                  backgroundColor: 'rgba(255,93,115,0.05)',
                }}
              >
                <ShieldCheck size={14} aria-hidden="true" />
                <span>Demo Admin</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(searchParams.get('invite') ?? '');

  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteOnly, setInviteOnly] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .authConfig()
      .then((cfg) => {
        if (!cancelled) setInviteOnly(cfg.inviteOnly);
      })
      .catch(() => {
        // Safe fallback: never block open registration, never crash. Show the
        // invite field as optional and let the backend stay authoritative.
        if (!cancelled) setConfigError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Invite field shows when registration is invite-only, or (failsafe) when the
  // mode couldn't be loaded — so a user who has an invite is never stuck. It is
  // required only in confirmed invite-only mode.
  const showInvite = !IS_DEMO && (inviteOnly === true || configError);
  const inviteRequired = inviteOnly === true;

  const getPasswordStrength = () => {
    if (!password)
      return { label: t('auth.strengthEmpty'), color: 'var(--text-secondary)', width: '0%' };
    if (password.length < 10)
      return { label: t('auth.strengthShort'), color: 'var(--danger)', width: '25%' };

    let score = 0;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length >= 16) score++;

    if (score <= 1) return { label: t('auth.strengthOk'), color: 'var(--warning)', width: '50%' };
    if (score <= 2)
      return { label: t('auth.strengthStrong'), color: 'var(--success)', width: '75%' };
    return { label: t('auth.strengthVeryStrong'), color: '#10B981', width: '100%' };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError(t('auth.passwordMismatch'));
      return;
    }
    if (password.length < 10) {
      setFormError(t('auth.passwordMinimum'));
      return;
    }
    if (!agreeTerms) {
      setFormError(t('auth.termsRequired'));
      return;
    }
    if (inviteRequired && !inviteCode.trim()) {
      setFormError(t('auth.inviteRequired'));
      return;
    }

    setLoading(true);
    const error = await register({
      username: username.trim().toLowerCase(),
      email,
      displayName,
      password,
      inviteCode: inviteCode.trim() || undefined,
    });
    setLoading(false);

    if (error) {
      setFormError(error);
      toast.danger(error);
    } else {
      toast.success(IS_DEMO ? 'Demo account created (browser-local).' : t('auth.accountCreated'));
      navigate(sanitizeReturnTo(searchParams.get('returnTo')));
    }
  };

  return (
    <main className="auth-page auth-page--register">
      <section className="auth-card auth-card--register animate-slide-up">
        <AuthLanguageControl />
        <h1 className="auth-title">{t('auth.createAccountTitle')}</h1>
        <p className="auth-subtitle">
          {IS_DEMO
            ? 'Join the VibePlay demo (data stays in your browser).'
            : inviteOnly === true
              ? t('auth.registerInvite')
              : inviteOnly === false
                ? t('auth.registerOpen')
                : t('auth.registerDefault')}
        </p>

        <GoogleOAuthButton />

        <form onSubmit={handleSubmit} className="auth-form auth-form--register" noValidate>
          {showInvite && (
            <div className="form-group auth-form__full">
              <label className="form-label" htmlFor="reg-invite">
                {t(inviteRequired ? 'auth.inviteCode' : 'auth.inviteOptional')}
              </label>
              <div style={inputWrapperStyle}>
                <KeyRound size={16} style={inputIconStyle} aria-hidden="true" />
                <input
                  id="reg-invite"
                  type="text"
                  required={inviteRequired}
                  placeholder={
                    inviteRequired
                      ? t('auth.invitePlaceholder')
                      : t('auth.inviteOptionalPlaceholder')
                  }
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="reg-username">
              {t('auth.username')}
            </label>
            <div style={inputWrapperStyle}>
              <User size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={20}
                pattern="[a-z0-9_]+"
                placeholder="diana_rider"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                aria-describedby="reg-username-hint"
              />
            </div>
            <p id="reg-username-hint" style={hintStyle}>
              {t('auth.usernameHint')}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-displayname">
              {t('auth.displayName')}
            </label>
            <div style={inputWrapperStyle}>
              <User size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reg-displayname"
                type="text"
                required
                maxLength={50}
                placeholder="Diana Rider"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group auth-form__full">
            <label className="form-label" htmlFor="reg-email">
              {t('auth.email')}
            </label>
            <div style={inputWrapperStyle}>
              <Mail size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">
              {t('auth.password')}
            </label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={10}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '3rem' }}
              />
              <PasswordToggle
                shown={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
              />
            </div>

            {password && (
              <div style={{ marginTop: '0.5rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.7rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '3px',
                  }}
                >
                  <span>{t('auth.passwordStrength')}</span>
                  <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                </div>
                <div
                  style={{
                    height: '4px',
                    width: '100%',
                    backgroundColor: 'var(--bg-surface)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: strength.width,
                      backgroundColor: strength.color,
                      transition: 'width 0.3s',
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-confirm">
              {t('auth.confirmPassword')}
            </label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder={t('auth.confirmPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group auth-form__full auth-terms">
            <label className="checkbox-group" htmlFor="reg-terms">
              <input
                id="reg-terms"
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="checkbox-input"
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {t('auth.agreePrefix')}{' '}
                <Link
                  to="/terms"
                  style={{ color: 'var(--secondary)', textDecoration: 'underline' }}
                >
                  {t('auth.terms')}
                </Link>{' '}
                {t('auth.and')}{' '}
                <Link
                  to="/privacy"
                  style={{ color: 'var(--secondary)', textDecoration: 'underline' }}
                >
                  {t('auth.privacy')}
                </Link>
                .
              </span>
            </label>
          </div>

          <div className="auth-form__full" aria-live="polite" role="status">
            {formError && <p style={errorTextStyle}>{formError}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary auth-submit auth-form__full"
          >
            {t(loading ? 'auth.creating' : 'auth.create')}
          </button>
        </form>

        <div className="auth-footer">
          {t('auth.hasAccount')}{' '}
          <Link
            to={withReturnTo('/login', searchParams.get('returnTo'))}
            style={{ color: 'var(--secondary)' }}
          >
            {t('auth.login')}
          </Link>
        </div>
      </section>
    </main>
  );
};

export const ForgotPasswordPage: React.FC = () => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setFormError(null);
    try {
      await api.forgotPassword(email);
      setSuccess(true);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle} className="animate-slide-up">
        <AuthLanguageControl />
        <h1 style={titleStyle}>{t('auth.resetTitle')}</h1>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={successBoxStyle}>
              <Mail size={32} color="var(--success)" aria-hidden="true" />
            </div>
            <p style={{ fontSize: '0.95rem', margin: '1rem 0 1.5rem', lineHeight: 1.6 }}>
              {t('auth.resetSent', { email })}
            </p>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
              {t('auth.backToLogin')}
            </Link>
          </div>
        ) : (
          <>
            <p style={subtitleStyle}>{t('auth.resetInstructions')}</p>

            <form onSubmit={handleSubmit} style={formStyle} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="forgot-email">
                  {t('auth.email')}
                </label>
                <div style={inputWrapperStyle}>
                  <Mail size={16} style={inputIconStyle} aria-hidden="true" />
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>

              <div aria-live="polite" role="status">
                {formError && <p style={errorTextStyle}>{formError}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '0.5rem', minHeight: '44px' }}
              >
                {t(loading ? 'auth.sendingLink' : 'auth.sendResetLink')}
              </button>
            </form>

            <div style={footerTextStyle}>
              {t('auth.remembered')}{' '}
              <Link to="/login" style={{ color: 'var(--secondary)' }}>
                {t('auth.login')}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const ResetPasswordPage: React.FC = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (password !== confirm) {
      setFormError(t('auth.passwordMismatch'));
      return;
    }
    if (password.length < 10) {
      setFormError(t('auth.passwordMinimum'));
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      toast.success(t('auth.passwordUpdated'));
      navigate('/login');
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle} className="animate-slide-up">
          <AuthLanguageControl />
          <h1 style={titleStyle}>{t('auth.invalidLink')}</h1>
          <p style={subtitleStyle}>{t('auth.invalidLinkBody')}</p>
          <Link to="/forgot-password" className="btn btn-primary" style={{ width: '100%' }}>
            {t('auth.requestNewLink')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle} className="animate-slide-up">
        <AuthLanguageControl />
        <h1 style={titleStyle}>{t('auth.choosePassword')}</h1>
        <p style={subtitleStyle}>{t('auth.linkValidity')}</p>

        <form onSubmit={handleSubmit} style={formStyle} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-password">
              {t('auth.newPassword')}
            </label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={10}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '3rem' }}
              />
              <PasswordToggle
                shown={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reset-confirm">
              {t('auth.confirmNewPassword')}
            </label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reset-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder={t('auth.confirmPlaceholder')}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div aria-live="polite" role="status">
            {formError && <p style={errorTextStyle}>{formError}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', minHeight: '44px' }}
          >
            {t(loading ? 'auth.updating' : 'auth.setNewPassword')}
          </button>
        </form>
      </div>
    </div>
  );
};

export const VerifyEmailPage: React.FC = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, refresh } = useAuth();
  const { cooldown, isSending, resend } = useVerificationResend();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'success' | 'error'>(token ? 'pending' : 'error');
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState('/');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let redirectTimer: number | undefined;
    api
      .verifyEmail(token)
      .then(async () => {
        if (cancelled) return;
        const user = await refresh();
        if (cancelled) return;
        const destination =
          user?.role === 'CREATOR' || user?.role === 'ADMIN' || user?.role === 'OWNER'
            ? '/creator'
            : user
              ? `/profile/${user.username}`
              : '/';
        setRedirectPath(destination);
        setState('success');
        redirectTimer = window.setTimeout(() => navigate(destination, { replace: true }), 1_500);
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setUnexpectedError(
          isApiError(err, 'TOKEN_INVALID') || isApiError(err, 'TOKEN_EXPIRED')
            ? null
            : errorMessage(err),
        );
      });
    return () => {
      cancelled = true;
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
    };
  }, [navigate, refresh, token]);

  const message =
    state === 'pending'
      ? t('verification.verifying')
      : state === 'success'
        ? t('verification.success')
        : (unexpectedError ?? t('verification.invalid'));

  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, textAlign: 'center' }} className="animate-slide-up">
        <AuthLanguageControl />
        <h1 style={titleStyle}>{t('verification.pageTitle')}</h1>
        <div
          style={{
            ...successBoxStyle,
            backgroundColor: state === 'error' ? 'rgba(255,93,115,0.1)' : 'rgba(61,220,151,0.1)',
          }}
        >
          {state === 'success' && (
            <CheckCircle2 size={32} color="var(--success)" aria-hidden="true" />
          )}
          {state === 'error' && <XCircle size={32} color="var(--danger)" aria-hidden="true" />}
          {state === 'pending' && <Mail size={32} color="var(--secondary)" aria-hidden="true" />}
        </div>
        <p
          aria-live="polite"
          style={{ fontSize: '0.95rem', margin: '1rem 0 1.5rem', lineHeight: 1.6 }}
        >
          {message}
        </p>
        {state === 'error' && currentUser && (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={isSending || cooldown > 0}
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: '0.75rem' }}
          >
            {isSending
              ? t('verification.sending')
              : cooldown > 0
                ? t('verification.resendCooldown', { seconds: cooldown })
                : t('verification.resend')}
          </button>
        )}
        <Link
          to={state === 'success' ? redirectPath : '/'}
          className="btn btn-secondary"
          style={{ width: '100%' }}
        >
          {state === 'success' ? t('verification.continue') : t('verification.backHome')}
        </Link>
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 70px - 64px)',
  padding: '3rem 1.5rem',
  backgroundColor: 'var(--bg-main)',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '400px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  padding: '2rem',
  boxShadow: 'var(--shadow-lg)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.75rem',
  fontWeight: 700,
  textAlign: 'center',
  marginBottom: '0.5rem',
  letterSpacing: '-0.02em',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  textAlign: 'center',
  lineHeight: 1.5,
  marginBottom: '1.5rem',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const inputWrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

const inputIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '14px',
  color: 'var(--text-secondary)',
  pointerEvents: 'none',
};

const eyeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: '4px',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '10px',
  minWidth: '44px',
  minHeight: '44px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const forgotStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--secondary)',
  fontWeight: 500,
};

const footerTextStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  textAlign: 'center',
  marginTop: '1.5rem',
};

const errorTextStyle: React.CSSProperties = {
  color: 'var(--danger)',
  fontSize: '0.85rem',
  margin: 0,
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  margin: '0.35rem 0 0',
};

const successBoxStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  backgroundColor: 'rgba(61,220,151,0.1)',
  margin: '0 auto 1rem',
};

const demoBoxStyle: React.CSSProperties = {
  marginTop: '2rem',
  borderTop: '1px solid var(--border-color)',
  paddingTop: '1.5rem',
};

const demoTitleStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  letterSpacing: '0.05em',
  marginBottom: '0.25rem',
};

const demoDescStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginBottom: '1rem',
};

const demoGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '8px',
};

const demoBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '10px',
  borderRadius: '8px',
  fontSize: '0.8rem',
  fontWeight: 600,
  backgroundColor: 'rgba(0,207,255,0.05)',
  color: 'var(--secondary)',
  border: '1px solid rgba(0,207,255,0.2)',
  cursor: 'pointer',
  transition: 'all 0.2s',
};
