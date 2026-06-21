import React from 'react';
import { CloudUpload, X } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

/**
 * Guest-save transfer prompt (Phase 4), shown after a player logs in / registers
 * and returns to a game for which a local (device) save exists.
 *
 * Two shapes:
 * - no cloud save yet  → offer to sync the local save up;
 * - a cloud save also exists (conflict) → offer a safe three-way choice.
 *
 * It never deletes the local save; "Keep local only" simply dismisses.
 */
export const CloudSaveSyncPrompt: React.FC<{
  gameTitle: string;
  /** True when a cloud save already exists → show the conflict choice. */
  hasCloud: boolean;
  busy?: boolean;
  /** Upload this device's local save (sync mode) / replace cloud (conflict mode). */
  onSync: () => void;
  /** Conflict mode only: keep the existing cloud save, ignore local. */
  onKeepCloud?: () => void;
  /** Dismiss without changing anything; local save is left untouched. */
  onKeepLocal: () => void;
}> = ({ gameTitle, hasCloud, busy = false, onSync, onKeepCloud, onKeepLocal }) => {
  const { t } = useI18n();
  return (
    <div
      className="cloud-save-sync"
      role="dialog"
      aria-labelledby="cloud-save-sync-title"
      aria-describedby="cloud-save-sync-body"
    >
      <button
        type="button"
        className="cloud-save-cta__close"
        onClick={onKeepLocal}
        aria-label={t('common.close')}
      >
        <X size={16} />
      </button>
      <div className="cloud-save-cta__icon" aria-hidden="true">
        <CloudUpload size={20} />
      </div>
      <h3 id="cloud-save-sync-title" className="cloud-save-cta__title">
        {t(hasCloud ? 'cloudSave.conflictTitle' : 'cloudSave.syncTitle')}
      </h3>
      <p id="cloud-save-sync-body" className="cloud-save-cta__body">
        {t(hasCloud ? 'cloudSave.conflictBody' : 'cloudSave.syncBody', { game: gameTitle })}
      </p>
      <div className="cloud-save-cta__actions cloud-save-cta__actions--stack">
        {hasCloud ? (
          <>
            <button type="button" className="btn btn-primary" onClick={onKeepCloud} disabled={busy}>
              {t('cloudSave.keepCloud')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onSync} disabled={busy}>
              {t('cloudSave.replaceCloud')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onKeepLocal} disabled={busy}>
              {t('cloudSave.keepLocal')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onSync} disabled={busy}>
              {t('cloudSave.syncProgress')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onKeepLocal} disabled={busy}>
              {t('cloudSave.keepLocal')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
