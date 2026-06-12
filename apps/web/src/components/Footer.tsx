import React from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer style={footerStyle}>
      <div style={footerContainerStyle} className="container">
        
        {/* Brand Info */}
        <div style={brandColStyle}>
          <Link to="/" style={logoContainerStyle}>
            <div style={logoIconStyle}>
              <span style={logoTextVStyle}>V</span>
              <div style={logoPlayStyle}></div>
            </div>
            <span style={logoTextStyle}>Vibe<span style={{ color: 'var(--primary)' }}>Play</span></span>
          </Link>
          <p style={taglineStyle}>
            Discover browser games created by independent developers and AI-powered builders. No downloads. Just play.
          </p>
          <div style={socialsStyle}>
            <a href="https://discord.gg/vibeplay" target="_blank" rel="noreferrer" className="social-icon" style={socialIconStyle} aria-label="Discord">
              <MessageSquare size={18} />
            </a>
            <a href="https://github.com/vibeplay" target="_blank" rel="noreferrer" className="social-icon" style={socialIconStyle} aria-label="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-github"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.2 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
            </a>
          </div>
        </div>

        {/* Links Grid */}
        <div style={linksGridStyle}>
          
          <div style={linkColStyle}>
            <h4 style={colTitleStyle}>Product</h4>
            <Link to="/games" className="footer-link" style={footerLinkStyle}>Discover Games</Link>
            <Link to="/games?sort=newest" className="footer-link" style={footerLinkStyle}>New Releases</Link>
            <Link to="/games?sort=trending" className="footer-link" style={footerLinkStyle}>Trending Now</Link>
            <Link to="/games?ai=true" className="footer-link" style={footerLinkStyle}>AI-Assisted Games</Link>
          </div>

          <div style={linkColStyle}>
            <h4 style={colTitleStyle}>Creators</h4>
            <Link to="/creator" className="footer-link" style={footerLinkStyle}>Creator Hub</Link>
            <Link to="/creator/publish" className="footer-link" style={footerLinkStyle}>Publish Game</Link>
            <a href="#guidelines" className="footer-link" style={footerLinkStyle}>Submission Rules</a>
            <a href="#sandbox" className="footer-link" style={footerLinkStyle}>Secure Sandbox API</a>
          </div>

          <div style={linkColStyle}>
            <h4 style={colTitleStyle}>Legal</h4>
            <a href="#terms" className="footer-link" style={footerLinkStyle}>Terms of Service</a>
            <a href="#privacy" className="footer-link" style={footerLinkStyle}>Privacy Policy</a>
            <a href="#content-guidelines" className="footer-link" style={footerLinkStyle}>Content Guidelines</a>
            <a href="#contact" className="footer-link" style={footerLinkStyle}>Contact Us</a>
          </div>

        </div>

      </div>

      <div style={bottomBarStyle} className="container">
        <div style={copyrightStyle}>
          &copy; {new Date().getFullYear()} VibePlay. All rights reserved.
        </div>
        <div style={developerCreditStyle}>
          Built by <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>NeoFlux</span>
        </div>
      </div>
    </footer>
  );
};

// Styles
const footerStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  borderTop: '1px solid var(--border-color)',
  paddingTop: '4rem',
  paddingBottom: '2rem',
  marginTop: 'auto'
};

const footerContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '3rem',
  paddingBottom: '3rem',
  borderBottom: '1px solid var(--border-color)'
};

const brandColStyle: React.CSSProperties = {
  flex: '1 1 300px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const logoContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem'
};

const logoIconStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '6px',
  background: 'var(--gradient)',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const logoTextVStyle: React.CSSProperties = {
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '0.95rem',
  fontFamily: 'var(--font-display)',
  zIndex: 2,
  transform: 'translateX(-2px)'
};

const logoPlayStyle: React.CSSProperties = {
  width: '0',
  height: '0',
  borderTop: '4px solid transparent',
  borderBottom: '4px solid transparent',
  borderLeft: '7px solid #fff',
  position: 'absolute',
  right: '7px',
  top: '10px',
  zIndex: 1
};

const logoTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.2rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  letterSpacing: '-0.02em'
};

const taglineStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
  maxWidth: '320px'
};

const socialsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  marginTop: '0.5rem'
};

const socialIconStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: 'var(--bg-card)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-color)',
  transition: 'all 0.2s'
};

// Hover managed in CSS
// socialIconStyle:hover { color: var(--text-primary); border-color: var(--secondary); background-color: var(--bg-hover); }

const linksGridStyle: React.CSSProperties = {
  flex: '2 1 400px',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '2rem'
};

const linkColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem'
};

const colTitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-primary)',
  marginBottom: '0.5rem'
};

const footerLinkStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  transition: 'color 0.2s'
};

// Hover in CSS
// footerLinkStyle:hover { color: var(--text-primary); }

const bottomBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: '1.5rem',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  flexWrap: 'wrap',
  gap: '1rem'
};

const copyrightStyle: React.CSSProperties = {};

const developerCreditStyle: React.CSSProperties = {};
