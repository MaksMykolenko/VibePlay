import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

export const LanguageSwitcher: React.FC<{
  compact?: boolean;
  variant?: 'compact' | 'full';
  className?: string;
}> = ({ compact = false, variant, className }) => {
  const { locale, setLocale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeVariant = variant ?? (compact ? 'compact' : 'full');

  // Handle click outside to close dropdown
  useEffect(() => {
    if (activeVariant !== 'compact') return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeVariant]);

  // Handle escape key to close dropdown
  useEffect(() => {
    if (activeVariant !== 'compact') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeVariant]);

  const toggleDropdown = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (nextLocale: 'en' | 'uk') => {
    setLocale(nextLocale);
    setIsOpen(false);
  };

  if (activeVariant === 'compact') {
    return (
      <div
        ref={dropdownRef}
        className={`language-switcher-compact ${className ?? ''}`}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        <button
          type="button"
          onClick={toggleDropdown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={t('language.label')}
          className="language-switcher-pill-btn"
        >
          <Globe size={14} className="globe-icon" aria-hidden="true" />
          <span className="lang-code-text">{locale.toUpperCase()}</span>
          <ChevronDown
            size={12}
            className={`chevron-icon ${isOpen ? 'rotated' : ''}`}
            aria-hidden="true"
          />
        </button>

        {isOpen && (
          <ul
            className="language-switcher-dropdown bg-glass animate-fade"
            role="listbox"
            aria-label={t('language.label')}
          >
            <li role="none">
              <button
                type="button"
                role="option"
                aria-selected={locale === 'en'}
                onClick={() => handleSelect('en')}
                className={`dropdown-option-btn ${locale === 'en' ? 'active' : ''}`}
              >
                <span>English</span>
                {locale === 'en' && <Check size={14} className="check-icon" />}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="option"
                aria-selected={locale === 'uk'}
                onClick={() => handleSelect('uk')}
                className={`dropdown-option-btn ${locale === 'uk' ? 'active' : ''}`}
              >
                <span>Українська</span>
                {locale === 'uk' && <Check size={14} className="check-icon" />}
              </button>
            </li>
          </ul>
        )}
      </div>
    );
  }

  // Full Variant: Segmented Control
  return (
    <div className={`language-switcher-full ${className ?? ''}`}>
      <span className="language-switcher-label">{t('language.label')}</span>
      <div className="language-switcher-segmented">
        <button
          type="button"
          onClick={() => setLocale('en')}
          className={`segmented-option-btn ${locale === 'en' ? 'active' : ''}`}
          aria-pressed={locale === 'en'}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => setLocale('uk')}
          className={`segmented-option-btn ${locale === 'uk' ? 'active' : ''}`}
          aria-pressed={locale === 'uk'}
        >
          Українська
        </button>
      </div>
    </div>
  );
};
