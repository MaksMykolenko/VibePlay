import { describe, expect, it, vi } from 'vitest';
import {
  GUEST_EXIT_CTA_LOCATION,
  guestExitWarningParams,
  installGuestExitGuard,
  resolveInternalNavTarget,
  shouldArmGuestExitWarning,
  type GuestExitGuardEnv,
} from './guestExitWarning';
import { sanitizeEventParams } from './analytics';
import { sanitizeReturnTo, withReturnTo } from './returnTo';

describe('shouldArmGuestExitWarning', () => {
  it('arms for a guest who is actively playing', () => {
    expect(shouldArmGuestExitWarning({ isPlayActive: true, isLoggedIn: false })).toBe(true);
  });

  it('never arms for a logged-in player', () => {
    expect(shouldArmGuestExitWarning({ isPlayActive: true, isLoggedIn: true })).toBe(false);
  });

  it('does not arm before play is active', () => {
    expect(shouldArmGuestExitWarning({ isPlayActive: false, isLoggedIn: false })).toBe(false);
  });
});

describe('resolveInternalNavTarget', () => {
  const ctx = { origin: 'https://vibeplay.test', currentPath: '/play/fat-dima-simulator' };

  it('returns the internal path for a same-origin link to another route', () => {
    expect(
      resolveInternalNavTarget({ url: 'https://vibeplay.test/games?sort=trending' }, ctx),
    ).toBe('/games?sort=trending');
  });

  it('never intercepts external origins', () => {
    expect(resolveInternalNavTarget({ url: 'https://evil.example/phish' }, ctx)).toBeNull();
  });

  it('ignores new-tab and modified clicks, downloads, and prevented events', () => {
    expect(
      resolveInternalNavTarget({ url: 'https://vibeplay.test/games', target: '_blank' }, ctx),
    ).toBeNull();
    expect(
      resolveInternalNavTarget(
        { url: 'https://vibeplay.test/games', hasModifierOrNonPrimary: true },
        ctx,
      ),
    ).toBeNull();
    expect(
      resolveInternalNavTarget({ url: 'https://vibeplay.test/file.zip', isDownload: true }, ctx),
    ).toBeNull();
    expect(
      resolveInternalNavTarget({ url: 'https://vibeplay.test/games', defaultPrevented: true }, ctx),
    ).toBeNull();
  });

  it('does not treat the current page (or an empty href) as a navigation', () => {
    expect(
      resolveInternalNavTarget({ url: 'https://vibeplay.test/play/fat-dima-simulator' }, ctx),
    ).toBeNull();
    expect(resolveInternalNavTarget({ url: null }, ctx)).toBeNull();
  });
});

describe('guestExitWarningParams', () => {
  it('emits only allowlisted, non-PII fields with logged_in false', () => {
    const params = guestExitWarningParams({
      gameId: 'game-1',
      gameSlug: 'fat-dima-simulator',
      source: 'internal_link',
    });

    expect(params).toEqual({
      game_id: 'game-1',
      game_slug: 'fat-dima-simulator',
      source: 'internal_link',
      cta_location: GUEST_EXIT_CTA_LOCATION,
      logged_in: false,
    });
    // Nothing is dropped by the analytics allowlist → no private/save data leaked.
    expect(sanitizeEventParams(params)).toEqual(params);
    expect(Object.keys(params).sort()).toEqual([
      'cta_location',
      'game_id',
      'game_slug',
      'logged_in',
      'source',
    ]);
  });

  it('coerces missing ids to empty strings (never undefined/PII)', () => {
    const params = guestExitWarningParams({ source: 'back_button' });
    expect(params.game_id).toBe('');
    expect(params.game_slug).toBe('');
  });
});

describe('returnTo safety for the warning CTAs', () => {
  it('preserves a safe internal play path', () => {
    expect(withReturnTo('/register', '/play/fat-dima-simulator')).toBe(
      '/register?returnTo=%2Fplay%2Ffat-dima-simulator',
    );
    expect(withReturnTo('/login', '/play/fat-dima-simulator')).toBe(
      '/login?returnTo=%2Fplay%2Ffat-dima-simulator',
    );
  });

  it('rejects external/unsafe returnTo values', () => {
    expect(sanitizeReturnTo('https://evil.example/phish')).toBe('/');
    expect(sanitizeReturnTo('//evil.example')).toBe('/');
    // The CTA target must never carry an external destination.
    const register = withReturnTo('/register', 'https://evil.example/phish');
    expect(register).toBe('/register');
    expect(register).not.toContain('evil');
  });
});

