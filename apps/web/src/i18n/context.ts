import { createContext } from 'react';

export type Locale = 'en' | 'uk';
export type TranslationParams = Record<string, string | number>;

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
