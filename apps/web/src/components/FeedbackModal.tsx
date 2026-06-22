import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus, X } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api/errors';
import { toast } from './toastEvents';
import { useI18n } from '../i18n/useI18n';

/**
 * Beta feedback / bug report widget (spec §38). Renders a small trigger
 * button; the modal posts to /api/feedback. Available to logged-in users.
 */
export const FeedbackModal: React.FC<{ asSidebarItem?: boolean; collapsed?: boolean }> = ({
  asSidebarItem,
  collapsed,
}) => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<'FEEDBACK' | 'BUG'>('FEEDBACK');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const { t } = useI18n();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5) {
      toast.warning(t('feedback.tooShort'));
      return;
    }
    setBusy(true);
    try {
      await api.submitFeedback({ category, message: message.trim(), page: location.pathname });
      toast.success(t(category === 'BUG' ? 'feedback.bugSent' : 'feedback.sent'));
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
        data-tooltip={collapsed ? t('feedback.title') : undefined}
        aria-haspopup="dialog"
      >
        <MessageSquarePlus size={asSidebarItem ? 20 : 16} />
        {!collapsed && asSidebarItem && (
          <span style={{ marginLeft: '10px', fontWeight: 500 }}>{t('feedback.shortTitle')}</span>
        )}
      </button>

      {open && (
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-label={t('feedback.title')}>
          <form onSubmit={submit} style={modalStyle} className="bg-glass animate-slide-up">
            <div style={headerStyle}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t('feedback.title')}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={closeStyle}
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {t('feedback.description')}
            </p>
            <div style={{ display: 'flex', gap: '8px', margin: '0.75rem 0' }}>
              <button
                type="button"
                onClick={() => setCategory('FEEDBACK')}
                style={category === 'FEEDBACK' ? pillActiveStyle : pillStyle}
              >
                {t('feedback.feedback')}
              </button>
              <button
                type="button"
                onClick={() => setCategory('BUG')}
                style={category === 'BUG' ? pillActiveStyle : pillStyle}
              >
                {t('feedback.bug')}
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="form-input"
              style={{ minHeight: '120px', resize: 'vertical', width: '100%' }}
              placeholder={
                category === 'BUG'
                  ? t('feedback.bugPlaceholder')
                  : t('feedback.feedbackPlaceholder')
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
              {t(busy ? 'feedback.sending' : 'feedback.send')}
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
  border: 'none',
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
  zIndex: 'var(--z-modal)',
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
