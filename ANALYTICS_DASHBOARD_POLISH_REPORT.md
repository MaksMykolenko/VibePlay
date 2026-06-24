# Creator Analytics — Chart Interactivity & Polish Pass

Branch: `feature/analytics-layout-chart-redesign`
Scope: **frontend UI/UX only.** No analytics backend, API contract, collector,
Creator Plus gating, guest play, cloud saves, or other behavior changed. No
real data removed; no demo/mock analytics added. (Builds on the layout/chart
redesign documented in `ANALYTICS_LAYOUT_CHART_REDESIGN_REPORT.md`.)

## Tooltip / interaction implementation

The responsive area chart is now inspectable by hover, tap, and keyboard.

- **Reusable geometry** moved to a pure, unit-tested module
  `apps/web/src/pages/Creator/chartGeometry.ts` — `buildChartGeometry(current, previous)`
  returns `{ points[], maxValue, peak, hasCurrentValues, hasPreviousValues,
  areaPath, linePath, previousPath }`, where each point carries
  `{ index, date, value, previousValue, x, y, previousY }` (x/y normalized 0–100
  inside the plot). This keeps `Analytics.tsx` exporting only components
  (react-refresh-friendly) and makes the math testable.
- **Interaction layer**: a transparent, absolutely-positioned overlay fills the
  plot rectangle. `onPointerMove` / `onPointerDown` compute the nearest day from
  the pointer x relative to the layer's bounding rect (works for mouse hover and
  touch tap). `onPointerLeave` clears only for mouse (a tap stays pinned).
- **Keyboard**: the overlay is `role="slider"`, `tabIndex={0}`, with
  `aria-valuemin/max/now` and an `aria-valuetext` describing the active day
  (date + plays, plus previous value when present). Arrow keys / Home / End move
  the active day; Escape clears. The visually-hidden per-day `<ul>` remains as a
  full table-style fallback.
- **Active markers + crosshair**: an accent filled dot with an outer ring marks
  the current-period point; a smaller dashed-info dot marks the previous-period
  point; a thin dashed vertical crosshair connects to the axis. These are HTML
  overlays (not SVG circles) so they stay perfectly round under the chart's
  non-uniform `preserveAspectRatio="none"` scaling.
- **Tooltip**: a compact dark-glass card showing the date, current-period value
  (accent dot), previous-period value (dashed indicator) when available, and the
  signed delta vs previous. It is `pointer-events: none`, fades in (respecting
  `prefers-reduced-motion`), and is **anchored left/center/right based on the
  point's x** so it never overflows the chart container on any width.
- **SSR-safe**: the active point starts `null`, so server/static render emits no
  tooltip/markers and there is no hydration mismatch. Interaction state resets on
  range change via a remount `key={analytics.range}` (no `setState`-in-effect).
- No external chart library was added (lightweight React state + SVG/HTML math).

## What the review found & what was improved (beyond the tooltip)

- **Peak chip** ("Peak day / Пік за день") confirmed to use the *actual* maximum
  daily value (`geometry.peak`), independent of the axis scale.
- **Y-axis headroom**: the axis maximum is rounded up to a calm "nice" value
  (`niceAxisMax`), so the line/area and the active-point ring no longer sit flush
  against the top of the plot, and the y-labels read as round numbers.
- **Y-axis labels**: slightly larger (0.7rem) and semibold but still muted — more
  legible without becoming bright/distracting.
- **X-axis labels**: still capped at 6 evenly-spaced dates (first/last anchored),
  so 7/30/90-day ranges never crowd.
- **"No previous-period data" state** lightened from a full bordered card to a
  muted inline note so it no longer competes with the chart.
- **Legend**: current period (solid accent swatch) vs previous period (dashed
  info line) remain visually distinct; a subtle "hover or tap to inspect" hint
  was added to the chart footer.
