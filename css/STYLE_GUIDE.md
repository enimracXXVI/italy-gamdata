# Style guide — `css/styles.css`

Companion reference for `styles.css`. Every class in the stylesheet is listed
here with what it does and where it's used, so you can say "change `.stat-tile__value`
to X" and I know exactly what that touches. Keep this file in sync whenever
`styles.css` changes — if you ask for a new class, it gets added here too.

No inline `style=""` attributes exist anywhere in `index.html` or the `js/`
files. Every visual choice is a class. Colors are never hardcoded outside the
token block at the top of `styles.css` — everything else references a
`var(--token)` or, for SVG marks, one of the `series-*` / `seq-*` utility
classes (§7).

**`[hidden] { display: none !important; }`** is a global rule near the top
of the file (§3). Setting an element's `.hidden` property in JS is the only
way anything in this codebase gets hidden — never a class, never inline
`display`. This exists because the native `[hidden]` UA-stylesheet rule is
the *lowest*-priority rule there is: any author class on the same element
that sets `display` (`.filter-option { display: flex }`,
`.dashboard-section { display: flex }`, …) used to win silently, leaving the
element `hidden` in the DOM sense but still fully rendered. That's a real
bug this app shipped twice — the "operator search doesn't filter" report
(rows' `.hidden` was being set correctly; they just never actually
disappeared) and "Operator compare doesn't collapse" were both this, not
the JS logic either report blamed. The global rule closes the whole bug
class rather than requiring every future toggleable element to remember an
explicit `.foo[hidden]` override.

---

## 1. Color tokens

Defined once as CSS custom properties on `:root` (light values), then
re-declared under `@media (prefers-color-scheme: dark)`. Theme follows the
device's OS-level preference only — there is no in-page toggle (there used
to be one; removed since a page-level override on top of a device-level
setting was just a second thing to get out of sync with the other).

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--surface-page` | `#f9f9f7` | `#0d0d0d` | `<body>` background, the plane behind cards |
| `--surface-card` | `#fcfcfb` | `#1a1a19` | Card/header/filter-bar backgrounds; also the stroke color that cuts gaps between stacked-area segments |
| `--surface-raised` | `#ffffff` | `#232322` | Popovers, tooltip, form controls — sits "above" a card |
| `--text-primary` | `#0b0b0b` | `#ffffff` | Headings, values, primary body text |
| `--text-secondary` | `#52514e` | `#c3c2b7` | Captions, labels, secondary text |
| `--text-muted` | `#898781` | `#898781` | Timestamps, axis labels, hints, placeholders (same both modes) |
| `--border-hairline` | `rgba(11,11,11,.10)` | `rgba(255,255,255,.10)` | All 1px card/control borders |
| `--grid-line` | `#e1e0d9` | `#2c2c2a` | Horizontal gridlines inside charts |
| `--axis-line` | `#c3c2b7` | `#383835` | Chart axis lines + the dashed hover crosshair |
| `--focus-ring` | `#2a78d6` | `#3987e5` | `:focus-visible` outline on interactive controls |
| `--delta-good` | `#006300` | `#0ca30c` | KPI tile up-arrow text (metric improved); also the Growth-by-vertical/-channel diverging bars' positive fill + value-label ink (`.viz-diverging-bar--pos`, `.viz-bar-label--good`) — same meaning (growing vs. shrinking), so the same token, not a fresh diverging pair |
| `--delta-bad` | `#d03b3b` | `#d03b3b` | KPI tile down-arrow text (metric worsened); also the negative-growth counterpart of the above (`.viz-diverging-bar--neg`, `.viz-bar-label--bad`) |
| `--status-good/warning/serious/critical` | see file | see file | Reserved status scale — `--status-warning` backs the data-quality warning banner; the rest are available for future alerting |
| `--series-1`…`--series-8` | palette hues | palette hues | Categorical identity (verticals, operators, groups) — see §7 |
| `--series-other` | `#b3b2ac` | `#5c5b56` | "Other" fold-in bucket + de-emphasized bars |
| `--seq-100`…`--seq-700` | blue ramp | same | Sequential magnitude (heatmap cells) — see §7 |
| `--accent` | = `--series-1` | = `--series-1` | Primary interactive accent: selected filter chips, active toggle, focus ring badge |

