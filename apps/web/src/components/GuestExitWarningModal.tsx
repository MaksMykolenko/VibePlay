import React, { useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

/**
 * Guest exit warning modal — shown when an unauthenticated player tries to leave
 * an active game page (in-app navigation or browser back). It explains that
 * guest progress is local-only and offers the conversion paths.
 *
 * Accessibility:
 * - `role="dialog"` + `aria-modal` + labelled/!described by title/body;
 * - focus moves to the safe default ("Keep playing") on open and Tab is trapped
 *   within the dialog;
 * - Escape (and a backdrop click) resolve as "Keep playing" — the safe no-op
 *   that keeps the player on their game.
 *
 * It never renders while gameplay is uninterrupted; the parent only mounts it
 * for an actual leave attempt.
 */
export const GuestExitWarningModal: React.FC<{
  open: boolean;
  onKeepPlaying: () => void;
  onLeaveAnyway: () => void;
  onCreateAccount: () => void;
  onLogIn: () => void;
}> = ({ open, onKeepPlaying, onLeaveAnyway, onCreateAccount, onLogIn }) => {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepPlayingRef = useRef<HTMLButtonElement>(null);

  // Move focus to the safe default when the dialog opens.
  useEffect(() => {
    if (open) keepPlayingRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onKeepPlaying();
      return;
    }
    if (event.key !== 'Tab') return;
    // Minimal focus trap: keep Tab/Shift+Tab cycling inside the dialog.
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="guest-exit-backdrop"
      onMouseDown={(event) => {
        // Only a click on the backdrop itself (not bubbling from the dialog)
        // dismisses as "Keep playing".
        if (event.target === event.currentTarget) onKeepPlaying();
      }}
    >
      <div
        ref={dialogRef}
        className="guest-exit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-exit-title"
        aria-describedby="guest-exit-body"
        onKeyDown={handleKeyDown}
      >
        <div className="guest-exit-modal__icon" aria-hidden="true">
          <AlertCircle size={22} />
        </div>
        <h2 id="guest-exit-title" className="guest-exit-modal__title">
          {t('guestExit.title')}
        </h2>
        <p id="guest-exit-body" className="guest-exit-modal__body">
          {t('guestExit.body')}
        </p>
        <div className="guest-exit-modal__actions">
          <button
            ref={keepPlayingRef}
            type="button"
            className="btn btn-primary"
            onClick={onKeepPlaying}
          >
            {t('guestExit.keepPlaying')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCreateAccount}>
            {t('guestExit.createAccount')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onLogIn}>
            {t('guestExit.logIn')}
          </button>
          <button
            type="button"
            className="btn btn-ghost guest-exit-modal__leave"
            onClick={onLeaveAnyway}
          >
            {t('guestExit.leaveAnyway')}
          </button>
        </div>
      </div>
    </div>
  );
};
