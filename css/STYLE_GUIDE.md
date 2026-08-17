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

**User-facing copy** (captions, titles, empty states, tooltip/table
labels, Data Quality descriptions) is short, plain sentences — no em
dashes, no stacked parentheticals, nothing that reads like it was written
to sound impressive rather than to be understood on a first read. Prefer
two short sentences over one long one joined by a dash.

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
| `--delta-good` | `#006300` | `#0ca30c` | KPI tile up-arrow text (metric improved); also the Growth-by-operator/-vertical/-channel diverging bars' positive fill + value-label ink (`.viz-diverging-bar--pos`, `.viz-bar-label--good`) — same meaning (growing vs. shrinking), so the same token, not a fresh diverging pair |
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
it's never wired to "Operators" — it always auto-picks the top 7 by
Online Sportsbetting GGR within the selected date range (regardless of the
Vertical/Channel filters elsewhere) and colors that ranking with
`rankColorClass` in ranked order. `charts.js` still exports a
`operatorColorClass(name)` stable-hash function, but it's used only for the
"Operators" *picker's* preview swatches (a static list of every
possible choice, not a set of entities being actively compared side by
side) — it used to also color the compare-set charts, but a hash into 8
slots collides constantly once more than 2-3 operators are involved (two
compared operators could render as the literal same color, which defeats
the entire point of "compare"). Position-based coloring is collision-free
by construction up to 8 selections (`rankColorClass` falls back to the
neutral `series-other` grey past that, same as the "Other" fold-in bucket,
rather than colliding); prefer it over the hash for any new "identity
color" need. The "Operators" filter itself has no selection cap (removed
along with its old 6-operator limit — see the `.filter-segmented` /
Growth-by-operator notes below), so past 8 picks the trend/matrix charts'
extra lines fall back to that same grey rather than losing legibility to
color collisions; that's an accepted tradeoff for letting someone pick
more than a handful.

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
| `.tab-nav` / `.tab-nav__item` / `--active` | Dashboard ↔ Data Quality switcher in the header. Same `:not(--active):hover` scoping as the segmented control. Has `hidden` in the HTML by default — `setupAuth()` in `app.js` is what removes it, and only once a signed-in user's email comes back on the Sheet's "allowlist" tab. A signed-out (or non-allowlisted) visitor never sees this switcher exists, and typing `?tab=quality` doesn't reveal it either — see the Data Quality login section below | header, `app.js` `setupTabs()`, `setupAuth()` |
| `.tab-nav__item-badge` | Small count pill on the "Data Quality" tab button — active (non-dismissed) finding count. Removed entirely when the count is 0 | `app.js` `updateQualityBadge()` |
| `.app-header__actions` | Right-side cluster: last-updated text, the Login control | same |
| `.app-header__updated` | "Data through …" text, hidden under 480px | same, set by `app.js` |
| `.auth-login-wrap` / `.auth-login-btn` / `.auth-google-overlay` | See "Data Quality login" below | same |
| `.status-banner` + `--loading` / `--error` / `--warning` | Fetch status / data-quality message above the filter bar (`--warning` is the duplicate-rows notice, sourced from `js/quality.js`) | `app.js` `showStatus()` |
| `.status-banner__title` | Bold first line of the banner | same |
| `.app-main` | Centered column, holds both tab panels | `index.html` `<main>` |
| `.tab-panel` | One of the two top-level views (`#tab-panel-dashboard`, `#tab-panel-quality`); flex column with the section gap `.app-main` used to provide directly before the tabs existed | same |
| `.dashboard-section` | One block, usually titled ("Market overview", "Operator compare", every Data Quality check) — the exception is the Growth cards' own section, deliberately untitled: it used to open with "Market overview"'s title+subtitle, which described the *next* section's charts, not these ones, so that heading moved down to sit directly above Market trend/Operator share instead of being deleted | same |
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
| `.filter-option--disabled` | Dimmed state once a `max` cap is reached — only Vertical, Channel, and Operators are all uncapped (`max` unset) now, so in practice this never triggers, but the mechanism stays generic for any future capped control. `updateOptionStates` (`js/components.js`) coerces the underlying `atCap` check to a real boolean (`!!(...)`) before handing it to `classList.toggle(cls, atCap)` — for an uncapped control, `max && …` short-circuits to `undefined`, and passing a literal `undefined` as `classList.toggle`'s second argument does **not** behave like `force: false` the way it reads; real browsers treat it as "no force given" and fall back to a blind toggle, flipping the class on every call regardless of whether anything was actually capped. That's what greyed out Vertical/Channel options with a not-allowed cursor even though nothing was ever at a cap |
| `.filter-option__swatch` | Small color square before a vertical/operator name, tied to its `series-N` |
| `.filter-option__label` | The option's text, ellipsis-truncated if too long |
| `.filter-option__meta` | Secondary text after the label (operator's group name) |
| `.filter-popover__footer` | Row holding the footer actions + the "Up to N" hint |
| `.filter-popover__footer-actions` | Groups "Select all" and "Clear" together on the footer's left side |
| `.filter-popover__clear` | Shared class for both the "Select all" and "Clear" buttons in a multi-select popover footer (same look, so it wasn't worth a second class name) |
| `.filter-popover__hint` | Muted helper text ("Up to N") — empty for every current filter (Vertical, Channel, Operators are all uncapped), but stays wired up for any future control that does need one |
| `.filter-preset-list` / `.filter-preset` | Date-range preset rows (All time, Last month, Last 3/6/12 months, YTD, Custom) — "Last month" is the single most recent month with data, not the current calendar month (which may have none yet), and is the default on first load and after Reset (a multi-year "All time" view isn't the useful thing to land on) |
| `.filter-preset__check` | The ✓ mark, visible only on `.filter-preset--selected` |
| `.filter-preset-custom` | Wraps the custom-range picker: a "From" row and a "To" row, stacked |
| `.filter-date-pair-row` | One of those two rows: a small "From"/"To" label + a Month `<select>` + a Year `<select>` |
| `.filter-date-pair-row__label` | The "From"/"To" label itself, given a fixed `min-width` so both rows' selects line up |
| `.filter-date-select` | Either select in a pair. Month and Year are separate controls (not one combined "July 2026" list) — not every month/year combination the two selects can produce necessarily has data, so picking one snaps to whichever real month is numerically closest (`nearestMonthKey` in `createDateRangeControl`) rather than silently doing nothing |
| `.filter-date-select--year` | Narrower fixed width for the Year select specifically, since Month needs more room for names like "September" |
| `.filter-segmented` / `.filter-segmented__option` / `--selected` | The GGR / Turnover / Margin % / Market Share % toggle, the Operator share card's local GGR/Turnover and Stacked/Lines toggles, Market trend by vertical's own Stacked/Lines toggle (same pattern — see below), and the Operator leaderboard's Total/By channel/By vertical toggle. Note: the `:hover` rule is scoped `:not(.filter-segmented__option--selected)` — without that, `:hover` (specificity 0,2,0) beats `--selected` (0,1,0) and the selected button loses its accent fill whenever the pointer is still on it, which is the normal case right after a click. `:disabled` (used by the leaderboard toggle when a split mode doesn't apply to the current filters, and by both Stacked/Lines toggles when a single month is selected) is muted and non-interactive but stays visible with a `title` tooltip explaining why, rather than vanishing |
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
and Stacked/Lines view, Market trend by vertical's own Stacked/Lines view,
the leaderboard split mode, the shared Growth-cards MoM/YoY period, and the
active tab. Read back on load with
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
| `.stat-tile__delta` + `--good` / `--bad` / `--flat` | The "▲ 6.6% YoY" line; color depends on direction |
| `.stat-tile__delta-caption` | The muted trailing text in that line ("YoY") |
| `.delta-glyph-up` / `-down` / `-flat` | Adds the ▲ / ▼ / — character via `::before` (kept out of `textContent` so screen readers get the number, not a glyph-only cue) |

All three tiles' delta is **YoY, not MoM** — betting volume is seasonal
(a big-tournament month against an ordinary one either side of it), so a
MoM delta conflates "did the business grow" with "is it just that time of
year again" in a way a reader can't untangle from the number alone; YoY
cancels that out by construction. There used to be a fourth tile, "Year
over year (GGR)," holding the only YoY figure on the row while the other
three showed MoM — once every tile's delta became YoY, that tile was just
duplicating what "Total GGR"'s own delta already said, so it was removed
rather than kept as a redundant fourth number.

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
| `.info-button-wrap` / `.info-button` / `.info-popover` | The "ⓘ" next to a chart title and its popover — `buildCardShell`'s `caption` text now lives here instead of as permanent on-card text, decluttering the default view. Opens on click/tap (works on touch) and on desktop hover; click always *opens* rather than toggles, since a toggle would fight the hover handler (a mouse click fires `mouseenter` before `click`, so a naive toggle would immediately re-close what hover just opened). `max-width: min(280px, calc(100vw - 24px))` so it can never claim more width than the viewport has regardless of screen size; on `open()` (`buildInfoButton`, `js/charts.js`) it also measures whether it would run off the right edge of the screen and adds `.info-popover--flip` (hang from the button's right edge instead of its left) if so — the button can sit anywhere along a card's title row, so a fixed left-anchored popover was overflowing the screen on mobile, the "have to scroll sideways to read it" bug |
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
share's and Market trend by vertical's Stacked/Lines toggles are both
disabled (with a `title` explaining why) in this state, since neither mode
means anything for a single data point — Market trend's own toggle isn't
even built in this branch, since the whole card is a different chart type
here, not just a disabled control sitting above one.

**"Growth by operator," "Growth by vertical," and "Growth by channel"**
(`js/app.js`, an untitled section of their own — see §2 — right after the
KPI row and before "Market overview") lead the dashboard: MoM/YoY is its
headline read. Growth by vertical/channel always show something regardless
of the "Operators" filter — that filter is a separate concern there
(hand-picked per-operator trend over time, further down in "Operator
compare"), while these two cards are market-wide "who/what is actually
moving right now" questions.

**Growth by operator has its own local Top 10 / Select toggle**
(`state.growthOperatorMode`), independent of the shared MoM/YoY one.
"Top 10" auto-ranks by GGR within the current filters — same convention as
the Operator leaderboard further down — regardless of what's picked in
"Operators." "Select" shows exactly the operators picked in that filter
instead, in whatever order they were picked, for comparing a specific
hand-picked set rather than whoever the market ranks highest; with nothing
picked, it shows an empty state rather than an empty chart. This is the
one card where the "Operators" filter and the market-wide framing meet —
"Select" is deliberately the only place that filter's picks drive a
Growth card, since Growth by vertical/channel have too few categories for
picking a subset to mean anything.

A vertical or channel's "share" is undefined the same way a whole's share
of itself always is: with only one vertical (or one channel) selected in
the filters, that vertical/channel *is* the total it would be a share of,
so the figure is always 100% and the MoM/YoY delta is always exactly 0%.
Rather than plot a flat chart that reads as broken, Growth by
vertical/channel show a one-line explanation instead once `state.metric
=== "share"` and the respective filter is down to a single selection.

All three share **one MoM/YoY period** (`state.growthPeriod`) — each card
still gets its own `createSegmented` toggle instance (`growthPeriodToggle()`
in `js/app.js`, called once per card), consistent with every other card's
local-controls pattern, but all three read/write the same state field, so
clicking any one re-renders all three in sync. They also follow the
page-wide metric toggle (GGR/Turnover/Margin %/Market share %), same as
every other chart — this used to be hardcoded to GGR, which was the wrong
call; the fix is `metricValueAt(monthKey, metric, scope, totalScope)`, a
small helper `momPercent`/`yoyPercent` both go through now. Every metric but
"share" is a straight `Agg.sum` over the matching records; "share" isn't a
raw record field at all — it's the category's own GGR as a percentage of a
*wider* total's GGR at that month, so it needs a second scope
(`totalScope`, defaulting to the page-wide vertical/channel filters) to know
what that wider total is.

Fixing the default date range to "Last month" surfaced a real bug in
`momPercent`: it used to compute "latest vs. prior" only from months inside
the *currently selected range* — fine when the default was "All time," but
with a one-month range there's no second month in range to compare against,
so every MoM figure (including the top KPI tiles, not just these cards)
silently went blank. `momPercent` now looks at the actual preceding
calendar month directly via `allMonths`/`records`, the same way
`yoyPercent` already looked at the actual same month last year — the
"latest" side still respects the date range, only the comparison anchor
doesn't.

A separate, much bigger bug lived one layer below all of this:
`Agg.filterRecords` (`js/aggregate.js`) destructured `dateFrom`/`dateTo` off
the `state` object it was handed, but `state`'s actual fields have always
been named `from`/`to` — so those two variables were `undefined` on every
call, the `if (dateFrom && …)` guards never fired, and `filtered` (used for
the KPI totals, the Operator leaderboard, and the Growth-by-operator "top
15" ranking) silently included every record in the dataset regardless of
the selected date range. Any chart that separately re-filters to an exact
month key (`totalsByMonth`, `monthlySeries`, `operatorTrend` — anything
that also takes a `months` array) was unaffected, since that per-month
lookup happens to correct for it; anything computed as a single
`Agg.sum`/`Agg.leaderboard`/`Agg.topKeysByTotal` straight off `filtered`
was not. Fixed by matching the destructured names to `state`'s actual
field names. There's exactly one caller, so there was no wider contract to
preserve.

---

## 6. SVG chart internals (`js/charts.js`)

All hand-drawn — no charting library. Every `<svg>` uses a fixed `viewBox`
and scales via CSS width, so one code path serves desktop and mobile.

| Class | What it is |
|---|---|
| `.viz-svg` | The `<svg>` root for line/bar charts. Its `viewBox` width is set in JS to the card's *measured* pixel width (`measureWidth()` in `charts.js`) rather than a fixed constant — that's what keeps font/stroke sizes visually consistent whether the chart sits in a 1-column or 2-column card |
| `.viz-svg--fixed` | Added alongside `.viz-svg` on heatmap panels only — keeps their natural cell size instead of stretching to fill a wide card |
| `.viz-svg--growing` | Added alongside `.viz-svg` on `renderDivergingColumns`'s chart (the column layout of `renderDivergingBarChart` — see below) — unlike `--fixed`, no `max-width` cap: this SVG is *meant* to exceed its card's width once it has enough categories, growing wider rather than compressing, and scrolling within `.viz-scroll-x` (below) rather than shrinking every column to fit |
| `.viz-scroll-x` | Horizontal-scroll wrapper around a `--growing` SVG, same idea as `.viz-table-wrap` below but for a chart instead of a table |
| `.viz-scroll-x--center` | Added alongside `.viz-scroll-x` when the columns still don't fill the card even after stretching to `maxColW` (e.g. Channel narrowed to just "Online") — centers the chart instead of leaving it pinned to the left edge with a lopsided gap on the right |
| `.viz-scroll-y` | Vertical-scroll, height-capped wrapper around `renderDivergingRows`'s chart (the row layout — see below); the row-count equivalent of `.viz-scroll-x` |
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
| `.viz-bar--dim` | Applied to a bar/area/label when its legend entry is toggled off, or (leaderboard split modes only) to every row whose operator isn't in the "Operators" set — segment colors there are fixed to channel/vertical identity, not operator identity, so dimming the whole row is how those modes show emphasis instead |
| `.viz-bar-label` | The value printed at the end of a bar (the row's total, i.e. sum of its segments) — optionally followed by `(N%)` when an item carries a `note` (e.g. the single-month Market trend breakdown adds each vertical's % of the total alongside its € figure). `renderBarChart` widens its own right margin (`marginR`, 64px → 130px) whenever any item has a `note`, since the longer combined text overflowed past the card's own edge at the old margin — the SVG doesn't clip content by default |
| `.viz-bar-category-label` | The row's category name to the left of a bar — an operator name for the Operator leaderboard, but `renderBarChart` (`js/charts.js`) is generic: any caller can hand it `{ operator: <any label>, segments }` rows and pass `categoryLabel`/`chartLabel` to relabel the axis/table/aria-text for what those rows actually are. Left-aligned (`text-anchor: start`) at the card's left edge, not right-aligned against the bar — a right-aligned shared column left a dead gap before any label shorter than the longest one in the set (e.g. "Casino" next to "Horse Racing Fixed Odds"); left-aligned, that same slack falls after the label instead, reading as normal column spacing rather than a gap. Its column width (`labelColW`) is still sized to the longest label actually present (capped at the same width the old fixed constant used), so the bars all still start at one consistent x regardless of alignment |
| `.viz-diverging-bar` + `--pos` / `--neg` | Bars in `renderDivergingBarChart` (Growth by operator/vertical/channel, `js/charts.js`) — grow up/down from a center 0% baseline instead of from a shared floor. `--pos`/`--neg` carry `--delta-good`/`--delta-bad`, not a categorical hue: growth direction is a *state* (growing vs. shrinking), and the dataviz color rule for a series that means good/bad is "wears status/delta tokens, never categorical," so it reuses the exact pair the KPI tiles already use for the same meaning rather than a fresh diverging pair. When a `metric` is passed, its tooltip and table also carry the two raw values behind the %, not just the delta — "Prior month"/"Curr. month" (MoM) or "Prev. year"/"Curr. year" (YoY) — formatted with `formatMetric`; the accessible table gains two columns for the same reason the single-month bar chart's `note` does (below): the % alone doesn't tell you whether it moved from a large base or a tiny one |
| `.viz-bar-category-label--rotated` | Modifier alongside the base `.viz-bar-category-label` class for `renderDivergingBarChart`'s x-axis labels specifically — `text-anchor: end` instead of the base class's `start`, since each label is rotated -45deg (via a per-element `transform` attribute set in JS, not CSS, since the pivot point differs per label) and needs to read back toward its own tick rather than forward past it |
| `.viz-bar-label--good` / `--bad` | Growth-chart value-label ink, same `--delta-good`/`--delta-bad` pair as the bars — every value also carries its own `+`/`-` sign, which is the required label pairing for a state/status color (never color alone) |
| `.viz-cell` | One heatmap cell (vertical × channel) |
| `.viz-cell-label` | The value text inside a cell |
| `.viz-heatmap-row-label` / `-col-label` | Row (vertical) / column (channel) headers on a heatmap |
| `.cell-ink-light` / `.cell-ink-dark` | Chooses white vs. dark text inside a heatmap cell so it stays readable against that cell's fill (picked per-cell in `charts.js` from the cell's `seq-*` step). Both are **fixed hex, not theme tokens** — `cell-ink-dark` used to read `var(--text-primary)`, which is white in dark mode, so on a pale cell both "dark ink" and "light ink" rendered white-on-white; it's hardcoded to `#0b0b0b` now |

**`renderDivergingBarChart` is vertical, not horizontal** — categories along
the bottom, bars growing up/down from a center baseline, the opposite of
every other bar chart on the dashboard. It used to be horizontal (one row
per category), which meant its *height* grew with item count; at 15
operators that pushed the card past a full screen's height on its own,
forcing a scroll through this one card before reaching anything below it.
Flipped 90°, item count grows the SVG's *width* instead, which is bounded
by wrapping it in `.viz-scroll-x` — the card's height stays fixed
regardless of category count, and most realistic counts (up to ~20 on a
normal desktop width) need no scrolling at all.

Each category label is rotated -45deg so long names (an operator, or
"Horse Racing Fixed Odds") don't collide with their neighbors in a narrow
column — the standard technique for many categories packed along one
axis. That rotation is the source of a layout gotcha worth knowing before
touching this function's margins: an end-anchored, -45deg label doesn't
just project *left* of its own tick (the reason `marginL` scales with the
longest label present, so the first item never clips against the chart's
own left edge) — it projects *down* by the same amount too, since a 45°
sweep moves equally in both directions. `marginB` has to account for that
downward sweep as well, and for a chart wrapped in a horizontal-only
scroller this matters more than it would look like it should: CSS
computes an unset `overflow-y` as `auto` the instant `overflow-x` is
anything but `visible` (there's no way to declare one axis auto and the
other visible — the "visible" side just silently becomes `auto` too), so
`.viz-scroll-x` clips vertically even though only `overflow-x` was ever
set on it. A `marginB` sized for the *average* label let the longest one's
downward sweep get clipped by that implicit vertical clip — not
truncated, not omitted from the DOM, just invisible past a certain point,
which reads exactly like a text-cutoff bug rather than a margin one.
Fixed by sizing both `marginL` and `marginB` off the same estimate
(`longestLabel * charWidth / √2`), rather than a flat constant tuned for
whatever label set happened to be on screen during testing.

**Columns don't stay pinned to their minimum width just because there's
room to spare.** A card with only 1-2 categories (Channel narrowed to
"Online," or Growth by vertical narrowed to one vertical) has far more
width available than the minimum column needs, and a tiny chart adrift in
an otherwise-empty card reads as broken, not "correctly sized." Each
column stretches to fill the card's actual measured width, capped at
`maxColW` (200px) so 1-2 categories don't turn into one absurdly fat bar,
and centered (`.viz-scroll-x--center`) if there's still slack left over
after that cap. The horizontal-scroll-plus-minimum-width layout only
kicks back in once there are enough categories that even the minimum
doesn't fit the card.

`marginR` equals `marginL` (both absorb the label-sweep buffer), not a
small fixed value — with only `marginL` padded, the SVG's own box was
centering correctly but the *bars inside it* weren't, since all the
padding sat on one side. Visually this read as "the whole chart is
shifted right," which is a real bug centering the outer box alone
can't fix, since the outer box was already exactly centered — the
content inside it was the part that was off-center.

**`renderDivergingBarChart` actually has two layouts, columns and rows**,
picked automatically by item count (`ROW_LAYOUT_THRESHOLD = 10` in
`charts.js`) — not a caller-supplied flag, since the right layout is a
function of how many categories there are, not what card is asking.
`renderDivergingColumns` is everything described above; past the
threshold, `renderDivergingRows` takes over — the pre-vertical-redesign
horizontal layout, one row per category, wrapped in `.viz-scroll-y`
instead of growing the card's height without bound. Growth by
vertical/channel never have enough categories to reach the threshold, so
they always render as columns. Growth by operator can go either way: "Top
10" is capped at 10 by definition (always columns); "Select" can exceed it
once someone picks more than 10 operators in the "Operators" filter, at
which point it switches to the row layout and scrolls *down* to see the
rest rather than sideways — the layout a hand-picked, potentially-long
list is actually suited to, versus the layout a fixed top-N ranking is
suited to. Both layouts share the same tooltip-row-building
(`tooltipRowsFor`) and the same accessible-table code at the end of
`renderDivergingBarChart`, so the two numbers-behind-the-%-figure and the
"Previous"/"New" column labels behave identically regardless of which one
rendered.

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

`renderTimeSeriesChart` accepts an optional `secondaryMetric` (plus a
per-series `secondaryValues` array parallel to `values`) so a chart whose
*plotted* axis is a percentage can still say what that percentage is a
share *of* — Market trend by vertical and Operator share both always plot
%, but the underlying € figure (GGR or Turnover, whichever the relevant
basis toggle is set to) would otherwise only live in the raw data, not
anywhere the reader can see it. Both charts combine the two into one string
— `"€122M (41.9%)"` — in the tooltip row and the table cell alike, rather
than a separate row/column per number: the % is a share *of* that €
figure, not a second independent quantity worth its own line.

---

## 9. Data Quality tab (`js/quality.js`, rendered by `app.js`)

Reuses `.dashboard-section` / `.chart-card` / `.viz-table*` / `.stat-tile`
from above for its layout — only the dismiss mechanism is new:

| Class | What it is |
|---|---|
| `.quality-row--dismissed` | Applied to a `<tr>` whose finding was marked "Not an issue" — 45% opacity, stays visible (never removed from the table) so there's a visible trail back via its "Restore" button |
| `.quality-dismiss-btn` | The "Not an issue" / "Restore" button in each finding row's last column |

Dismissal is per-finding, keyed by a stable string (e.g.
`dup:2026-07:GOLDBET:Casino:Online`) — it survives reloads, since the sheet
re-generates the same finding every time otherwise. The `.tab-nav__item-badge`
count only counts non-dismissed findings.

**Dismissal state is shared, not per-browser.** It used to live in each
visitor's own `localStorage`, so one person marking a finding "not an
issue" meant nothing to anyone else. It now lives in a `dismissed` tab on
the same Google Sheet the dashboard already reads from, read and written
through a small Apps Script Web App (`backend/quality-storage.gs`,
deployment steps in `backend/SETUP.md`) — `backendGet`/`backendPost` in
`app.js` are the only two functions that talk to it. `backendPost` sends
its body as `text/plain`, not `application/json` — Apps Script Web Apps
never answer a CORS preflight request, and a JSON content type is exactly
what makes the browser send one; `text/plain` counts as a "simple"
request under the CORS spec and skips it, and the backend
`JSON.parse`s the body regardless of what content type it arrived
labeled as.

**Data Quality login.** The whole tab is gated behind Google sign-in —
not just hidden with CSS, actually never rendered — because dismissal
state (and the findings themselves) shouldn't be a click away for
whoever loads the public dashboard. `setupAuth()` in `app.js` wires up
Google Identity Services: `#tab-nav` carries `hidden` in the HTML by
default and `setupAuth()` is the only thing that clears it, and only
after the backend confirms the signed-in email is on the Sheet's
`allowlist` tab. `?tab=quality` in the URL is captured but deliberately
not acted on until that same check passes — `boot()` always starts
`activeTab` at `"dashboard"` regardless of the URL, and only calls
`tabs.activate("quality")` from inside `setupAuth`'s success callback.
A signed-out visitor, or a signed-in one whose email isn't on the
allowlist, gets the Dashboard and nothing that hints Data Quality
exists — same outcome whether they never noticed the tab or tried the
URL param directly. The check itself happens once per sign-in (an ID
token verified server-side against Google's own tokeninfo endpoint,
inside `quality-storage.gs`), not via anything decidable client-side,
so there's nothing to spoof by editing local JS or storage.

The underlying rows the checks are computed from are still the same
public Sheet the Dashboard tab reads either way — this login gate keeps
the tab out of the app for anyone not approved, it doesn't make that
data itself secret from someone willing to fetch the sheet's public CSV
directly. Worth knowing before assuming this is a stronger guarantee
than it is.

| Class | What it is |
|---|---|
| `.auth-login-wrap` | `position: relative` wrapper holding both halves of the sign-in control |
| `.auth-login-btn` | The visible "Login" pill — a plain decorative `<span>`, not a real button. Styled to match `.filter-trigger` |
| `.auth-google-overlay` | Google's own rendered sign-in button, `position: absolute; inset: 0; opacity: 0`, stacked on top of `.auth-login-btn`. A real click lands on Google's actual interactive element (satisfying whatever "was this a genuine user gesture" checks the sign-in flow does), while the visitor only ever sees "Login" — `renderButton`'s own `text` option is a fixed enum (`signin_with` / `signup_with` / `continue_with` / `signin`) with nothing that reads as plain "Login", so this overlay trick is what gets that exact label |

**Staying signed in across a reload isn't done by saving the ID token.**
Google ID tokens are short-lived (about an hour) by design, so persisting
one in `localStorage` and reusing it later isn't the intended pattern —
it would just start silently failing once it expired. The actual fix is
`initialize({ ..., auto_select: true })` plus calling `prompt()` on every
load in `setupAuth()`: if there's still an active Google session and the
visitor picked an account here before, Google re-issues a fresh token
and fires the callback on its own, often with no visible UI at all
(occasionally a small One Tap banner if silent reuse isn't possible for
that browser/cookie state) — reload-proof without the app ever handling
a stored credential itself.

**A signed-in-but-not-allowlisted account gets a modal, not inline
text.** A small "Signed in as x@y.com, no Data Quality access" line
next to the Login button was easy to miss and read as a stray error
rather than a clear answer. `#auth-denied-backdrop`/`#auth-denied-body`
in `index.html`, shown from the same `setupAuth()` callback. One
wrinkle from `auto_select` (above): it can silently re-fire this exact
callback on every page load for someone who stays signed into a
non-approved Google account, and popping the modal every single reload
for that would be worse than what it replaced — so it only shows when
`response.select_by !== "auto"`, i.e. an actual sign-in action, not a
silent background re-check.

| Class | What it is |
|---|---|
| `.modal-backdrop` | Full-viewport dim layer, centers its `.modal` child with flexbox. Reused for any future modal, not specific to the auth-denied one |
| `.modal` | The white/dark card itself, `max-width: 360px` |
| `.modal__title` / `.modal__body` | Heading and message text |
| `.modal__close` | Full-width accent-filled button — the only way to dismiss it, deliberately no backdrop-click-to-close, so the message has to be actually read and acknowledged rather than reflexively clicked away |

---

## How to hand me changes

Since every visual is a class, a request like *"make `.stat-tile__value` bigger on mobile"*
or *"change `--series-4` to a different yellow"* maps directly to one edit in
`styles.css` — say it like that and I'll know exactly what to touch. If you
want a new visual that doesn't have a class yet, say what it's near (e.g.
"next to the leaderboard title") and I'll add both the class and its row in
this table.
