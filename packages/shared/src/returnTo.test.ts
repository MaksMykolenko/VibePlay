import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo } from './returnTo.js';

describe('sanitizeReturnTo', () => {
  it('accepts internal paths with queries and fragments', () => {
    expect(sanitizeReturnTo('/play/cool-game?from=cta#game')).toBe('/play/cool-game?from=cta#game');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%5cevil.example',
    '/%2f%2fevil.example',
    'relative/path',
    'javascript:alert(1)',
    '/play/%E0%A4%A',
  ])('rejects unsafe target %s', (target) => {
    expect(sanitizeReturnTo(target)).toBe('/');
  });
});
