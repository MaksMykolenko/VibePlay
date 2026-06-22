import type { Locale, TranslationParams } from '../i18n/context';

type Translate = (key: string, params?: TranslationParams) => string;

/**
 * Locale-aware "time ago" string. Uses translated, pluralization-friendly units
 * for recent times and falls back to a locale-formatted date for older ones.
 */
export function formatRelativeTime(dateString: string, t: Translate, locale: Locale): string {
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('time.daysAgo', { count: days });
  return date.toLocaleDateString(locale);
}

/** Locale-aware absolute date (e.g. for "joined", "filed on"). */
export function formatDate(dateString: string, locale: Locale): string {
  return new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Locale-aware integer formatting (thousands separators for play/like counts). */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}
