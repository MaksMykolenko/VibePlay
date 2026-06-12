import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div style={containerStyle}>
      <div style={iconBoxStyle}>
        <AlertCircle size={36} color="var(--danger)" />
      </div>
      <h1 style={titleStyle}>404 — Page Glitched</h1>
      <p style={descStyle}>
        The coordinates you requested do not exist or have been archived.
      </p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
        Back to Safety (Home)
      </Link>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 140px)',
  textAlign: 'center',
  padding: '2rem',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-primary)'
};

const iconBoxStyle: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  backgroundColor: 'rgba(255, 93, 115, 0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '1.5rem'
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.02em'
};

const descStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  color: 'var(--text-secondary)',
  marginTop: '0.5rem',
  maxWidth: '300px',
  lineHeight: 1.5
};
