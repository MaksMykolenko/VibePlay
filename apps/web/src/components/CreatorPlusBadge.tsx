import { Crown } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

export function CreatorPlusBadge() {
  const { t } = useI18n();
  return (
    <span className="creator-plus-badge">
      <Crown size={12} aria-hidden="true" />
      {t('billing.creatorPlus')}
    </span>
  );
}
