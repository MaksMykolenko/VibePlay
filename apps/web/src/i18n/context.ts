import { createContext } from 'react';

/**
 * Locales the UI ships with. To add a language (e.g. Polish):
 *   1. add its code here;
 *   2. add its autonym to LOCALE_LABELS below;
 *   3. create `<code>.ts` mirroring `en.ts` and register it in `i18n.tsx`.
 * The type system then enforces full key parity for the new dictionary.
 */
export const SUPPORTED_LOCALES = ['en', 'uk'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Autonyms — each language's name written in that language. These are shown in
 * the language switcher and are intentionally NOT translated per active locale.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  uk: 'Українська',
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export type TranslationParams = Record<string, string | number>;

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
