import React from 'react';
import { Globe, Clock, Sparkles, AlertCircle } from 'lucide-react';

export const CreatorAnalytics: React.FC = () => {
  return (
    <div style={containerStyle} className="animate-fade">
      <h1>Advanced Analytics</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Deep-dive analysis of your audience engagements, retention curves, and performance stats.
      </p>

      {/* Grid */}
      <div style={statsGridStyle}>
        <div style={boxStyle} className="bg-glass">
          <h3 style={boxTitleStyle}>Audience Demographics</h3>
          <div style={demoRowStyle}>
            <Globe size={18} color="var(--secondary)" />
            <div style={{ flex: 1 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}
              >
                <span>North America</span>
                <span>45%</span>
              </div>
              <div style={barBgStyle}>
                <div
                  style={{ ...barFgStyle, width: '45%', backgroundColor: 'var(--secondary)' }}
                ></div>
              </div>
            </div>
          </div>
          <div style={demoRowStyle}>
            <Globe size={18} color="var(--primary)" />
            <div style={{ flex: 1 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}
              >
                <span>Europe</span>
                <span>35%</span>
              </div>
              <div style={barBgStyle}>
                <div
                  style={{ ...barFgStyle, width: '35%', backgroundColor: 'var(--primary)' }}
                ></div>
              </div>
            </div>
          </div>
          <div style={demoRowStyle}>
            <Globe size={18} color="var(--success)" />
            <div style={{ flex: 1 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}
              >
                <span>Asia / Other</span>
                <span>20%</span>
              </div>
              <div style={barBgStyle}>
                <div
                  style={{ ...barFgStyle, width: '20%', backgroundColor: 'var(--success)' }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div style={boxStyle} className="bg-glass">
          <h3 style={boxTitleStyle}>Retention & Sessions</h3>
          <div
            style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '0.5rem' }}
          >
            <Clock size={32} color="var(--warning)" />
            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>4.8m</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Average session duration (desktop)
              </div>
            </div>
          </div>
          <hr
            style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1rem 0' }}
          />
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <Sparkles size={32} color="var(--success)" />
            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>24.2%</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Day-7 player return rate
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={alertBoxStyle} className="bg-glass">
        <AlertCircle size={20} color="var(--secondary)" />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Analytics metrics refresh once every 24 hours. Connect your Google Analytics tags or
          NeoFlux pixels inside Settings to track custom in-game event triggers.
        </span>
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2.5rem',
};

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '2rem',
};

const boxStyle: React.CSSProperties = {
  padding: '2rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
};

const boxTitleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  marginBottom: '0.5rem',
};

const demoRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const barBgStyle: React.CSSProperties = {
  height: '6px',
  width: '100%',
  backgroundColor: 'var(--bg-hover)',
  borderRadius: '3px',
  marginTop: '4px',
  overflow: 'hidden',
};

const barFgStyle: React.CSSProperties = {
  height: '100%',
};

const alertBoxStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  padding: '1rem 1.5rem',
  borderRadius: '8px',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--info-soft)',
  marginTop: '1rem',
};
