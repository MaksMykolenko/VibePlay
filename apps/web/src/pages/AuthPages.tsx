import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api/errors';
import { IS_DEMO } from '../lib/appMode';
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

const PasswordToggle: React.FC<{ shown: boolean; onToggle: () => void }> = ({
  shown,
  onToggle,
}) => (
  <button
    type="button"
    onClick={onToggle}
    style={eyeButtonStyle}
    aria-label={shown ? 'Hide password' : 'Show password'}
    aria-pressed={shown}
  >
    {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
  </button>
);

export const LoginPage: React.FC = () => {
  const { login, switchDemoRole, demoRolesEnabled } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    const error = await login(email, password);
    setLoading(false);

    if (error) {
      setFormError(error);
      toast.danger(error);
    } else {
      toast.success('Logged in successfully!');
      navigate('/');
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
    <div style={containerStyle}>
      <div style={cardStyle} className="animate-slide-up">
        <h1 style={titleStyle}>Welcome back</h1>
        <p style={subtitleStyle}>Log in to VibePlay to play games and publish creations.</p>

        <form onSubmit={handleSubmit} style={formStyle} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email Address
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
                Password
              </label>
              <Link to="/forgot-password" style={forgotStyle}>
                Forgot password?
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
            {formError && <p style={errorTextStyle}>{formError}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', minHeight: '44px' }}
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <div style={footerTextStyle}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--secondary)' }}>
            Sign up
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
      </div>
    </div>
  );
};

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
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
    if (!password) return { label: 'Empty', color: 'var(--text-secondary)', width: '0%' };
    if (password.length < 10)
      return { label: 'Too short (min 10)', color: 'var(--danger)', width: '25%' };

    let score = 0;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length >= 16) score++;

    if (score <= 1) return { label: 'OK', color: 'var(--warning)', width: '50%' };
    if (score <= 2) return { label: 'Strong', color: 'var(--success)', width: '75%' };
    return { label: 'Very strong', color: '#10B981', width: '100%' };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (password.length < 10) {
      setFormError('Password must be at least 10 characters.');
      return;
    }
    if (!agreeTerms) {
      setFormError('You must agree to the Terms of Service.');
      return;
    }
    if (inviteRequired && !inviteCode.trim()) {
      setFormError('An invite code is required to register right now.');
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
      toast.success(
        IS_DEMO
          ? 'Demo account created (browser-local).'
          : 'Account created! Check your inbox to verify your email.',
      );
      navigate('/');
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, maxWidth: '440px' }} className="animate-slide-up">
        <h1 style={titleStyle}>Create an account</h1>
        <p style={subtitleStyle}>
          {IS_DEMO
            ? 'Join the VibePlay demo (data stays in your browser).'
            : inviteOnly === true
              ? 'VibePlay is in private beta — registration requires an invite code.'
              : inviteOnly === false
                ? 'Create your VibePlay account. Registration is currently open.'
                : 'Create your VibePlay account.'}
        </p>

        <form onSubmit={handleSubmit} style={formStyle} noValidate>
          {showInvite && (
            <div className="form-group">
              <label className="form-label" htmlFor="reg-invite">
                {inviteRequired ? 'Invite code' : 'Invite code (optional)'}
              </label>
              <div style={inputWrapperStyle}>
                <KeyRound size={16} style={inputIconStyle} aria-hidden="true" />
                <input
                  id="reg-invite"
                  type="text"
                  required={inviteRequired}
                  placeholder={
                    inviteRequired
                      ? 'Paste your beta invite code'
                      : 'Optional — paste an invite code if you have one'
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
              Username
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
              3–20 characters: lowercase letters, numbers, underscore.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-displayname">
              Display Name
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

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">
              Email Address
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

          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label className="form-label" htmlFor="reg-password">
              Password
            </label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={10}
                placeholder="At least 10 characters"
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
                  <span>Password strength:</span>
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
              Confirm Password
            </label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="checkbox-group" htmlFor="reg-terms">
              <input
                id="reg-terms"
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="checkbox-input"
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                I agree to the{' '}
                <Link
                  to="/terms"
                  style={{ color: 'var(--secondary)', textDecoration: 'underline' }}
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  to="/privacy"
                  style={{ color: 'var(--secondary)', textDecoration: 'underline' }}
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
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
            {loading ? 'Creating Account…' : 'Create Account'}
          </button>
        </form>

        <div style={footerTextStyle}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--secondary)' }}>
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
};

export const ForgotPasswordPage: React.FC = () => {
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
        <h1 style={titleStyle}>Reset Password</h1>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={successBoxStyle}>
              <Mail size={32} color="var(--success)" aria-hidden="true" />
            </div>
            <p style={{ fontSize: '0.95rem', margin: '1rem 0 1.5rem', lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, a reset link is on its way. The
              link is valid for 60 minutes and can be used once.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
              Back to Login
            </Link>
          </div>
        ) : (
          <>
            <p style={subtitleStyle}>
              Enter your email below and we will send you instructions to reset your password.
            </p>

            <form onSubmit={handleSubmit} style={formStyle} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="forgot-email">
                  Email Address
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
                {loading ? 'Sending link…' : 'Send Reset Link'}
              </button>
            </form>

            <div style={footerTextStyle}>
              Remembered password?{' '}
              <Link to="/login" style={{ color: 'var(--secondary)' }}>
                Log in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const ResetPasswordPage: React.FC = () => {
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
      setFormError('Passwords do not match.');
      return;
    }
    if (password.length < 10) {
      setFormError('Password must be at least 10 characters.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      toast.success('Password updated. Log in with your new password.');
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
          <h1 style={titleStyle}>Invalid link</h1>
          <p style={subtitleStyle}>
            This password reset link is missing its token. Request a new one below.
          </p>
          <Link to="/forgot-password" className="btn btn-primary" style={{ width: '100%' }}>
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle} className="animate-slide-up">
        <h1 style={titleStyle}>Choose a new password</h1>
        <p style={subtitleStyle}>The link is valid for 60 minutes and can be used once.</p>

        <form onSubmit={handleSubmit} style={formStyle} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-password">
              New password
            </label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={10}
                placeholder="At least 10 characters"
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
              Confirm new password
            </label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} aria-hidden="true" />
              <input
                id="reset-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder="Re-enter password"
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
            {loading ? 'Updating…' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'success' | 'error'>(token ? 'pending' : 'error');
  const [message, setMessage] = useState(
    token ? 'Verifying your email…' : 'This verification link is missing its token.',
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .verifyEmail(token)
      .then(async () => {
        if (cancelled) return;
        setState('success');
        setMessage('Your email is verified. Welcome to the VibePlay beta!');
        await refresh();
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setMessage(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, textAlign: 'center' }} className="animate-slide-up">
        <h1 style={titleStyle}>Email verification</h1>
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
        <Link to="/" className="btn btn-primary" style={{ width: '100%' }}>
          Go to VibePlay
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
