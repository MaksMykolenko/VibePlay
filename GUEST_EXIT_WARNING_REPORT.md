# Guest Exit Warning — Implementation Report

## Summary

Added a guest-only "your progress may not be saved" warning that fires when an
unauthenticated player tries to leave an active game on `/play/:slug`. Guest
progress is local-only, so leaving (in-app navigation, browser back, refresh, or
tab close) risks losing it. The warning never blocks gameplay — it only reacts to
a *leave attempt* — and offers conversion paths (Create account / Log in) plus
"Leave anyway" and "Keep playing".

The work is intentionally split into a **pure logic + DOM-agnostic guard** layer
(`lib/guestExitWarning.ts`), a **thin React hook** (`hooks/useGuestExitWarning.ts`),
and a **presentational modal** (`components/GuestExitWarningModal.tsx`), so the
decision logic is unit-testable in the project's node (no-DOM) test environment.

### Key constraint discovered

The app mounts a **non-data router** (`<BrowserRouter>` / `<HashRouter>` in
`App.tsx`). React Router v7's `useBlocker` requires a *data* router
(`useDataRouterContext`) and would throw here. Rather than risk a large, invasive
migration to `createBrowserRouter` (explicitly out of scope), in-app navigation is
intercepted without it:

- **In-app links** → capture-phase `click` listener on `document` (resolves the
  nearest `<a>` to an internal path, ignoring new-tab/modifier/download/external).
- **Browser back/forward** → `popstate` with a re-pushed history sentinel (keeps
  the user on the page so a custom modal can be shown).
- **The in-page Exit button** → routed through the guard programmatically.
- **Refresh / tab close / external** → native `window.beforeunload`.

## UX behavior

- **Keep playing** — closes the modal, stays on the game (the safe default;
  receives focus on open and is what Escape / backdrop-click resolve to).
- **Leave anyway** — proceeds with the originally-intended navigation.
- **Create account** — navigates to `/register?returnTo=<current play path>`.
- **Log in** — navigates to `/login?returnTo=<current play path>`.
- `returnTo` is built with the existing `withReturnTo` / `sanitizeReturnTo`
  helpers, so only safe internal paths are ever attached; external/`//`/`://`
  values collapse to `/`.
- The native `beforeunload` prompt uses the browser's generic text (modern
  browsers ignore custom messages, per spec).

### When the warning shows (armed condition)

All must hold: route is the real play page (the hook is only mounted there and is
gated on `!IS_DEMO`), the user is **not** logged in, and the game is active
(`launch !== null` — the iframe has loaded far enough that progress could exist).

It does **not** show for: logged-in users; before the game is active; on
login/register/detail pages; after the user chose "Leave anyway"; or when leaving
via the warning's own Create-account/Log-in CTAs (a `leavingRef` makes the guard
stand down for that navigation). It also won't re-open while the user stays on the
page (one pending warning at a time).

> Signal choice: there is no dedicated SDK "dirty save" event today, so the
> conservative **iframe-loaded / play-active** signal arms the warning, exactly as
> the spec allows. If a precise dirty/`onProgress` signal is later surfaced, the
> `active` prop in `GamePlayerPage` is the single place to tighten this.

## Accessibility

`role="dialog"`, `aria-modal="true"`, labelled/described by the title and body.
Focus moves to "Keep playing" on open; **Tab is trapped** within the dialog;
**Escape** resolves as "Keep playing"; backdrop click resolves as "Keep playing".
Buttons are full-width and stacked for a mobile-friendly layout, styled to match
the existing cloud-save CTA/modal components (`--surface-2`, `--border-strong`,
`--shadow-lg`, `--z-critical-modal`).

## Files changed

**New**

- `apps/web/src/lib/guestExitWarning.ts` — pure arming decision, internal-nav
  resolver, allowlisted analytics-param builder, and the injectable
  `installGuestExitGuard` (beforeunload / popstate / capture-click).
- `apps/web/src/hooks/useGuestExitWarning.ts` — wires the guard, owns modal
  state, performs returnTo navigation, emits analytics.
- `apps/web/src/components/GuestExitWarningModal.tsx` — accessible modal.
- `apps/web/src/lib/guestExitWarning.test.ts` — logic + guard-wiring tests.
- `apps/web/src/components/GuestExitWarningModal.test.tsx` — modal markup tests.

**Modified**

- `apps/web/src/lib/analytics.ts` — added 5 events to the `FunnelEvent` union
  (params were already allowlisted; no allowlist change needed).
- `apps/web/src/pages/GamePlayerPage.tsx` — instantiate the hook, route the Exit
  button through `requestLeave`, render the modal.
- `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/uk.ts` — `guestExit.*` strings.
- `apps/web/src/index.css` — `.guest-exit-backdrop` / `.guest-exit-modal` styles.

## Analytics events added

All emitted via the existing `trackEvent` (GA4) and built by
`guestExitWarningParams`, which by construction includes **only** allowlisted,
non-PII fields: `game_id`, `game_slug`, `source`, `cta_location`
(`"guest_exit_warning"`), `logged_in` (always `false`). No email, username,
tokens, session ids, save data, object keys, raw errors, or full URLs are ever
sent. `source` is one of `internal_link`, `back_button`, `exit_button`,
`beforeunload`.

