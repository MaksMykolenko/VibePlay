/**
 * Guest exit warning — pure decision logic and a DOM-agnostic navigation guard.
 *
 * Goal (spec): when an unauthenticated player is actively on a game play page,
 * warn them — before they leave — that guest progress is local-only and may be
 * lost. The warning must never block gameplay; it only reacts to a *leave*
 * attempt (in-app navigation, browser back, refresh, or tab close).
 *
 * Everything here is intentionally side-effect free and dependency-injected so
 * it is unit-testable in the project's node (no-DOM) test environment. The thin
 * React wiring lives in `hooks/useGuestExitWarning.ts`.
 */

/** GA4 `cta_location` for every guest-exit-warning event (allowlisted value). */
export const GUEST_EXIT_CTA_LOCATION = 'guest_exit_warning';

/** Where a leave attempt originated — used only as safe analytics `source`. */
export type GuestExitSource = 'internal_link' | 'back_button' | 'exit_button' | 'beforeunload';

// --- arming decision -------------------------------------------------------

export interface GuestExitArmInput {
  /** The game has launched far enough that progress could plausibly exist. */
  isPlayActive: boolean;
  /** True when a real account is signed in. */
  isLoggedIn: boolean;
}

/**
 * The warning is armed only for a guest who is actively playing. Logged-in
 * users (cloud saves) and not-yet-active pages are never warned. Route/demo
 * gating is the caller's responsibility (the hook is only mounted on the real
 * play page).
 */
export function shouldArmGuestExitWarning({
  isPlayActive,
  isLoggedIn,
}: GuestExitArmInput): boolean {
  return isPlayActive && !isLoggedIn;
}

// --- internal-link resolution ----------------------------------------------

export interface AnchorNavCandidate {
  /** Absolute URL the anchor points at (e.g. `anchor.href`), or null/empty. */
  url: string | null | undefined;
  /** Anchor `target` attribute (e.g. "_blank"). */
  target?: string | null;
  /** True when the anchor carries a `download` attribute. */
  isDownload?: boolean;
  /** Modifier key held or a non-primary mouse button (open-in-new-tab intents). */
  hasModifierOrNonPrimary?: boolean;
  /** True when something earlier already handled/cancelled the event. */
  defaultPrevented?: boolean;
}

export interface InternalNavContext {
  /** Current origin (`location.origin`). External targets are never intercepted. */
  origin: string;
  /** Current in-app path (`pathname + search + hash`) we are guarding. */
  currentPath: string;
}

/**
 * Decide whether activating an anchor is an in-app navigation we should
 * intercept, returning the internal target path — or null to let the browser
 * proceed untouched (external links, new-tab intents, downloads, same page…).
 *
 * External `returnTo`/navigation is never produced here: a different origin
 * always returns null.
 */
export function resolveInternalNavTarget(
  candidate: AnchorNavCandidate,
  ctx: InternalNavContext,
): string | null {
  if (!candidate.url) return null;
  if (candidate.defaultPrevented) return null;
  if (candidate.hasModifierOrNonPrimary) return null;
  if (candidate.isDownload) return null;
  if (candidate.target && candidate.target !== '_self') return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate.url, ctx.origin);
  } catch {
    return null;
  }
  // Only ever guard same-origin (internal) navigations.
  if (parsed.origin !== ctx.origin) return null;

  const targetPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  // Anchors that resolve to the page we're already on are not a real exit.
  if (targetPath === ctx.currentPath) return null;
  return targetPath;
}

// --- analytics params (allowlisted) ----------------------------------------

export interface GuestExitAnalyticsInput {
  gameId?: string | null;
  gameSlug?: string | null;
  source: GuestExitSource | string;
}

export interface GuestExitAnalyticsParams {
  game_id: string;
  game_slug: string;
  source: string;
  cta_location: string;
  logged_in: boolean;
}

/**
 * Build the GA4 params for a guest-exit event using ONLY allowlisted, non-PII
 * fields. By construction this never includes email, username, tokens, session
 * ids, save data, object keys, raw errors, or full URLs. `logged_in` is always
 * false because the warning only fires for guests.
 */