**Where a color is chosen at runtime** (not a fixed token): per vertical, via
its fixed position in `VERTICAL_ORDER` (`js/data.js`) — always the same color
regardless of what else is selected. Per operator, `app.js` builds a
`compareColorMap` once per render from `[...state.operators]`'s *selection
order* (`Charts.rankColorClass(index)`) and reuses it everywhere an operator
identity needs a color in that render pass (Compared-operators trend,
vs.-market, the leaderboard's highlighted rows). Operator share is separate:
it's never wired to "Compare operators" — it always auto-picks the top 7 by
Online Sportsbetting GGR within the selected date range (regardless of the
Vertical/Channel filters elsewhere) and colors that ranking with
`rankColorClass` in ranked order. `charts.js` still exports a
`operatorColorClass(name)` stable-hash function, but it's used only for the
"Compare operators" *picker's* preview swatches (a static list of every
possible choice, not a set of entities being actively compared side by
side) — it used to also color the compare-set charts, but a hash into 8
slots collides constantly once more than 2-3 operators are involved (two
compared operators could render as the literal same color, which defeats
the entire point of "compare"). Position-based coloring is collision-free
by construction since the compare-set is capped at 6 and there are 8 slots;
prefer it over the hash for any new "identity color" need.

**Every `series-*`/`seq-*` class sets both an SVG color (`fill`/`stroke`) and
`background-color`.** They're used on two different kinds of element: SVG
marks (bars, areas, lines — read `fill`/`stroke`, ignore `background-color`)
and plain HTML `<span>` swatches — legend swatches, tooltip color keys,
filter-option swatches (read `background-color`, and `fill`/`stroke` are
silent no-ops on non-SVG elements). Missing `background-color` was a real bug
here: every legend/tooltip/filter swatch rendered with no color at all,
looking like a legend with no color key. Both properties need to stay on
every one of these classes going forward.

---

## 2. Layout shell

| Class | What it is | Used in |
|---|---|---|
| `.app-header` | Sticky top bar | `index.html` `<header>` |
| `.app-header__row` | Max-width flex row inside the header | same |
| `.app-header__titles` | Wraps the `<h1>` | same |
| `.app-header__title` | "Italy Gamdata" — a text placeholder for a future logo, kept short deliberately: it has to share one row with the tab switcher at every width, including narrow phones, rather than wrap or push the switcher to its own line | same |
| `.tab-nav` / `.tab-nav__item` / `--active` | Dashboard ↔ Data Quality switcher in the header. Same `:not(--active):hover` scoping as the segmented control | header, `app.js` `setupTabs()` |
| `.tab-nav__item-badge` | Small count pill on the "Data Quality" tab button — active (non-dismissed) finding count. Removed entirely when the count is 0 | `app.js` `updateQualityBadge()` |
| `.app-header__actions` | Right-side cluster (just the last-updated text now) | same |
| `.app-header__updated` | "Data through …" text, hidden under 480px | same, set by `app.js` |
| `.status-banner` + `--loading` / `--error` / `--warning` | Fetch status / data-quality message above the filter bar (`--warning` is the duplicate-rows notice, sourced from `js/quality.js`) | `app.js` `showStatus()` |
| `.status-banner__title` | Bold first line of the banner | same |
| `.app-main` | Centered column, holds both tab panels | `index.html` `<main>` |
| `.tab-panel` | One of the two top-level views (`#tab-panel-dashboard`, `#tab-panel-quality`); flex column with the section gap `.app-main` used to provide directly before the tabs existed | same |
| `.dashboard-section` | One titled block ("Market overview", "Operator compare", and every Data Quality check) | same |
| `#section-compare` | id on the "Operator compare" section specifically — `app.js` sets its `hidden` attribute directly (`state.operators.size === 0`) each render. Three chart cards all showing the same "pick an operator to see this" placeholder at once read as dead space to scroll past, so the section collapses entirely instead until a pick is made | `index.html`, `app.js render()` |
| `.section-title` / `.section-subtitle` | Section heading + one-line description | same |