- `guest_exit_warning_shown`
- `guest_exit_warning_keep_playing`
- `guest_exit_warning_leave_anyway`
- `guest_exit_warning_signup_clicked`
- `guest_exit_warning_login_clicked`

(Analytics only transmit in PROD real mode, per the existing `IS_ANALYTICS_ENABLED`
gate; the allowlist sanitizer drops anything unexpected as a second line of defense.)

## i18n

English and Ukrainian strings added under `guestExit.*`: `title`, `body`,
`keepPlaying`, `createAccount`, `logIn`, `leaveAnyway`. Ukrainian copy matches the
spec example (e.g. title "Прогрес може не зберегтися").

## Test results

`apps/web` test suite (Vitest, node environment):

```
Test Files  7 passed (7)
     Tests  29 passed (29)
```

16 new tests were added. Coverage maps to the requested cases:

- guest on play page is armed for internal navigation — `shouldArmGuestExitWarning`,
  `resolveInternalNavTarget`.
- logged-in user is never warned — `shouldArmGuestExitWarning`.
- warning does not arm before play/iframe activity — `shouldArmGuestExitWarning`.
- "Leave anyway" allows navigation — guard stands down when `isLeaving()` is true
  (beforeunload doesn't `preventDefault`; popstate doesn't re-trap).
- "Create account" / "Log in" go to `/register` / `/login` with a safe `returnTo`
  — `withReturnTo` tests.
- unsafe `returnTo` values are rejected — `sanitizeReturnTo` tests
  (`https://…`, `//…` → `/`; CTA target carries no external destination).
- `beforeunload`/`popstate`/capture-`click` are attached only via the guard and
  fully removed on cleanup; a history sentinel is seeded once — `installGuestExitGuard`
  tests.
- analytics params are allowlisted and contain no private/save data —
  `guestExitWarningParams` + `sanitizeEventParams` cross-check.
- modal renders an accessible dialog with all four actions when open, and renders
  nothing when closed — `GuestExitWarningModal` markup tests.

Other verification:

- `prettier --check` (changed files): **pass**.
- `eslint .`: **pass** (0 problems).
- `tsc -b` typecheck (web): **pass**.
- `vite build` (web): client bundle compiles cleanly (1954 modules transformed,
  `✓ built`). Note: `npm run build` in place fails only at Vite's `prepare-out-dir`
  step with `EPERM: unlink dist/.nojekyll` — a sandbox filesystem permission quirk
  on the mounted `dist`, **not** a code error; building to a writable `--outDir`
  succeeds. On a normal dev/CI machine `npm run build` runs unmodified.
- `npm run test:integration`: **not run** — Redis is not available in this
  environment, and this suite targets `@vibeplay/api` (backend), unrelated to this
  frontend change.
- `npm run test:e2e`: **not run** — Playwright browsers / full local stack are not
  available in this environment.

## Manual QA checklist

- [ ] Guest opens Fat Dima Simulator and starts playing.
- [ ] Guest clicks site logo / navigation / back.
- [ ] Warning appears.
- [ ] "Keep playing" keeps the game open.
- [ ] "Leave anyway" leaves the page.
- [ ] "Create account" opens register and preserves `returnTo` to the play page.
- [ ] "Log in" opens login and preserves `returnTo` to the play page.
- [ ] Logged-in user can leave without a warning.
- [ ] Refresh / tab close triggers the browser-native `beforeunload` warning for
      guest active play.
- [ ] Game still launches instantly without login.
- [ ] Escape closes the modal as "Keep playing"; focus is trapped; mobile layout
      is usable.

## Risks / follow-ups

- **Non-data router / back button.** Back/forward is handled with a `popstate`
  history sentinel because `useBlocker` needs a data router. This is robust but has
  a known cost: after "Keep playing", one extra Back press may be needed to fully
  traverse out (the sentinel entry shares the play URL, so nothing visibly
  changes). If the app later migrates to `createBrowserRouter`, swap the guard's
  popstate handling for `useBlocker` for cleaner semantics.
- **No header nav on the immersive play page today.** The play route renders
  outside `AppShell`, so there are currently no logo/header `<a>` links to click;
  the capture-phase click interception is defensive (covers any future in-page
  links) and harmless where none exist. The primary in-app exit vector — the Exit
  button — is guarded explicitly.
- **Test depth.** The project has no `jsdom`/Testing Library and runs Vitest in
  node, so interaction-level behaviors (real focus trap, Escape keypress, dispatched
  click) are validated through pure-logic + guard-wiring unit tests and the manual
  QA checklist rather than a rendered-DOM test. Adding `jsdom` + RTL later would
  allow fuller component-interaction tests.
- **`beforeunload` text** cannot be customized (browser limitation); intended.
- **Dirty-progress signal.** Arming uses the conservative iframe-loaded signal. If
  the SDK later emits a precise progress/dirty event, tighten the `active` prop in
  `GamePlayerPage` to reduce warnings for players who haven't actually progressed.

> Not committed, pushed, or deployed — left for human review as requested.
