import React from 'react';
import { Cloud, X } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

/**
 * Soft, dismissible "create a free account" card shown on the Play Page after a
 * guest shows meaningful engagement. It never blocks gameplay — it sits in the
 * corner of the viewport and can always be dismissed ("Continue as guest").
 */
export const CloudSaveCTA: React.FC<{
  isGuest: boolean;
  onCreateAccount: () => void;
  onLogin: () => void;
  onContinueGuest: () => void;
}> = ({ isGuest, onCreateAccount, onLogin, onContinueGuest }) => {
  const { t } = useI18n();
  if (!isGuest) return null;

  return (
    <div
      className="cloud-save-cta"
      role="dialog"
      aria-labelledby="cloud-save-cta-title"
      aria-describedby="cloud-save-cta-body"
    >
      <button
        type="button"
        className="cloud-save-cta__close"
        onClick={onContinueGuest}
        aria-label={t('common.close')}
      >
        <X size={16} />
      </button>
      <div className="cloud-save-cta__icon" aria-hidden="true">
        <Cloud size={20} />
      </div>
      <h3 id="cloud-save-cta-title" className="cloud-save-cta__title">
        {t('cloudSave.ctaTitle')}
      </h3>
      <p id="cloud-save-cta-body" className="cloud-save-cta__body">
        {t('cloudSave.ctaBody')}
      </p>
      <div className="cloud-save-cta__actions cloud-save-cta__actions--stack">
        <button type="button" className="btn btn-primary" onClick={onCreateAccount}>
          {t('cloudSave.createAccount')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onLogin}>
          {t('cloudSave.logIn')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onContinueGuest}>
          {t('cloudSave.continuePlaying')}
        </button>
      </div>
    </div>
  );
};
