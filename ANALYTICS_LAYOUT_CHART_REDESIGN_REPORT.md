# Creator Analytics — Layout & Chart Redesign Report

Branch: `feature/analytics-layout-chart-redesign`
Scope: **frontend UI/UX only.** No analytics backend, API contract, collector,
Creator Plus gating, guest play, cloud saves, guest-exit, registration CTA,
upload/moderation/game-host/CSP/cookie/MinIO behavior was changed. No real
analytics data was removed and no demo/mock analytics were added.

## What was wrong before

The page was already "polished" once but the layout still did not feel like a
production SaaS dashboard:

- The entire page was built from ~50 inline `React.CSSProperties` style objects
  (~760 lines of inline style), which made spacing inconsistent and hard to tune.
- KPIs used `auto-fit minmax(190px, …)`, so column counts drifted unpredictably
  with width instead of a clean 4 / 2 / 1 rhythm.
- The "Plays over time" chart was a **fixed 820×300 px** bar chart with
  `preserveAspectRatio="none"` and `fontSize="18"` text baked _inside_ the SVG.
  When scaled down (tablet/mobile) the axis text shrank to ~5–6 px (unreadable),
  and with 90 daily bars the bars/labels crammed together. Only 3 hard-coded
  x-axis labels were drawn (first/middle/last), and the previous-period line was
  overlaid directly on the bars.
- Top games used a 6-column grid that became cramped at mid widths.
- Internal events, advanced metrics, and the upsell relied on dense auto-fit
  grids with little vertical breathing room.

## Layout changes

- Introduced a dedicated, reusable CSS layer in `apps/web/src/index.css`
  (`.ca-*` classes) and removed the inline-style blocks from `Analytics.tsx`.
- **Page shell**: `.ca-page` is a stable, centered `max-width: 1200px` column
  with consistent `clamp()` vertical rhythm between sections.
- **Header**: title/subtitle on the left, compact segmented range selector +
  refresh on the right; on mobile the controls wrap full-width below the title.
- **KPI grid**: explicit responsive grid — 4 per row (desktop) → 2 (≤1080px) →
  1 (≤600px); every card has a fixed `min-height`, uppercase label, large
  `font-variant-numeric: tabular-nums` value, helper line, and a tone icon.
- **Top games**: table/card hybrid with a rank chip, truncating title link and
  play-share badge on desktop; on ≤780px the header row hides and each game
  becomes a stacked card with per-metric mobile labels.
- **Internal events**: six titled group cards in a 3 / 2 / 1 responsive grid;
  empty groups collapse to a compact state instead of reserving big space; event
  labels truncate with a `title` tooltip.
- **Advanced analytics**: split into clear subsections (overview KPIs, player
  mix, launch reliability, cloud-save funnel, conversion, per-game, custom
  events, version comparison) using titled cards and a 2-column grid that
  collapses to 1 column on tablet/mobile.
- **Creator Plus locked state**: compact gradient upgrade card; the CTA button
  goes full-width on mobile and never overlaps.
- Grid children use `minmax(0, 1fr)` + `min-width: 0`; text uses
  `overflow-wrap: anywhere` / ellipsis with `title` where clipping is possible.

## Chart implementation change

Replaced the fixed-pixel bar chart with a **responsive area/line chart** that
reads cleanly from ~320 px to ~1180 px wide:

- SVG uses `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` and is laid
  into an inner plot rectangle with **safe margins** (`46px` left for y labels,
  `30px` bottom for x labels) inside a fixed-height, responsive canvas.
- Strokes use `vector-effect="non-scaling-stroke"` so the line stays crisp at
  any width (no distortion from non-uniform scaling).
- **Axis labels are real HTML positioned over the plot** (not text inside the
  scaled SVG), so they are always a readable fixed size and never shrink to
  unreadable px on mobile. X-axis labels are **thinned to at most 6** evenly
  spaced dates (always including first & last) regardless of 7 / 30 / 90 days,
  so they never collide. Y-axis shows 3 ticks (max / mid / 0) with compact
  number formatting.
- Values scale safely against `max(1, peak, previousPeak)` so zero data and very
  high values both render without `NaN`/overflow.
- **Empty windows** show a polished centered empty state (no flat/broken line),
  and no axis labels or area fill are drawn.
- An accessible visually-hidden `<ul>` lists each day's plays, and the SVG keeps
  its `aria-label`.

## Previous-period comparison

Removed the confusing on-bars overlay. The previous period is now shown two
calm ways: a **subtle dashed secondary line** in the chart (only when
previous-period data exists) plus a dedicated **comparison mini-card** under the
chart showing the signed change %, this-period plays, and previous-period plays.
Direction is conveyed by icon + sign + an accessible label, not color alone.

## Responsive fixes

- KPI grid 4/2/1; events 3/2/1; advanced 2→1; per-game and version rows collapse.
- Header controls + range selector wrap full-width on mobile.
- Top-games table collapses to stacked cards (≤780px) with mobile metric labels.
- Chart canvas height is `clamp(230px, 30vw, 340px)`; labels stay readable.
- No fixed pixel widths that force horizontal scroll; grids use `minmax(0,1fr)`.

