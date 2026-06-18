import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

/**
 * Dismissible onboarding card (spec §38). Dismissal is a pure UI preference,
 * stored in localStorage (never auth/data state).
 */
export const OnboardingCard: React.FC<{
  storageKey: string;
  title: string;
  steps: string[];
  footer?: React.ReactNode;
}> = ({ storageKey, title, steps, footer }) => {
  const { t } = useI18n();
  const key = `vibeplay_onboarding_${storageKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === 'dismissed';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(key, 'dismissed');
    } catch {
      // best-effort; the card simply reappears next visit
    }
  };

  return (
    <section style={cardStyle} className="bg-glass animate-fade" aria-label={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 style={titleStyle}>{title}</h2>
        <button
          type="button"
          onClick={dismiss}
          style={closeStyle}
          aria-label={t('common.dismissOnboarding')}
        >
          <X size={16} />
        </button>
      </div>
      <ol style={listStyle}>
        {steps.map((step, index) => (
          <li key={index} style={stepStyle}>
            <span style={numStyle}>{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {footer && <div style={{ marginTop: '0.75rem' }}>{footer}</div>}
    </section>
  );
};

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  borderRadius: '14px',
  padding: '1.25rem 1.5rem',
  marginBottom: '1.5rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  marginBottom: '0.5rem',
};

const closeStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '4px',
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

const stepStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
};

const numStyle: React.CSSProperties = {
  minWidth: '22px',
  height: '22px',
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.7rem',
  fontWeight: 800,
  color: 'var(--primary)',
  border: '1px solid var(--primary)',
};
