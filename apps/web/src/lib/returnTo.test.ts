import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo, withReturnTo } from './returnTo';

describe('sanitizeReturnTo', () => {
  it('keeps internal absolute paths (incl. query strings)', () => {
    expect(sanitizeReturnTo('/play/cool-game')).toBe('/play/cool-game');
    expect(sanitizeReturnTo('/games?cat=arcade')).toBe('/games?cat=arcade');
  });

  it('rejects off-site, protocol-relative, scheme, and relative targets', () => {
    expect(sanitizeReturnTo('//evil.com')).toBe('/');
    expect(sanitizeReturnTo('https://evil.com')).toBe('/');
    expect(sanitizeReturnTo('/\\evil.com')).toBe('/');
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/');
    expect(sanitizeReturnTo('relative/path')).toBe('/');
    expect(sanitizeReturnTo(null)).toBe('/');
    expect(sanitizeReturnTo(undefined)).toBe('/');
  });
});

describe('withReturnTo', () => {
  it('appends a sanitized returnTo and omits it when it resolves to "/"', () => {
    expect(withReturnTo('/register', '/play/g')).toBe('/register?returnTo=%2Fplay%2Fg');
    expect(withReturnTo('/login', '/')).toBe('/login');
    expect(withReturnTo('/login', '//evil.com')).toBe('/login');
    expect(withReturnTo('/x?a=1', '/play/g')).toBe('/x?a=1&returnTo=%2Fplay%2Fg');
  });
});
