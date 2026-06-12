import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus, X } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api/errors';
import { toast } from './toastEvents';

/**
 * Beta feedback / bug report widget (spec §38). Renders a small trigger
 * button; the modal posts to /api/feedback. Available to logged-in users.
 */
export const FeedbackModal: React.FC<{ asSidebarItem?: boolean }> = ({ asSidebarItem }) => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<'FEEDBACK' | 'BUG'>('FEEDBACK');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5) {
      toast.warning('Please describe the feedback in a few words.');
      return;
    }
    setBusy(true);
    try {
      await api.submitFeedback({ category, message: message.trim(), page: location.pathname });
      toast.success(
        category === 'BUG' ? 'Bug report sent — thank you!' : 'Feedback sent — thank you!',
      );
      setMessage('');
      setOpen(false);
    } catch (error) {
      toast.danger(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={asSidebarItem ? 'sidebar-link' : 'btn btn-sm'}
        style={asSidebarItem ? undefined : triggerStyle}
        aria-haspopup="dialog"
      >
        <MessageSquarePlus size={asSidebarItem ? 20 : 16} />
        <span style={asSidebarItem ? { marginLeft: '10px', fontWeight: 500 } : undefined}>
          Beta feedback
        </span>
      </button>

      {open && (
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Beta feedback">
          <form onSubmit={submit} style={modalStyle} className="bg-glass animate-slide-up">
            <div style={headerStyle}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Beta feedback</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={closeStyle}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Found a bug or have an idea? It goes straight to the VibePlay team.
            </p>
            <div style={{ display: 'flex', gap: '8px', margin: '0.75rem 0' }}>
              <button
                type="button"
                onClick={() => setCategory('FEEDBACK')}
                style={category === 'FEEDBACK' ? pillActiveStyle : pillStyle}
              >
                Feedback
              </button>
              <button
                type="button"
                onClick={() => setCategory('BUG')}
                style={category === 'BUG' ? pillActiveStyle : pillStyle}
              >
                Bug report
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="form-input"
              style={{ minHeight: '120px', resize: 'vertical', width: '100%' }}
              placeholder={
                category === 'BUG'
                  ? 'What happened? What did you expect? Steps to reproduce…'
                  : 'What should we improve?'
              }
              maxLength={4000}
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
              style={{ marginTop: '0.75rem', width: '100%' }}
            >
              {busy ? 'Sending…' : 'Send to the team'}
            </button>
          </form>
        </div>
      )}
    </>
  );
};

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  border: '1px solid var(--border-color)',
  background: 'transparent',
  color: 'var(--text-secondary)',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
  backgroundColor: 'var(--bg-card)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.25rem',
};

const closeStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '4px',
};

const pillStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '999px',
  fontSize: '0.8rem',
  fontWeight: 600,
  border: '1px solid var(--border-color)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const pillActiveStyle: React.CSSProperties = {
  ...pillStyle,
  border: '1px solid var(--primary)',
  color: 'var(--primary)',
};