export function guestExitWarningParams(input: GuestExitAnalyticsInput): GuestExitAnalyticsParams {
  return {
    game_id: input.gameId ?? '',
    game_slug: input.gameSlug ?? '',
    source: input.source,
    cta_location: GUEST_EXIT_CTA_LOCATION,
    logged_in: false,
  };
}

// --- navigation guard (injectable DOM wiring) ------------------------------

interface ListenerTarget {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export interface GuestExitGuardEnv {
  /** Window-like target for `beforeunload` / `popstate` + history sentinel. */
  windowTarget: ListenerTarget & {
    history: { pushState(data: unknown, unused: string, url?: string | null): void };
  };
  /** Document-like target for capture-phase anchor-click interception. */
  documentTarget: ListenerTarget;
  /** Current full href (used for the history sentinel; URL stays unchanged). */
  getHref(): string;
  /** Current origin, for the internal-nav resolver. */
  getOrigin(): string;
  /** Current in-app path, for the internal-nav resolver. */
  getCurrentPath(): string;
}

export interface GuestExitGuardHandlers {
  /** An internal link was intercepted; argument is the target path. */
  onInternalLink(targetPath: string): void;
  /** A browser back/forward (popstate) was intercepted. */
  onBack(): void;
  /**
   * Whether the user already confirmed leaving. While true the guard stands
   * down so the app's own navigation (and the native unload) can proceed.
   */
  isLeaving(): boolean;
}

/** Pull a plain {@link AnchorNavCandidate} out of a DOM click event. */
function extractAnchorCandidate(event: MouseEvent): AnchorNavCandidate | null {
  const target = event.target as Element | null;
  const anchor = target?.closest?.('a') ?? null;
  if (!anchor) return null;
  return {
    url: anchor.getAttribute('href') ? anchor.href : null,
    target: anchor.getAttribute('target'),
    isDownload: anchor.hasAttribute('download'),
    hasModifierOrNonPrimary:
      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
    defaultPrevented: event.defaultPrevented,
  };
}

/**
 * Install the guest-exit navigation guard. Registers:
 *  - `beforeunload` (window) — native browser warning for refresh/close/external;
 *  - `popstate` (window) — browser back/forward, kept on-page via a re-pushed
 *    history sentinel so a custom modal can be shown instead;
 *  - capture-phase `click` (document) — in-app anchor/link navigations.
 *
 * Returns an uninstall function that removes every listener. The caller is
 * responsible for only installing while the warning is armed (guest + active
 * play), satisfying "register beforeunload only while the condition is active".
 */
export function installGuestExitGuard(
  env: GuestExitGuardEnv,
  handlers: GuestExitGuardHandlers,
): () => void {
  const handleBeforeUnload = (event: Event): void => {
    if (handlers.isLeaving()) return;
    // Modern browsers ignore custom text; both lines are what actually triggers
    // the native "Leave site?" prompt across browsers.
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = '';
  };

  const handlePopState = (): void => {
    if (handlers.isLeaving()) return;
    // Cancel the back/forward by re-pushing the current entry (URL unchanged),
    // then surface the custom modal.
    env.windowTarget.history.pushState(null, '', env.getHref());
    handlers.onBack();
  };

  const handleClick = (event: Event): void => {
    if (handlers.isLeaving()) return;
    const mouseEvent = event as MouseEvent;
    const candidate = extractAnchorCandidate(mouseEvent);
    if (!candidate) return;
    const targetPath = resolveInternalNavTarget(candidate, {
      origin: env.getOrigin(),
      currentPath: env.getCurrentPath(),
    });
    if (!targetPath) return;
    event.preventDefault();
    handlers.onInternalLink(targetPath);
  };

  // Seed a history sentinel so the first Back press lands on (a duplicate of)
  // this page, giving popstate something to catch without leaving.
  env.windowTarget.history.pushState(null, '', env.getHref());

  env.windowTarget.addEventListener('beforeunload', handleBeforeUnload);
  env.windowTarget.addEventListener('popstate', handlePopState);
  env.documentTarget.addEventListener('click', handleClick, { capture: true });

  return () => {
    env.windowTarget.removeEventListener('beforeunload', handleBeforeUnload);
    env.windowTarget.removeEventListener('popstate', handlePopState);
    env.documentTarget.removeEventListener('click', handleClick, { capture: true });
  };
}