- **Empty window**: still shows the polished empty state; the interaction layer
  is not rendered there, so there is no broken/confusing tooltip behavior.
- Broader page (KPI alignment, upgrade prompt weight, grouped internal events,
  top-games table, advanced-analytics density) was reviewed and judged
  consistent from the prior redesign; no further structural changes were made to
  avoid regressions.

## i18n

Added to `en.ts` and `uk.ts` (EN/UK in parity, natural Ukrainian):
`analytics.tooltip.current`, `analytics.tooltip.previous`, `analytics.tooltip.delta`,
`analytics.tooltip.noPrevious`, `analytics.chart.activePoint`, `analytics.chart.tapHint`.
All tooltip/marker copy uses translation keys.

## Tests added/updated (`apps/web/src/pages/Creator/Analytics.test.tsx`)

- New `buildChartGeometry` unit tests: normalized points + previous values;
  all-zero stays finite with `hasCurrentValues=false`; no comparison series ⇒
  `previousValue`/`previousY` null; high spike (50000) keeps `0 ≤ y ≤ 100`.
- Interaction layer present with data (`role="slider"`, `aria-valuemax`,
  `tabindex="0"`, `ca-chart__hit`, tap hint) and **absent** on empty/zero data.
- Lighter no-previous comparison note renders when `changePercent` is null.
- Existing coverage retained: 7/30/90-day render, zero-data no-crash, KPI grid,
  grouped events, top games, advanced subsections, Free/Plus, EN/UK key parity
  (incl. the new keys), no demo/mock copy.

## Verification results (run in the real repo)

- `npm run format:check` — pass (whole repo).
- `npm run lint` — pass (0 problems).
- `npm run typecheck -w @vibeplay/web` (`tsc -b --force`) — pass.
- `npm run test -w @vibeplay/web` — pass: **12 files, 71 tests**.
- web `vite build` — pass (built into the gitignored `dist-ssr` to avoid the
  sandbox's `unlink`-disabled mount; the normal `dist` `emptyOutDir` step cannot
  delete files here — environment limitation only, not a code issue). Pre-existing
  large-chunk warning unchanged.
- `node apps/web/scripts/i18n-hardcoded-scan.mjs` — `no hardcoded UI strings found`.
- `bash infra/scripts/check-real-bundle.sh apps/web/dist-ssr` — `OK — no demo functionality`.
- `E2E_FORCE_WEB_BUILD=true npm run test:e2e` — **not run here**: Playwright needs
  browser system libraries and a local Postgres/API stack that aren't available
  in this sandbox. Recommend running on a full dev/CI machine.

## Known limitations

- The interactive hover/tap/keyboard behavior is verified by unit tests
  (geometry + interaction-layer structure) and the production build, but live
  pixel interaction could not be exercised headlessly here (no browser). Use the
  manual QA checklist below in a real browser (`npm run dev:web` → Creator →
  Analytics).
- All-zero windows intentionally show the polished empty state rather than a flat
  interactive line, so the tooltip is inactive there (graceful, not broken).
- Top games still use a numbered rank chip (the DTO has no cover URL).

## Manual QA checklist

- [ ] Hover the chart peak and ordinary points on desktop — tooltip + crosshair + marker track the nearest day.
- [ ] Tap points at mobile width — tooltip appears and stays; values readable.
- [ ] Tooltip never overflows left/right at any width (left/center/right anchor).
- [ ] Tooltip values match the chart (current, previous, delta).
- [ ] Previous-period row/line appears for Creator Plus data; no-previous note is light.
- [ ] 7d / 30d / 90d all interactive; x-labels never crowd (≤6).
- [ ] Empty window shows the polished empty state, no tooltip.
- [ ] Keyboard: focus the chart, arrow keys move the active day, Esc clears.
- [ ] EN and UK copy correct and natural.
- [ ] Analytics page still loads real data; no demo/fake data; guest play and the Analytics v2 collector unaffected.
