import { describe, expect, it } from 'vitest';
import { en } from './en';
import { uk } from './uk';
import { SUPPORTED_LOCALES, isSupportedLocale } from './context';
import { interpolate, pickInitialLocale, translate } from './translate';

const dictionaries: Record<string, Record<string, string>> = { en, uk };

/** All `{{token}}` names used in a message, as a sorted, de-duplicated list. */
function tokens(message: string): string[] {
  return [...message.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
}

const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX|WIP|PLACEHOLDER|UNTRANSLATED)\b/i;

describe('i18n key parity', () => {
  const enKeys = Object.keys(en);
  const ukKeys = Object.keys(uk);

  it('every English key exists in Ukrainian', () => {
    expect(ukKeys.filter((k) => !(k in en))).toEqual([]);
    const missingInUk = enKeys.filter((k) => !(k in uk));
    expect(missingInUk).toEqual([]);
  });

  it('every Ukrainian key exists in English (no orphans)', () => {
    const orphaned = ukKeys.filter((k) => !(k in en));
    expect(orphaned).toEqual([]);
  });

  it('has the same number of keys in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(dictionaries[locale]).length).toBe(enKeys.length);
    }
  });
});

describe('i18n value quality', () => {
  it('has no empty or whitespace-only values', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const empties = Object.entries(dictionaries[locale])
        .filter(([, value]) => value.trim().length === 0)
        .map(([key]) => `${locale}:${key}`);
      expect(empties).toEqual([]);
    }
  });

  it('has no placeholder/untranslated marker values', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const placeholders = Object.entries(dictionaries[locale])
        .filter(([, value]) => PLACEHOLDER.test(value))
        .map(([key]) => `${locale}:${key}`);
      expect(placeholders).toEqual([]);
    }
  });

  it('uses the same interpolation tokens across locales', () => {
    const mismatches = Object.keys(en).filter(
      (key) =>
        tokens(en[key as keyof typeof en]).join(',') !==
        tokens(uk[key as keyof typeof en]).join(','),
    );
    expect(mismatches).toEqual([]);
  });
});

describe('translate() fallback + interpolation', () => {
  it('returns the localized value when present', () => {
    expect(translate(dictionaries, 'uk', 'common.close')).toBe(uk['common.close']);
  });

  it('falls back to English, then to the raw key, without throwing', () => {
    // A key only ever defined in English still resolves under another locale.
    const anyKey = Object.keys(en)[0];
    expect(translate(dictionaries, 'uk', anyKey)).toBeTruthy();
    // A completely unknown key falls back to the key itself (no crash).
    expect(translate(dictionaries, 'uk', 'totally.unknown.key')).toBe('totally.unknown.key');
  });

  it('interpolates named tokens and preserves unknown ones', () => {
    expect(interpolate('Hi {{name}}, {{count}} games', { name: 'Ann', count: 3 })).toBe(
      'Hi Ann, 3 games',
    );
    expect(interpolate('Missing {{x}}', {})).toBe('Missing {{x}}');
  });
});

describe('pickInitialLocale', () => {
  it('prefers a previously stored supported choice', () => {
    expect(pickInitialLocale('uk', ['en-US'])).toBe('uk');
  });

  it('uses the first supported browser language as the initial default', () => {
    expect(pickInitialLocale(null, ['uk-UA', 'en'])).toBe('uk');
    expect(pickInitialLocale(null, ['fr-FR', 'en-GB'])).toBe('en');
  });

  it('falls back to English for unknown/empty input', () => {
    expect(pickInitialLocale(null, [])).toBe('en');
    expect(pickInitialLocale('zz', ['de'])).toBe('en');
  });

  it('rejects unsupported stored values via isSupportedLocale', () => {
    expect(isSupportedLocale('pl')).toBe(false);
    expect(isSupportedLocale('en')).toBe(true);
  });
});
