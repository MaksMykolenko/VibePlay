import { describe, expect, it } from 'vitest';
import {
  canShowCta,
  isCtaSuppressed,
  suppressCta,
  markSignupIntent,
  consumeSignupIntent,
  type CtaStorage,
} from './cloudSaveCta';

function fakeStore(): CtaStorage & { _m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => {
      m.set(k, v);
    },
    _m: m,
  };
}

describe('cloud-save CTA gate', () => {
  it('never shows for logged-in users', () => {
    expect(canShowCta(false, { session: fakeStore(), local: fakeStore() })).toBe(false);
  });

  it('shows for guests until dismissed, then respects session + cooldown', () => {
    const session = fakeStore();
    const local = fakeStore();
    expect(canShowCta(true, { session, local })).toBe(true);

    suppressCta({ session, local, now: 1000, cooldownMs: 10_000 });

    // dismissed this session
    expect(isCtaSuppressed({ session, local, now: 2000 })).toBe(true);
    // and (fresh session) still within cooldown
    expect(isCtaSuppressed({ session: fakeStore(), local, now: 5000 })).toBe(true);
    // after the cooldown elapses, a fresh session may show it again
    expect(isCtaSuppressed({ session: fakeStore(), local, now: 20_000 })).toBe(false);
  });
});

describe('signup intent', () => {
  it('is consumable exactly once for the matching game', () => {
    const store = fakeStore();
    markSignupIntent('game-1', store);
    expect(consumeSignupIntent('game-1', store)).toBe(true);
    expect(consumeSignupIntent('game-1', store)).toBe(false); // already consumed
    expect(consumeSignupIntent('other-game', store)).toBe(false);
  });
});
