import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { en } from './en';
import { uk } from './uk';
import { I18nContext, type Locale, type TranslationParams } from './context';

const STORAGE_KEY = 'vibeplay.language';
const dictionaries: Record<Locale, Record<string, string>> = { en, uk };

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'uk') return stored;
  return navigator.languages.some((language) => language.toLowerCase().startsWith('uk'))
    ? 'uk'
    : 'en';
}

function interpolate(message: string, params?: TranslationParams): string {
  if (!params) return message;
  return message.replace(/{{(\w+)}}/g, (_, key: string) => String(params[key] ?? `{{${key}}}`));
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    localStorage.setItem(STORAGE_KEY, nextLocale);
    setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, params?: TranslationParams) =>
      interpolate(dictionaries[locale][key] ?? dictionaries.en[key] ?? key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
