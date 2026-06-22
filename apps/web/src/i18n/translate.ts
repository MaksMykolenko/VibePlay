import { DEFAULT_LOCALE, isSupportedLocale, type Locale, type TranslationParams } from './context';

/**
 * Pure i18n helpers, kept free of React/DOM so they can be unit-tested in the
 * project's node test environment (no jsdom).
 */

/** Replace `{{name}}` tokens; unknown tokens are left visible as `{{name}}`. */
export function interpolate(message: string, params?: TranslationParams): string {
  if (!params) return message;
  return message.replace(/{{(\w+)}}/g, (_, key: string) => String(params[key] ?? `{{${key}}}`));
}

/**
 * Resolve a key for `locale`, falling back to the default locale and finally to
 * the raw key, then interpolate. Mirrors the provider's runtime behavior so the
 * fallback can be tested directly.
 */
export function translate(
  dictionaries: Partial<Record<Locale, Record<string, string>>>,
  locale: Locale,
  key: string,
  params?: TranslationParams,
): string {
  const localized = dictionaries[locale]?.[key];
  const fallback = dictionaries[DEFAULT_LOCALE]?.[key];
  return interpolate(localized ?? fallback ?? key, params);
}

/**
 * Choose the initial locale: a previously stored choice wins; otherwise the
 * first supported browser language; otherwise the default. Browser language is
 * only ever an initial default — once the user picks, the stored value wins.
 */
export function pickInitialLocale(
  stored: string | null,
  navigatorLanguages: readonly string[] = [],
): Locale {
  if (isSupportedLocale(stored)) return stored;
  for (const language of navigatorLanguages) {
    const code = language.toLowerCase().split('-')[0];
    if (isSupportedLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}
