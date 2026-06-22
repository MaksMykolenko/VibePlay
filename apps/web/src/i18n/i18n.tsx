import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { en } from './en';
import { uk } from './uk';
import { I18nContext, type Locale, type TranslationParams } from './context';
import { pickInitialLocale, translate } from './translate';

const STORAGE_KEY = 'vibeplay.language';
const dictionaries: Record<Locale, Record<string, string>> = { en, uk };

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  return pickInitialLocale(window.localStorage.getItem(STORAGE_KEY), window.navigator.languages);
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
    (key: string, params?: TranslationParams) => translate(dictionaries, locale, key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
