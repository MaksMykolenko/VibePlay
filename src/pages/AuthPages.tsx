import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Eye, EyeOff, Lock, Mail, User, ShieldCheck, Gamepad2, Wrench } from 'lucide-react';
import { toast } from '../components/Toast';

export const LoginPage: React.FC = () => {
  const { login, switchDemoRole } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const error = await login(email, password);
    setLoading(false);

    if (error) {
      toast.danger(error);
    } else {
      toast.success('Logged in successfully!');
      navigate('/');
    }
  };

  const handleDemoLogin = (role: 'player' | 'creator' | 'admin') => {
    switchDemoRole(role);
    toast.success(`Welcome to VibePlay! Logged in as Demo ${role.toUpperCase()}.`);
    if (role === 'creator') navigate('/creator');
    else if (role === 'admin') navigate('/admin');
    else navigate('/');
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle} className="animate-slide-up">
        <h2 style={titleStyle}>Welcome back</h2>
        <p style={subtitleStyle}>Log in to VibePlay to play games and publish creations.</p>

        <form onSubmit={handleSubmit} style={formStyle}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={inputWrapperStyle}>
              <Mail size={16} style={inputIconStyle} />
              <input
                type="email"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
              <Link to="/forgot-password" style={forgotStyle}>Forgot password?</Link>
            </div>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={eyeButtonStyle}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div style={footerTextStyle}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--secondary)' }}>Sign up</Link>
        </div>

        {/* Demo Accounts Selector */}
        <div style={demoBoxStyle}>
          <div style={demoTitleStyle}>Demo Accounts</div>
          <p style={demoDescStyle}>Click to instantly log in under these test roles:</p>
          <div style={demoGridStyle}>
            <button onClick={() => handleDemoLogin('player')} style={demoBtnStyle}>
              <Gamepad2 size={14} />
              <span>Demo Player</span>
            </button>
            <button onClick={() => handleDemoLogin('creator')} style={{ ...demoBtnStyle, color: 'var(--success)', borderColor: 'rgba(61,220,151,0.2)', backgroundColor: 'rgba(61,220,151,0.05)' }}>
              <Wrench size={14} />
              <span>Demo Creator</span>
            </button>
            <button onClick={() => handleDemoLogin('admin')} style={{ ...demoBtnStyle, color: 'var(--danger)', borderColor: 'rgba(255,93,115,0.2)', backgroundColor: 'rgba(255,93,115,0.05)' }}>
              <ShieldCheck size={14} />
              <span>Demo Admin</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const getPasswordStrength = () => {
    if (!password) return { label: 'Empty', color: 'var(--text-secondary)', width: '0%' };
    if (password.length < 6) return { label: 'Weak (Too Short)', color: 'var(--danger)', width: '25%' };
    
    let score = 0;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score === 0) return { label: 'Medium', color: 'var(--warning)', width: '50%' };
    if (score <= 2) return { label: 'Strong', color: 'var(--success)', width: '75%' };
    return { label: 'Very Strong', color: '#10B981', width: '100%' };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.danger('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      toast.warning('Password must be at least 6 characters.');
      return;
    }
    if (!agreeTerms) {
      toast.warning('You must agree to the Terms of Service.');
      return;
    }

    setLoading(true);
    const error = await register(username, email, displayName);
    setLoading(false);

    if (error) {
      toast.danger(error);
    } else {
      toast.success('Account created successfully!');
      navigate('/');
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, maxWidth: '440px' }} className="animate-slide-up">
        <h2 style={titleStyle}>Create an account</h2>
        <p style={subtitleStyle}>Join the VibePlay gaming community today.</p>

        <form onSubmit={handleSubmit} style={formStyle}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <div style={inputWrapperStyle}>
              <User size={16} style={inputIconStyle} />
              <input
                type="text"
                required
                placeholder="neon_rider"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <div style={inputWrapperStyle}>
              <User size={16} style={inputIconStyle} />
              <input
                type="text"
                required
                placeholder="Neon Rider"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={inputWrapperStyle}>
              <Mail size={16} style={inputIconStyle} />
              <input
                type="email"
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
            <label className="form-label">Password</label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={eyeButtonStyle}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password strength indicator */}
            {password && (
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                  <span>Password strength:</span>
                  <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                </div>
                <div style={{ height: '4px', width: '100%', backgroundColor: 'var(--bg-surface)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: strength.width, backgroundColor: strength.color, transition: 'width 0.3s' }}></div>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} />
              <input
                type={showPassword ? 'text' : 'password'}
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
            <label className="checkbox-group">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="checkbox-input"
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                I agree to the <a href="#terms" style={{ color: 'var(--secondary)', textDecoration: 'underline' }}>Terms of Service</a> and <a href="#privacy" style={{ color: 'var(--secondary)', textDecoration: 'underline' }}>Privacy Policy</a>.
              </span>
            </label>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={footerTextStyle}>
          Already have an account? <Link to="/login" style={{ color: 'var(--secondary)' }}>Log in</Link>
        </div>
      </div>
    </div>
  );
};

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      toast.success('Reset link dispatched to your inbox!');
    }, 1200);
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle} className="animate-slide-up">
        <h2 style={titleStyle}>Reset Password</h2>
        
        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={successBoxStyle}>
              <Mail size={32} color="var(--success)" />
            </div>
            <p style={{ fontSize: '0.95rem', margin: '1rem 0 1.5rem', lineHeight: 1.6 }}>
              We've dispatched a password reset link to <strong>{email}</strong>. Check your spam folder if you do not receive it within a few minutes.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>Back to Login</Link>
          </div>
        ) : (
          <>
            <p style={subtitleStyle}>Enter your email below and we will send you instructions to reset your password.</p>
            
            <form onSubmit={handleSubmit} style={formStyle}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div style={inputWrapperStyle}>
                  <Mail size={16} style={inputIconStyle} />
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                {loading ? 'Sending link...' : 'Send Reset Link'}
              </button>
            </form>
            
            <div style={footerTextStyle}>
              Remembered password? <Link to="/login" style={{ color: 'var(--secondary)' }}>Log in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 70px - 64px)', // Header and footer spacing
  padding: '3rem 1.5rem',
  backgroundColor: 'var(--bg-main)'
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '400px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  padding: '2rem',
  boxShadow: 'var(--shadow-lg)'
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.75rem',
  fontWeight: 700,
  textAlign: 'center',
  marginBottom: '0.5rem',
  letterSpacing: '-0.02em'
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  textAlign: 'center',
  lineHeight: 1.5,
  marginBottom: '1.5rem'
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const inputWrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center'
};

const inputIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '14px',
  color: 'var(--text-secondary)',
  pointerEvents: 'none'
};

const eyeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: '14px',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center'
};

const forgotStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--secondary)',
  fontWeight: 500
};

const footerTextStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  textAlign: 'center',
  marginTop: '1.5rem'
};

const successBoxStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  backgroundColor: 'rgba(61,220,151,0.1)',
  margin: '0 auto 1rem'
};

const demoBoxStyle: React.CSSProperties = {
  marginTop: '2rem',
  borderTop: '1px solid var(--border-color)',
  paddingTop: '1.5rem'
};

const demoTitleStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  letterSpacing: '0.05em',
  marginBottom: '0.25rem'
};

const demoDescStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginBottom: '1rem'
};

const demoGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '8px'
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
  transition: 'all 0.2s'
};

// Hover managed in JS or CSS
// demoBtnStyle:hover { transform: translateY(-1px); }