## i18n keys added (EN + UK, in sync)

`analytics.changeIncrease`, `analytics.changeDecrease`, `analytics.changeNoChange`,
`analytics.comparisonThisPeriod`, `analytics.comparisonPrevPeriod`,
`analytics.playerMixAria`.

All visible strings use `t(...)` keys. `node apps/web/scripts/i18n-hardcoded-scan.mjs`
reports **zero** hardcoded UI strings for the rewritten file (run via an
identical copy of the scanner in the verification harness — see below).

New helpers `formatShortDate` / `formatCompactNumber` were added to
`apps/web/src/lib/formatTime.ts` for compact chart axis labels.

## Tests updated

`apps/web/src/pages/Creator/Analytics.test.tsx` keeps the existing coverage and
adds: KPI grid renders real values (no demo data); chart renders for 7d/30d/90d;
90-day x-axis labels are thinned (≤6); high play counts render without `NaN`
paths; zero data shows the polished empty state (no area fill, no axis labels);
top-games new layout; advanced analytics subsection scaffolding
(`ca-kpi-grid--six`, `ca-grid-2`); Free locked state; loading skeleton; error
retry; EN/UK key parity (including the new keys); and absence of demo/mock copy.

## Verification results

The repo's npm workspace could not be executed from this environment (the
working-tree mount was unavailable to the shell, and no system browser/root was
available). To verify rigorously, an isolated harness bundled the **real**
`CreatorAnalyticsView` (esbuild) and rendered it with the test fixtures:

- **Component render / behavior**: 58/58 automated assertions pass across rich,
  advanced, empty/zero, loading, error, 7-day, 30-day, 90-day, and high-value
  states — including grouped events, locked vs advanced gating, the comparison
  card (`+40%`), thinned axis labels (≤6), 3 y-labels, and **no `NaN`/`Infinity`
  in any SVG path**.
- **Chart visual**: the area chart SVG was rasterized for the 3-, 7-, and
  90-point cases and confirmed to scale cleanly (gradient fill, current solid
  line, dashed previous-period line, gridlines, central spike pinned to top).
- **i18n scan**: the repo scanner (exact logic) reports
  `no hardcoded UI strings found` for the rewritten `Analytics.tsx`.
- **Formatting**: `prettier --check` (repo config: singleQuote, semi,
  trailingComma all, printWidth 100) passes for `Analytics.tsx`,
  `Analytics.test.tsx`, the new `index.css` analytics block, and
  `formatTime.ts`.

Still to be run in the repo environment by the reviewer (could not run here):
`npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`,
`node apps/web/scripts/i18n-hardcoded-scan.mjs`,
`bash infra/scripts/check-real-bundle.sh apps/web/dist`, and `npm run test:e2e`.
The code mirrors the previous (passing) file's hook usage, export shape (only
components exported), and import patterns, so lint/typecheck are expected to pass.

## Manual visual QA checklist

A self-contained preview (`analytics-preview.html`, real component markup +
the production CSS) is provided for pixel review. Verify:

- [ ] Desktop 1440 / laptop 1280: KPIs 4-up, no overlap, chart axis labels clear.
- [ ] Tablet ~768: KPIs 2-up, top games stacked, advanced 1-column.
- [ ] Mobile ~390: KPIs 1-up, range selector full-width, **no horizontal scroll**.
- [ ] 7d / 30d / 90d: x-axis labels never collide (≤6 shown).
- [ ] Empty data: polished empty chart + empty states, no giant blank blocks.
- [ ] At least one analytics event: KPIs, chart, events, top games populate.
- [ ] EN and UK: no overflow/clipping with longer Ukrainian strings.
- [ ] Creator Plus locked (Free) and unlocked (advanced) states.

## Known limitations

- `CreatorAnalyticsDto.topGames` has no cover URL, so top games use a numbered
  rank chip rather than a thumbnail (avoids fake media / backend changes).
- Full-page pixel screenshots and the official `npm` suite could not be executed
  in this sandbox (mount/browser/root constraints). Verification used an
  equivalent isolated render harness + targeted SVG rasterization instead.
- The existing Vite "large chunk" warning is pre-existing and unrelated.

## Before / after (text)

Before: fixed-pixel bar chart with tiny/cramped axis text on small screens,
overlaid comparison line, auto-fit grids drifting between column counts, and a
page built from large inline-style blocks.

After: a centered max-width SaaS dashboard — verified-data header with compact
range controls, a clean 4/2/1 KPI grid, a responsive area chart with readable
HTML axis labels and a separate comparison card, grouped event cards, a
table/card-hybrid top-games section, clearly sectioned advanced analytics, a
compact Creator Plus upsell, and skeleton/empty/error states sized to match the
final layout — all driven by reusable `.ca-*` CSS classes.