// --- navigation guard wiring (injected fakes; no DOM required) --------------

interface StoredListener {
  fn: EventListenerOrEventListenerObject;
  capture: boolean;
}

function captureFlag(options?: boolean | AddEventListenerOptions | EventListenerOptions): boolean {
  return typeof options === 'boolean' ? options : Boolean(options?.capture);
}

function fakeTarget() {
  const listeners = new Map<string, StoredListener[]>();
  return {
    listeners,
    addEventListener(
      type: string,
      fn: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void {
      const arr = listeners.get(type) ?? [];
      arr.push({ fn, capture: captureFlag(options) });
      listeners.set(type, arr);
    },
    removeEventListener(
      type: string,
      fn: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ): void {
      const arr = listeners.get(type) ?? [];
      const cap = captureFlag(options);
      const idx = arr.findIndex((l) => l.fn === fn && l.capture === cap);
      if (idx >= 0) arr.splice(idx, 1);
      listeners.set(type, arr);
    },
  };
}

function listenerFor(
  target: ReturnType<typeof fakeTarget>,
  type: string,
): ((event: unknown) => void) | undefined {
  const fn = target.listeners.get(type)?.[0]?.fn;
  return fn as ((event: unknown) => void) | undefined;
}

function setup() {
  const windowTarget = Object.assign(fakeTarget(), { history: { pushState: vi.fn() } });
  const documentTarget = fakeTarget();
  const handlers = {
    onInternalLink: vi.fn(),
    onBack: vi.fn(),
    leaving: false,
    isLeaving(): boolean {
      return this.leaving;
    },
  };
  const env: GuestExitGuardEnv = {
    windowTarget,
    documentTarget,
    getHref: () => 'https://vibeplay.test/play/fat-dima-simulator',
    getOrigin: () => 'https://vibeplay.test',
    getCurrentPath: () => '/play/fat-dima-simulator',
  };
  return { env, windowTarget, documentTarget, handlers };
}

describe('installGuestExitGuard', () => {
  it('attaches beforeunload/popstate/click, seeds a sentinel, and cleans up', () => {
    const { env, windowTarget, documentTarget, handlers } = setup();

    const uninstall = installGuestExitGuard(env, handlers);

    // Sentinel pushed once so the first Back press is catchable.
    expect(windowTarget.history.pushState).toHaveBeenCalledTimes(1);
    expect(windowTarget.listeners.get('beforeunload')).toHaveLength(1);
    expect(windowTarget.listeners.get('popstate')).toHaveLength(1);
    expect(documentTarget.listeners.get('click')).toHaveLength(1);
    expect(documentTarget.listeners.get('click')?.[0]?.capture).toBe(true);

    uninstall();
    expect(windowTarget.listeners.get('beforeunload')).toHaveLength(0);
    expect(windowTarget.listeners.get('popstate')).toHaveLength(0);
    expect(documentTarget.listeners.get('click')).toHaveLength(0);
  });

  it('blocks unload while armed and stands down once the user is leaving', () => {
    const { env, windowTarget, handlers } = setup();
    installGuestExitGuard(env, handlers);
    const beforeUnload = listenerFor(windowTarget, 'beforeunload');
    expect(beforeUnload).toBeTypeOf('function');

    const armed = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    beforeUnload?.(armed);
    expect(armed.preventDefault).toHaveBeenCalledTimes(1);
    expect(armed.returnValue).toBe('');

    handlers.leaving = true;
    const leaving = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    beforeUnload?.(leaving);
    expect(leaving.preventDefault).not.toHaveBeenCalled();
  });

  it('cancels browser back by re-pushing the sentinel and surfacing the modal', () => {
    const { env, windowTarget, handlers } = setup();
    installGuestExitGuard(env, handlers);
    const onPopState = listenerFor(windowTarget, 'popstate');
    const pushesAfterInstall = windowTarget.history.pushState.mock.calls.length;

    onPopState?.({});
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
    expect(windowTarget.history.pushState.mock.calls.length).toBe(pushesAfterInstall + 1);

    // After the user confirms leaving, popstate is allowed through (no re-trap).
    handlers.leaving = true;
    onPopState?.({});
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });
});