---

## 3. Filter bar (`js/components.js`)

One sticky row above everything it scopes, per the interaction model: date
range first, then dimension filters, then the metric toggle, then reset.

| Class | What it is |
|---|---|
| `.filter-bar` | The sticky row container itself |
| `.filter-control` | Positioning wrapper around one trigger + its popover |
| `.filter-trigger` | The pill button you click to open a filter ("Vertical ▾") |
| `.filter-trigger--active` | Applied while that control's popover is open. Same `:not(.filter-trigger--active):hover` scoping as the segmented control, for the same reason |
| `.filter-trigger__count` | Small numeric badge on the trigger (e.g. "6") |
| `.filter-trigger__chevron` | The ▾ glyph |
| `.filter-popover` / `--wide` | The dropdown panel; `--wide` variant for the operator picker (has a meta column, and is sized larger — 420–480px wide, 420px option-list height — since it's the one list long enough that cramped navigation actually hurts) |
| `.filter-search` | Text input at the top of a popover with >8 options (Vertical, Operator) |
| `.filter-option-list` | Scrollable list of checkboxes inside a popover. `overscroll-behavior: contain` stops scrolling past its own top/bottom from "chaining" into a scroll of the page underneath (same fix applied to the mobile sheet's own `#filter-bar` scroll) |
| `.filter-option` | One checkbox row |
| `.filter-option--disabled` | Dimmed state once a `max` cap (operators: 6) is reached |
| `.filter-option__swatch` | Small color square before a vertical/operator name, tied to its `series-N` |
| `.filter-option__label` | The option's text, ellipsis-truncated if too long |
| `.filter-option__meta` | Secondary text after the label (operator's group name) |
| `.filter-popover__footer` | Row holding the footer actions + the "Up to N" hint |
| `.filter-popover__footer-actions` | Groups "Select all" and "Clear" together on the footer's left side |
| `.filter-popover__clear` | Shared class for both the "Select all" and "Clear" buttons in a multi-select popover footer (same look, so it wasn't worth a second class name) |
| `.filter-popover__hint` | Muted helper text ("Up to 6") |
| `.filter-preset-list` / `.filter-preset` | Date-range preset rows (All time, Last month, Last 3/6/12 months, YTD, Custom) — "Last month" is the single most recent month with data, not the current calendar month (which may have none yet), and is the default on first load and after Reset (a multi-year "All time" view isn't the useful thing to land on) |
| `.filter-preset__check` | The ✓ mark, visible only on `.filter-preset--selected` |
| `.filter-preset-custom` | Wraps the custom-range picker: a "From" row and a "To" row, stacked |
| `.filter-date-pair-row` | One of those two rows: a small "From"/"To" label + a Month `<select>` + a Year `<select>` |
| `.filter-date-pair-row__label` | The "From"/"To" label itself, given a fixed `min-width` so both rows' selects line up |
| `.filter-date-select` | Either select in a pair. Month and Year are separate controls (not one combined "July 2026" list) — not every month/year combination the two selects can produce necessarily has data, so picking one snaps to whichever real month is numerically closest (`nearestMonthKey` in `createDateRangeControl`) rather than silently doing nothing |
| `.filter-date-select--year` | Narrower fixed width for the Year select specifically, since Month needs more room for names like "September" |
| `.filter-segmented` / `.filter-segmented__option` / `--selected` | The GGR / Turnover / Margin % / Market Share % toggle, the Operator share card's local GGR/Turnover and Stacked/Lines toggles, and the Operator leaderboard's Total/By channel/By vertical toggle. Note: the `:hover` rule is scoped `:not(.filter-segmented__option--selected)` — without that, `:hover` (specificity 0,2,0) beats `--selected` (0,1,0) and the selected button loses its accent fill whenever the pointer is still on it, which is the normal case right after a click. `:disabled` (used by the leaderboard toggle when a split mode doesn't apply to the current filters) is muted and non-interactive but stays visible with a `title` tooltip explaining why, rather than vanishing |
| `.filter-reset` | "Reset filters" text button, right-aligned |
| `.filter-fab` | Mobile-only floating button (bottom-right, hidden ≥860px) that toggles the filter bar's bottom sheet — see the note below. Stays on screen (and on top: `z-index` above the sheet) while the sheet is open specifically so it can double as the close button; its glyph swaps ⚙ ↔ ✕ to signal which tap it's about to do |
| `.filter-sheet-backdrop` / `--visible` | Full-viewport dimming layer behind the open sheet; also closes it on click |
| `.filter-bar--sheet-open` | Applied to `#filter-bar` itself while the mobile sheet is open — slides it in via `transform: translateY(...)` |

**Below 860px, `#filter-bar` becomes a bottom sheet instead of an inline
row** (`js/app.js` `setupFilterSheet()`, CSS in §14). It's the *same*
`#filter-bar` element and the *same* control instances built once in
`buildFilterBar()` — only its position/transform change at the breakpoint,
so there's no second copy of the filter logic to keep in sync. Opening
pushes a throwaway `history` entry so the device's back button closes the
sheet instead of leaving the page (the one hard requirement for this
pattern); closing via the backdrop or the FAB itself has to consume that
same entry (`history.back()`) so a stray extra back-press isn't left
over — otherwise the *next* real back-press would silently do nothing
instead of leaving the page, since it'd just be popping an already-inert
sheet-closed entry. Popovers inside the sheet switch from `position:
absolute` to `position: static` (`.filter-bar .filter-popover` override) so
they flow in place below their trigger instead of floating — the fixed
desktop popover width (built for a wide inline row) was overflowing past
the screen edge on narrow viewports before this, which is what "the search
dropdown goes beyond the container" was.

**Every filter/view choice is reflected in the URL** (`app.js` `syncURL()` /
the `urlParams` block in `boot()`), via `history.replaceState` — no history
spam, just live-updates the current entry. Covers date range, verticals,
channels, compare-operators (in selection order, so a shared link reproduces
the same colors), the metric toggle, the Operator-share GGR/Turnover basis
and Stacked/Lines view, the leaderboard split mode, each Growth card's
MoM/YoY toggle, and the active tab. Read back on load with
validation against the current dataset (unknown month keys / operator names
/ enum values fall back to defaults instead of throwing — protects against a
stale link after the sheet's shape changes). `createDateRangeControl` was
changed to seed itself from the `value` passed in (matching it to a preset,
or "custom") instead of always resetting to "all time" on construction —
that reset was silently clobbering a URL-restored range the moment the
filter bar was built.

**Scroll position is explicitly preserved across `render()`.** Every filter
change clears and rebuilds each chart card in sequence (not diffed), so
partway through a render the page is transiently shorter than either its
start or end height. If the page was scrolled past that transient height,
the browser clamps `scrollY` down right then and does **not** restore it
once the content regrows — even though the final height matches where you
started. `render()` saves `window.scrollY` before rebuilding and restores it
after (`js/app.js`), which is the actual fix; `overflow-anchor: none` on
`html`/`body` (`css/styles.css`) is kept alongside it as cheap insurance
against unrelated anchor-driven jumps, but it was not what was causing this
one — that turned out to be the "shrinks then clamps" behavior above, not
scroll anchoring, which only matters for content whose *final* size differs
from where it started.

**Every static asset URL carries a `?v=` cache-busting marker** — the two
tags in `index.html` and all 4 imports at the top of `js/app.js` (its only
file with imports; nothing else in `js/` imports anything, so that's the
complete list). GitHub Pages' CDN caches each file independently for
several minutes; without a version marker, a visitor loading the site right
after a deploy can end up with a mix of fresh and stale files — e.g. new
markup running against an old cached `components.js` that still has an
already-fixed bug. Bump all 6 occurrences together, to the same value, on
every deploy.

---

## 4. KPI row

| Class | What it is |
|---|---|
| `.kpi-row` | Responsive grid of stat tiles |
| `.stat-tile` | One card (Total GGR, Total Turnover, …) |
| `.stat-tile__label` | Small uppercase label |
| `.stat-tile__value` | The big number |
| `.stat-tile__delta` + `--good` / `--bad` / `--flat` | The "▲ 6.6% vs prior month" line; color depends on direction |
| `.stat-tile__delta-caption` | The muted trailing text in that line ("vs prior month") |
| `.delta-glyph-up` / `-down` / `-flat` | Adds the ▲ / ▼ / — character via `::before` (kept out of `textContent` so screen readers get the number, not a glyph-only cue) |

---

## 5. Chart cards

| Class | What it is |
|---|---|
| `.chart-grid` + `--1col` / `--2col` | Grid wrapper that lays out 1 or 2 cards per row (collapses to 1 under 860px) |
| `.chart-card` | The white/dark card shell around every chart |
| `.chart-card__header` | Title row on the left, controls (optional local toggle + "View as table") on the right. `flex-wrap: wrap` (not a forced column stack) — controls drop below the title only when they don't actually fit on one line; a plain card with just the table button stays on one row even on a phone, since there's nothing there that needs the extra height |
| `.chart-card__title-row` | Wraps the `<h3>` title and its (i) info button |
| `.chart-card__title` | Chart title, e.g. "Market trend by vertical" |
| `.chart-card__controls` | Right-side cluster in the header: an optional `extra` node — or array of nodes, e.g. Operator share's local GGR/Turnover toggle *and* its Stacked/Lines view toggle side by side — plus the table-view button |
| `.chart-card__caption` | Used in two places with different weight: as the always-visible "N row(s)" summary line in the Data Quality tables, and as the *content* rendered inside a chart's `.info-popover` (see below) — never as permanent text on a dashboard chart card anymore |
| `.chart-card__empty` | Centered placeholder text when a chart has nothing to show (e.g. no operators picked yet) |
| `.info-button-wrap` / `.info-button` / `.info-popover` | The "ⓘ" next to a chart title and its popover — `buildCardShell`'s `caption` text now lives here instead of as permanent on-card text, decluttering the default view. Opens on click/tap (works on touch) and on desktop hover; click always *opens* rather than toggles, since a toggle would fight the hover handler (a mouse click fires `mouseenter` before `click`, so a naive toggle would immediately re-close what hover just opened) |
| `.table-toggle` / `--active` | The "View as table" / "View as chart" button on every card. `:hover` is scoped `:not(.table-toggle--active)` for the same reason as the segmented control |

**Every trend-over-time card falls back to something else when the date
range narrows to a single month** (`js/app.js`, one `singleMonth` const
computed once near the top of `render()` and checked in each card's own
block). A time-series chart with one point on the x-axis has nothing to
show a trend of — worse, a single-point line is a real `<path>` with a
zero-size bounding box (`M x,y`, no `L` segment), so it renders *nothing*
rather than something obviously degenerate, which is exactly why this
looked like "the chart is empty" rather than a scaling/design problem.
Market trend, Operator share, and Compared-operators trend all switch to a
`renderBarChart` breakdown for that one month instead (Market trend by
vertical; Operator share and Compared-operators trend by whichever
operators are in view). Compared-operators-vs-market can't take the same
fallback — an indexed-to-100 trajectory has no single-month equivalent to
fall back to — so it shows an explanatory empty state instead. Operator
share's Stacked/Lines toggle is disabled (with a `title` explaining why) in
this state, since neither mode means anything for a single data point.

**"Growth by vertical" and "Growth by channel"** (`js/app.js`, in the same
"Market overview" section) always show something regardless of whether any
operator is selected in "Compare operators" — that section is a separate
concern (per-operator trend), while these are market-level questions. Both
are always GGR-based (a local MoM/YoY toggle, not the page metric toggle —
same reasoning as the Year-over-year KPI tile: Margin %/Share % aren't
quantities you take a period-over-period delta of). Fixing the default date
range to "Last month" (above) surfaced a real bug in `momPercent`: it used
to compute "latest vs. prior" only from months inside the *currently
selected range* — fine when the default was "All time," but with a
one-month range there's no second month in range to compare against, so
every MoM figure (including the existing top KPI tiles, not just these new
cards) silently went blank. `momPercent` now takes a scope predicate and
looks at the actual preceding calendar month directly via `allMonths`/
`records`, the same way `yoyPercent` already looked at the actual same
month last year — the "latest" side still respects the date range, only the
comparison anchor doesn't, matching `yoyPercent`'s existing behavior
exactly. Same `momScope`/`yoyScope` predicate pattern powers both: default
scope is the page-wide vertical/channel filters, and each Growth-card row
narrows it to just that one vertical or channel.

---

## 6. SVG chart internals (`js/charts.js`)

All hand-drawn — no charting library. Every `<svg>` uses a fixed `viewBox`
and scales via CSS width, so one code path serves desktop and mobile.

| Class | What it is |
|---|---|
| `.viz-svg` | The `<svg>` root for line/bar charts. Its `viewBox` width is set in JS to the card's *measured* pixel width (`measureWidth()` in `charts.js`) rather than a fixed constant — that's what keeps font/stroke sizes visually consistent whether the chart sits in a 1-column or 2-column card |
| `.viz-svg--fixed` | Added alongside `.viz-svg` on heatmap panels only — keeps their natural cell size instead of stretching to fill a wide card |
| `.viz-gridline` | Horizontal gridlines |
| `.viz-axis-line` | The solid x/y axis lines |
| `.viz-axis-label` + `--x` / `--y` | Tick labels. X-axis labels use evenly-spaced indices (`evenlySpacedIndices()`), never a modulo step, so the last label never crowds the one before it |
| `.viz-baseline` | The dashed "100" reference line on the indexed vs.-market chart |
| `.viz-line` | A line-chart stroke (compare-operators trend, vs.-market index) |
| `.viz-area` | A stacked-area fill (market trend, operator share) |
| `.viz-area-stack-gap` | Adds the 2px surface-colored stroke that separates stacked segments |
| `.viz-marker` | The small circle that appears on a line at the hovered month |
| `.viz-crosshair-line` | The dashed vertical hover line |
| `.viz-hit-rect` | Invisible pointer-capture layer (one per chart, or one per bar/cell) |
| `.viz-bar` | A leaderboard bar — a single rounded rect in "Total" mode, or one rect per segment (square-cornered, see `.viz-bar-segment`) in the By channel/By vertical modes |
| `.viz-bar-segment` | Added alongside `.viz-bar` for each piece of a multi-segment (stacked) bar; adds the thin surface-colored gap stroke between segments |
| `.viz-bar--dim` | Applied to a bar/area/label when its legend entry is toggled off, or (leaderboard split modes only) to every row whose operator isn't in the "Compare operators" set — segment colors there are fixed to channel/vertical identity, not operator identity, so dimming the whole row is how those modes show emphasis instead |
| `.viz-bar-label` | The value printed at the end of a bar (the row's total, i.e. sum of its segments) — optionally followed by `(N%)` when an item carries a `note` (e.g. the single-month Market trend breakdown adds each vertical's % of the total alongside its € figure). `renderBarChart` widens its own right margin (`marginR`, 64px → 130px) whenever any item has a `note`, since the longer combined text overflowed past the card's own edge at the old margin — the SVG doesn't clip content by default |
| `.viz-bar-category-label` | The row's category name to the left of a bar — an operator name for the Operator leaderboard, but `renderBarChart` (`js/charts.js`) is generic: any caller can hand it `{ operator: <any label>, segments }` rows and pass `categoryLabel`/`chartLabel` to relabel the axis/table/aria-text for what those rows actually are. Left-aligned (`text-anchor: start`) at the card's left edge, not right-aligned against the bar — a right-aligned shared column left a dead gap before any label shorter than the longest one in the set (e.g. "Casino" next to "Horse Racing Fixed Odds"); left-aligned, that same slack falls after the label instead, reading as normal column spacing rather than a gap. Its column width (`labelColW`) is still sized to the longest label actually present (capped at the same width the old fixed constant used), so the bars all still start at one consistent x regardless of alignment |
| `.viz-diverging-bar` + `--pos` / `--neg` | Bars in `renderDivergingBarChart` (Growth by vertical/channel, `js/charts.js`) — grow left/right from a center 0% line instead of from a shared left edge. `--pos`/`--neg` carry `--delta-good`/`--delta-bad`, not a categorical hue: growth direction is a *state* (growing vs. shrinking), and the dataviz color rule for a series that means good/bad is "wears status/delta tokens, never categorical," so it reuses the exact pair the KPI tiles already use for the same meaning rather than a fresh diverging pair |
| `.viz-bar-label--good` / `--bad` | Growth-chart value-label ink, same `--delta-good`/`--delta-bad` pair as the bars — every value also carries its own `+`/`-` sign, which is the required label pairing for a state/status color (never color alone) |
| `.viz-cell` | One heatmap cell (vertical × channel) |
| `.viz-cell-label` | The value text inside a cell |
| `.viz-heatmap-row-label` / `-col-label` | Row (vertical) / column (channel) headers on a heatmap |
| `.cell-ink-light` / `.cell-ink-dark` | Chooses white vs. dark text inside a heatmap cell so it stays readable against that cell's fill (picked per-cell in `charts.js` from the cell's `seq-*` step). Both are **fixed hex, not theme tokens** — `cell-ink-dark` used to read `var(--text-primary)`, which is white in dark mode, so on a pale cell both "dark ink" and "light ink" rendered white-on-white; it's hardcoded to `#0b0b0b` now |

---

## 7. Series color utility classes

These are the *only* place a chart mark's color is set — always as a class,
never as an inline `fill`/`stroke`. Two independent scales:

**Categorical** (`series-1` … `series-8`, plus `series-other`) — identity.
Fixed hue order, assigned in sequence, never cycled:

| Class | Light hex | Dark hex | Hue |
|---|---|---|---|
| `.series-1` | `#2a78d6` | `#3987e5` | blue |
| `.series-2` | `#eb6834` | `#d95926` | orange |
| `.series-3` | `#1baf7a` | `#199e70` | aqua |
| `.series-4` | `#eda100` | `#c98500` | yellow |
| `.series-5` | `#e87ba4` | `#d55181` | magenta |
| `.series-6` | `#008300` | `#008300` | green |
| `.series-7` | `#4a3aa7` | `#9085e9` | violet |
| `.series-8` | `#e34948` | `#e66767` | red |
| `.series-other` | `#b3b2ac` | `#5c5b56` | neutral grey — "Other" fold-in bucket, and non-highlighted bars when a compare-set is active |

Assignment logic (in `charts.js`):
- **Verticals** (Market trend chart, and the swatch in the Vertical filter) get
  `series-1`…`series-7` in the fixed order Casino → Sportsbetting → Virtuals →
  Horse Racing Fixed Odds → Horse Racing Tote → Poker Cash → Poker Tournament.
- **Operators** (Operator share chart, compare-operators trend + swatches in
  that filter, the vs.-market indexed chart, and the highlighted bars in the
  leaderboard) all get a class from a stable hash of the operator's name, so
  a given operator keeps the same color in every chart on the page and
  regardless of which other operators are selected alongside it. On the
  Operator share chart, the 8th-and-smaller operators by volume fold into
  `series-other` labeled "Other"; the "Market (all operators)" reference
  line on the vs.-market chart also uses `series-other`, since it's context
  rather than an entity being compared.

**Sequential** (`seq-100` … `seq-700`) — magnitude, one hue (blue), light→dark.
Used only by the vertical × channel heatmap; a cell's value is bucketed into
one of the 7 steps relative to that operator's own max value in the panel.
For GGR/Turnover this bucketing is **log-scaled** (`heatmapRatio()` in
`charts.js`), not linear — one dominant vertical is common (e.g. Sportsbetting
massively outweighing Poker for most operators), and a linear ratio crushes
every smaller cell to the palest step, reading as "one dark cell, rest blank".
Margin % and Market Share % stay linear since they're already bounded 0–100
and don't have that long-tail problem.

| Class | Hex |
|---|---|
| `.seq-100` | `#cde2fb` |
| `.seq-200` | `#9ec5f4` |
| `.seq-300` | `#6da7ec` |
| `.seq-400` | `#3987e5` |
| `.seq-500` | `#256abf` |
| `.seq-600` | `#184f95` |
| `.seq-700` | `#0d366b` |

---

## 8. Legend, tooltip, table view

| Class | What it is |
|---|---|
| `.viz-legend` | Row of legend entries under a chart |
| `.viz-legend-item` / `--dimmed` | One clickable legend entry (click to isolate/toggle a series) |
| `.viz-legend-swatch` / `--line` | The color swatch in a legend entry (square for areas/bars, short line for line charts) |
| `.tooltip` | The single shared floating tooltip (`#viz-tooltip` in `index.html`, positioned via JS) |
| `.tooltip__title` | Tooltip's bold first line (the month or category name) |
| `.tooltip__row` | One series row inside the tooltip |
| `.tooltip__row-key` | Small color line identifying the series in that row |
| `.tooltip__row-label` / `.tooltip__row-value` | Series name (secondary weight) / its value (bold — values lead, labels follow) |
| `.viz-table-wrap` | Horizontal-scroll wrapper around a table-view `<table>` |
| `.viz-table` | The table itself (the accessibility twin of every chart) |

---

## 9. Data Quality tab (`js/quality.js`, rendered by `app.js`)

Reuses `.dashboard-section` / `.chart-card` / `.viz-table*` / `.stat-tile`
from above for its layout — only the dismiss mechanism is new:

| Class | What it is |
|---|---|
| `.quality-row--dismissed` | Applied to a `<tr>` whose finding was marked "Not an issue" — 45% opacity, stays visible (never removed from the table) so there's a visible trail back via its "Restore" button |
| `.quality-dismiss-btn` | The "Not an issue" / "Restore" button in each finding row's last column |

Dismissal is per-finding, keyed by a stable string (e.g.
`dup:2026-07:GOLDBET:Casino:Online`) stored in `localStorage` under
`gamdata-quality-dismissed` — it survives reloads, since the sheet
re-generates the same finding every time otherwise. The `.tab-nav__item-badge`
count only counts non-dismissed findings.

---

## How to hand me changes

Since every visual is a class, a request like *"make `.stat-tile__value` bigger on mobile"*
or *"change `--series-4` to a different yellow"* maps directly to one edit in
`styles.css` — say it like that and I'll know exactly what to touch. If you
want a new visual that doesn't have a class yet, say what it's near (e.g.
"next to the leaderboard title") and I'll add both the class and its row in
this table.
