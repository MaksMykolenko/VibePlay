import React from 'react';
import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

export const LanguageSwitcher: React.FC<{ compact?: boolean; className?: string }> = ({
  compact = false,
  className,
}) => {
  const { locale, setLocale, t } = useI18n();

  return (
    <label
      className={`language-switcher ${compact ? 'language-switcher--compact' : ''} ${className ?? ''}`}
    >
      <Languages size={16} aria-hidden="true" />
      {!compact && <span>{t('language.label')}</span>}
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as 'en' | 'uk')}
        aria-label={t('language.label')}
      >
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </label>
  );
};
