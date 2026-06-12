import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashToken,
  safeEqual,
  signExpiringValue,
  verifyExpiringValue,
  verifyPassword,
} from './crypto.js';

describe('crypto helpers', () => {
  it('hashes opaque tokens deterministically without storing the raw token', () => {
    const hash = hashToken('secret-token', 'session-secret');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('secret-token');
    expect(hashToken('secret-token', 'session-secret')).toBe(hash);
  });

  it('compares equal strings and rejects different lengths', () => {
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'different')).toBe(false);
  });

  it('signs values with expiry and rejects tampering or expiry', () => {
    const token = signExpiringValue('version-1', 2_000, 'preview-secret');
    expect(verifyExpiringValue('version-1', token, 'preview-secret', 1_999)).toBe(true);
    expect(verifyExpiringValue('version-2', token, 'preview-secret', 1_999)).toBe(false);
    expect(verifyExpiringValue('version-1', token, 'preview-secret', 2_001)).toBe(false);
  });

  it('uses argon2id password hashes with a server-side pepper', async () => {
    const hash = await hashPassword('correct horse battery staple', 'pepper-value');
    expect(hash).toContain('$argon2id$');
    await expect(
      verifyPassword(hash, 'correct horse battery staple', 'pepper-value'),
    ).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong password', 'pepper-value')).resolves.toBe(false);
  });
});
