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

---

## 1. Color tokens

Defined once as CSS custom properties on `:root` (light values), then
re-declared under `@media (prefers-color-scheme: dark)` and again under
`:root[data-theme="dark"]` (the in-page ☽/☀ toggle in the header, persisted
to `localStorage`). Both dark blocks carry identical values — the media
query covers OS-level dark mode, the `data-theme` attribute covers the
manual toggle overriding it either way.

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
| `--delta-good` | `#006300` | `#0ca30c` | KPI tile up-arrow text (metric improved) |
| `--delta-bad` | `#d03b3b` | `#d03b3b` | KPI tile down-arrow text (metric worsened) |
| `--status-good/warning/serious/critical` | see file | see file | Reserved status scale — `--status-warning` backs the data-quality warning banner; the rest are available for future alerting |
| `--series-1`…`--series-8` | palette hues | palette hues | Categorical identity (verticals, operators, groups) — see §7 |
| `--series-other` | `#b3b2ac` | `#5c5b56` | "Other" fold-in bucket + de-emphasized bars |
| `--seq-100`…`--seq-700` | blue ramp | same | Sequential magnitude (heatmap cells) — see §7 |
| `--accent` | = `--series-1` | = `--series-1` | Primary interactive accent: selected filter chips, active toggle, focus ring badge |

**Where a color is chosen at runtime** (not a fixed token): `charts.js`
assigns a `series-N` class per operator via a stable hash of the operator's
name, and per vertical via its fixed position in `VERTICAL_ORDER` (`js/data.js`).
This is deliberate — see the comment in `charts.js` — so a given operator or
vertical always gets the same color no matter what else is selected.

---

## 2. Layout shell

| Class | What it is | Used in |
|---|---|---|
| `.app-header` | Sticky top bar | `index.html` `<header>` |
| `.app-header__row` | Max-width flex row inside the header | same |
| `.app-header__titles` | Wraps title + subtitle | same |
| `.app-header__title` | "Italy Gaming Market" | same |
| `.app-header__subtitle` | Tagline, hidden under 860px | same |
| `.app-header__actions` | Right-side cluster (last-updated + theme button) | same |
| `.app-header__updated` | "Data through …" text, hidden under 480px | same, set by `app.js` |
| `.icon-button` / `.icon-button__glyph` | Circular theme-toggle button + its glyph span | header `#theme-toggle` |
| `.status-banner` + `--loading` / `--error` / `--warning` | Fetch status / data-quality message above the filter bar (`--warning` is the duplicate-rows notice) | `app.js` `showStatus()` |
| `.status-banner__title` | Bold first line of the banner | same |
| `.app-main` | Centered column, holds every section | `index.html` `<main>` |
| `.dashboard-section` | One titled block ("Market overview", "Operator compare") | same |
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
| `.filter-trigger--active` | Applied while that control's popover is open |
| `.filter-trigger__count` | Small numeric badge on the trigger (e.g. "6") |
| `.filter-trigger__chevron` | The ▾ glyph |
| `.filter-popover` / `--wide` | The dropdown panel; `--wide` variant for the operator picker (has a meta column) |
| `.filter-search` | Text input at the top of a popover with >8 options (Vertical, Operator) |
| `.filter-option-list` | Scrollable list of checkboxes inside a popover |
| `.filter-option` | One checkbox row |
| `.filter-option--disabled` | Dimmed state once a `max` cap (operators: 6) is reached |
| `.filter-option__swatch` | Small color square before a vertical/operator name, tied to its `series-N` |
| `.filter-option__label` | The option's text, ellipsis-truncated if too long |
| `.filter-option__meta` | Secondary text after the label (operator's group name) |
| `.filter-popover__footer` | Row holding Clear + the "Up to N" hint |
| `.filter-popover__clear` | The small "Clear" button in a multi-select popover footer |
| `.filter-popover__hint` | Muted helper text ("Up to 6") |
| `.filter-preset-list` / `.filter-preset` | Date-range preset rows (All time, Last 3/6/12 months, YTD, Custom) |
| `.filter-preset__check` | The ✓ mark, visible only on `.filter-preset--selected` |
| `.filter-preset-custom` | Footer row holding the two custom month `<select>`s |
| `.filter-date-select` | Each of those two `<select>` elements |
| `.filter-segmented` / `.filter-segmented__option` / `--selected` | The GGR / Turnover / Margin % toggle |
| `.filter-reset` | "Reset filters" text button, right-aligned |

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
| `.chart-card__header` | Title + caption on the left, "View as table" button on the right |
| `.chart-card__title` | Chart title, e.g. "Market trend by vertical" |
| `.chart-card__caption` | One-line description under the title |
| `.chart-card__empty` | Centered placeholder text when a chart has nothing to show (e.g. no operators picked yet) |
| `.table-toggle` / `--active` | The "View as table" / "View as chart" button on every card |

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
| `.viz-bar` | A leaderboard bar |
| `.viz-bar--dim` | Applied to a bar/area when its legend entry is toggled off |
| `.viz-bar-label` | The value printed at the end of a bar |
| `.viz-bar-category-label` | The operator name to the left of a bar |
| `.viz-cell` | One heatmap cell (vertical × channel) |
| `.viz-cell-label` | The value text inside a cell |
| `.viz-heatmap-row-label` / `-col-label` | Row (vertical) / column (channel) headers on a heatmap |
| `.cell-ink-light` / `.cell-ink-dark` | Chooses white vs. dark text inside a heatmap cell so it stays readable against that cell's fill (picked per-cell in `charts.js` from the cell's `seq-*` step) |

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
one of the 7 steps relative to that operator's own max value.

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

## How to hand me changes

Since every visual is a class, a request like *"make `.stat-tile__value` bigger on mobile"*
or *"change `--series-4` to a different yellow"* maps directly to one edit in
`styles.css` — say it like that and I'll know exactly what to touch. If you
want a new visual that doesn't have a class yet, say what it's near (e.g.
"next to the leaderboard title") and I'll add both the class and its row in
this table.
