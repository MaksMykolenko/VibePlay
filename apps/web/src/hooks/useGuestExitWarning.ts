import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../lib/analytics';
import { withReturnTo } from '../lib/returnTo';
import { markGameAuthIntent } from '../lib/cloudSaveCta';
import type { AnalyticsEventType } from '@vibeplay/shared';
import {
  guestExitWarningParams,
  installGuestExitGuard,
  type GuestExitSource,
} from '../lib/guestExitWarning';

export interface UseGuestExitWarningOptions {
  /**
   * Armed when the warning condition holds: a guest is actively playing on the
   * real play page. The caller computes this (guest + iframe launched + !demo);
   * the hook installs/removes its listeners as this flips.
   */
  active: boolean;
  gameId?: string | null;
  gameSlug?: string | null;
  /** Current play path (e.g. `/play/<slug>`) used for the safe `returnTo`. */
  playPath: string;
  /** Where "Leave anyway" goes for back/refresh-style attempts (no link target). */
  exitFallbackPath: string;
  onAnalyticsEvent?: (
    type: AnalyticsEventType,
    metadata: { navigationSource: GuestExitSource },
  ) => void;
}

export interface GuestExitWarning {
  /** True while the warning modal is open. */
  isOpen: boolean;
  /** "Keep playing" — close the modal and stay on the game. */
  keepPlaying: () => void;
  /** "Leave anyway" — proceed with the originally-intended navigation. */
  leaveAnyway: () => void;
  /** "Create account" — go to /register with a safe internal returnTo. */
  createAccount: () => void;
  /** "Log in" — go to /login with a safe internal returnTo. */
  logIn: () => void;
  /**
   * Programmatic leave attempt (e.g. the in-page Exit button). Returns true when
   * the warning intercepted it (modal shown); false when not armed and the
   * caller should navigate itself.
   */
  requestLeave: (target: string, source?: GuestExitSource) => boolean;
}

interface PendingExit {
  source: GuestExitSource;
  /** Internal path to navigate to on "Leave anyway". */
  target: string;
}

/**
 * Drives the guest exit warning: intercepts leave attempts (in-app links,
 * browser back, programmatic exit, refresh/close) while a guest is actively
 * playing, and exposes the modal's button handlers. All analytics use the
 * allowlisted, non-PII param builder.
 */
export function useGuestExitWarning({
  active,
  gameId,
  gameSlug,
  playPath,
  exitFallbackPath,
  onAnalyticsEvent,
}: UseGuestExitWarningOptions): GuestExitWarning {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingExit | null>(null);

  // Set true once the user has confirmed leaving (or is heading to login/
  // register via a CTA) so the guard stands down for that navigation.
  const leavingRef = useRef(false);

  // Keep the latest analytics identity / opener in refs so the install effect
  // can depend only on `active` and never re-pushes history sentinels.
  const trackParamsRef = useRef({ gameId, gameSlug });

  const track = useCallback(
    (
      name:
        | 'guest_exit_warning_shown'
        | 'guest_exit_warning_keep_playing'
        | 'guest_exit_warning_leave_anyway'
        | 'guest_exit_warning_signup_clicked'
        | 'guest_exit_warning_login_clicked',
      source: GuestExitSource,
    ) => {
      const { gameId: id, gameSlug: slug } = trackParamsRef.current;
      trackEvent(name, guestExitWarningParams({ gameId: id, gameSlug: slug, source }));
      onAnalyticsEvent?.(name, { navigationSource: source });
    },
    [onAnalyticsEvent],
  );

  const openWarning = useCallback(
    (source: GuestExitSource, target: string) => {
      if (leavingRef.current) return;
      // Already open for an attempt — don't stack or re-emit while staying put.
      setPending((current) => {
        if (current) return current;
        track('guest_exit_warning_shown', source);
        return { source, target };
      });
    },
    [track],
  );

  const openWarningRef = useRef(openWarning);

  // Keep mutable refs fresh outside of render (the guard reads them at event
  // time) so a changing game identity never forces a guard re-install / a
  // duplicate history sentinel.
  useEffect(() => {
    trackParamsRef.current = { gameId, gameSlug };
    openWarningRef.current = openWarning;
  });

  // Install/uninstall the navigation guard precisely while armed.
  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined') return;

    const uninstall = installGuestExitGuard(
      {
        windowTarget: window,
        documentTarget: document,
        getHref: () => window.location.href,
        getOrigin: () => window.location.origin,
        getCurrentPath: () =>
          `${window.location.pathname}${window.location.search}${window.location.hash}`,
      },
      {
        onInternalLink: (targetPath) => openWarningRef.current('internal_link', targetPath),
        onBack: () => openWarningRef.current('back_button', exitFallbackPath),
        isLeaving: () => leavingRef.current,
      },
    );
    return uninstall;
    // `exitFallbackPath` is stable for a given play page; intentionally keeping
    // the dependency list minimal so the history sentinel is seeded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const keepPlaying = useCallback(() => {
    setPending((current) => {
      if (current) track('guest_exit_warning_keep_playing', current.source);
      return null;
    });
  }, [track]);

  const leaveAnyway = useCallback(() => {
    setPending((current) => {
      const source = current?.source ?? 'exit_button';
      const target = current?.target ?? exitFallbackPath;
      track('guest_exit_warning_leave_anyway', source);
      leavingRef.current = true;
      navigate(target);
      return null;
    });
  }, [exitFallbackPath, navigate, track]);

  const createAccount = useCallback(() => {
    setPending((current) => {
      track('guest_exit_warning_signup_clicked', current?.source ?? 'exit_button');
      leavingRef.current = true;
      // Remember the game so post-signup we can offer to sync local progress.
      if (gameId) markGameAuthIntent(gameId, 'registration');
      navigate(withReturnTo('/register', playPath));
      return null;
    });
  }, [gameId, navigate, playPath, track]);

  const logIn = useCallback(() => {
    setPending((current) => {
      track('guest_exit_warning_login_clicked', current?.source ?? 'exit_button');
      leavingRef.current = true;
      if (gameId) markGameAuthIntent(gameId, 'login');
      navigate(withReturnTo('/login', playPath));
      return null;
    });
  }, [gameId, navigate, playPath, track]);

  const requestLeave = useCallback(
    (target: string, source: GuestExitSource = 'exit_button'): boolean => {
      if (!active || leavingRef.current) return false;
      openWarning(source, target);
      return true;
    },
    [active, openWarning],
  );

  return {
    isOpen: pending !== null,
    keepPlaying,
    leaveAnyway,
    createAccount,
    logIn,
    requestLeave,
  };
}
