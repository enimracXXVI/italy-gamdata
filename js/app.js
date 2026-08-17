// js/app.js — bootstraps the dashboard: fetch the sheet, build the filter
// bar, and re-render every chart/tile whenever the filter state changes.
//
// The `?v=` on every import below (and on the two tags in index.html) is
// cache-busting: GitHub Pages' CDN caches each static file independently for
// several minutes, so without a version marker a fresh deploy can leave a
// visitor's browser mixing new files with a stale cached one — e.g. running
// new markup/CSS against an old cached components.js, silently resurrecting
// an already-fixed bug. Bump every `v=` value together on every deploy (all
// 6 occurrences: this file's 4 imports + the 2 tags in index.html).

import {
  loadRecords, distinctMonths, distinctOperators, distinctVerticals, CHANNEL_ORDER,
} from "./data.js?v=202608171833";
import * as Agg from "./aggregate.js?v=202608171833";
import * as Charts from "./charts.js?v=202608171833";
import * as Quality from "./quality.js?v=202608171833";
import { createMultiSelect, createDateRangeControl, createSegmented, createResetButton } from "./components.js?v=202608171833";

const statusBanner = document.getElementById("status-banner");
const filterBar = document.getElementById("filter-bar");
const kpiRow = document.getElementById("kpi-row");
const lastUpdatedEl = document.getElementById("last-updated");

const cards = {
  verticalTrend: document.getElementById("card-vertical-trend"),
  operatorShare: document.getElementById("card-group-share"),
  growthOperator: document.getElementById("card-growth-operator"),
  growthVertical: document.getElementById("card-growth-vertical"),
  growthChannel: document.getElementById("card-growth-channel"),
  leaderboard: document.getElementById("card-leaderboard"),
  compareTrend: document.getElementById("card-compare-trend"),
  compareIndexed: document.getElementById("card-compare-indexed"),
  compareMatrix: document.getElementById("card-compare-matrix"),
};
const compareSection = document.getElementById("section-compare");

function showStatus(kind, title, detail) {
  statusBanner.hidden = false;
  statusBanner.className = `status-banner status-banner--${kind}`;
  statusBanner.innerHTML = "";
  const t = document.createElement("div");
  t.className = "status-banner__title";
  t.textContent = title;
  statusBanner.appendChild(t);
  if (detail) {
    const d = document.createElement("div");
    d.textContent = detail;
    statusBanner.appendChild(d);
  }
}
function hideStatus() { statusBanner.hidden = true; }

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function setupTabs(initialTab, onChange = () => {}) {
  const dashboardBtn = document.getElementById("tab-btn-dashboard");
  const qualityBtn = document.getElementById("tab-btn-quality");
  const dashboardPanel = document.getElementById("tab-panel-dashboard");
  const qualityPanel = document.getElementById("tab-panel-quality");
  function activate(tab) {
    const isDashboard = tab === "dashboard";
    dashboardPanel.hidden = !isDashboard;
    qualityPanel.hidden = isDashboard;
    dashboardBtn.classList.toggle("tab-nav__item--active", isDashboard);
    qualityBtn.classList.toggle("tab-nav__item--active", !isDashboard);
    onChange(tab);
  }
  dashboardBtn.addEventListener("click", () => activate("dashboard"));
  qualityBtn.addEventListener("click", () => activate("quality"));
  if (initialTab === "quality") activate("quality");
  return { activate };
}

// ---------------------------------------------------------------------------
// Mobile filter sheet
// Below 860px (see styles.css §14) #filter-bar is repositioned by CSS into
// a bottom sheet opened by a floating button; this just drives the
// open/close state and makes the device's back button close the sheet
// instead of leaving the page — the one explicit requirement for this
// pattern. Standard technique: opening pushes a throwaway history entry;
// back-button pops it (fires popstate, we just drop the open class);
// closing via the UI instead has to consume that same entry itself
// (history.back()) so a second back-press isn't needed afterward to
// actually leave the page.
// ---------------------------------------------------------------------------
function setupFilterSheet() {
  const fab = document.getElementById("filter-fab");
  const fabGlyph = fab.querySelector("span");
  const backdrop = document.getElementById("filter-sheet-backdrop");
  const bar = document.getElementById("filter-bar");
  let openedViaHistory = false;

  function isOpen() { return bar.classList.contains("filter-bar--sheet-open"); }
  function setOpen(open) {
    bar.classList.toggle("filter-bar--sheet-open", open);
    backdrop.classList.toggle("filter-sheet-backdrop--visible", open);
    document.body.style.overflow = open ? "hidden" : "";
    fab.setAttribute("aria-label", open ? "Close filters" : "Open filters");
    fabGlyph.textContent = open ? "✕" : "⚙";
  }
  function open() {
    if (isOpen()) return;
    setOpen(true);
    history.pushState({ filterSheet: true }, "");
    openedViaHistory = true;
  }
  function close() {
    if (!isOpen()) return;
    setOpen(false);
    if (openedViaHistory) { openedViaHistory = false; history.back(); }
  }

  // The FAB itself has to double as the close button — it stays on screen
  // once the sheet is open (covered by the backdrop otherwise doesn't read
  // as "tap this to dismiss"), so a click while open must close, not no-op.
  fab.addEventListener("click", () => (isOpen() ? close() : open()));
  backdrop.addEventListener("click", close);
  window.addEventListener("popstate", () => {
    if (isOpen()) { setOpen(false); openedViaHistory = false; }
  });
}

// ---------------------------------------------------------------------------
// Data Quality tab — gated behind Google sign-in, see setupAuth() below.
// Dismiss/restore state lives in the same Google Sheet everything else
// does (via the Apps Script backend), not per-browser localStorage, so
// one person marking a finding "not an issue" is visible to everyone.
// ---------------------------------------------------------------------------
const QUALITY_TABLE_CAP = 300;
const GOOGLE_CLIENT_ID = "1083340803022-d7t4cj6hnglmrdm2pjthlid8phu74p3e.apps.googleusercontent.com";
const QUALITY_BACKEND_URL = "https://script.google.com/macros/s/AKfycbwTjuui1IEkkpLUSUvoMKYZFMRW_AJrLbFrd-sJLtmXWhSaHsXqb-Tm-vIIpSK-IwIyAg/exec";

let currentIdToken = null;
let dismissedKeys = new Set();

async function backendGet(params) {
  const res = await fetch(`${QUALITY_BACKEND_URL}?${new URLSearchParams(params).toString()}`);
  return res.json();
}
// Sent as text/plain, not application/json — Apps Script Web Apps don't
// answer CORS preflight requests, and a JSON content type is what
// triggers the browser to send one. text/plain counts as a "simple"
// request and skips it; the backend JSON.parses the body regardless of
// what content type it arrived as.
async function backendPost(body) {
  const res = await fetch(QUALITY_BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Sign-in gate for the whole Data Quality tab. Nothing quality-related —
 * not the tab switcher, not the tab content, not `?tab=quality` in the
 * URL — renders until a signed-in user's email comes back on the
 * Sheet's "allowlist" tab. `onAuthorized` runs once that's confirmed. */
function setupAuth(onAuthorized) {
  const statusEl = document.getElementById("auth-status");
  const loginWrap = document.getElementById("auth-login-wrap");
  const overlay = document.getElementById("auth-google-overlay");
  const tabNav = document.getElementById("tab-nav");

  if (!window.google || !window.google.accounts) {
    // Google's script didn't load (network hiccup, ad-blocker, offline).
    // Fail closed: Data Quality just stays unreachable rather than erroring.
    return;
  }

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response) => {
      currentIdToken = response.credential;
      const check = await backendGet({ action: "check", idToken: currentIdToken }).catch(() => ({ authorized: false, email: null }));
      if (!check.authorized) {
        statusEl.textContent = check.email ? `Signed in as ${check.email}, no Data Quality access` : "Sign-in failed";
        statusEl.hidden = false;
        return;
      }
      loginWrap.hidden = true;
      const dismissed = await backendGet({ action: "dismissed" }).catch(() => ({ keys: [] }));
      dismissedKeys = new Set(dismissed.keys || []);
      tabNav.hidden = false;
      onAuthorized();
    },
  });
  // The visible "Login" pill (`.auth-login-btn`) is a plain decorative
  // span — Google's own button renders invisibly on top of it
  // (`.auth-google-overlay`, opacity: 0) so a real click lands on Google's
  // actual interactive element. That's the standard way to get custom
  // label text out of a library whose own `renderButton` only offers a
  // fixed set of preset strings, none of which is literally "Login".
  window.google.accounts.id.renderButton(overlay, { type: "standard", theme: "outline", size: "medium", text: "signin", width: 90 });
}

function updateQualityBadge(checks) {
  const activeCount = [
    ...checks.duplicates.map((g) => `dup:${g.monthKey}:${g.operator}:${g.vertical}:${g.channel}`),
    ...checks.extremeMargins.map((r) => `margin:${r.monthKey}:${r.operator}:${r.vertical}:${r.channel}`),
    ...checks.blankTurnovers.map((r) => `blank:${r.monthKey}:${r.operator}:${r.vertical}:${r.channel}`),
    ...checks.groupInconsistencies.map((g) => `group:${g.operator}`),
    ...checks.presenceGaps.map((g) => `gap:${g.operator}:${g.vertical}:${g.channel}`),
  ].filter((k) => !dismissedKeys.has(k)).length;

  const btn = document.getElementById("tab-btn-quality");
  let badge = btn.querySelector(".tab-nav__item-badge");
  if (activeCount === 0) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "tab-nav__item-badge";
    btn.appendChild(badge);
  }
  badge.textContent = String(activeCount);
}

function emptyQualityNote(text) {
  const p = document.createElement("p");
  p.className = "chart-card__empty";
  p.textContent = text;
  return p;
}

/** A quality-check table with a per-row dismiss/restore action. `items` are
 * the raw check results; `keyFn` derives a stable key per item, shared via
 * the backend so "not an issue" survives reloads and is the same for
 * every user (the sheet re-generates the same finding every time
 * otherwise); `rowFn` formats one item into display cells. Dismissed rows
 * stay visible but muted, with a "Restore" button, nothing silently
 * disappears without a visible trail back. */
function buildQualitySection(checks, title, subtitle, items, columns, keyFn, rowFn) {
  const section = document.createElement("section");
  section.className = "dashboard-section";
  const h2 = document.createElement("h2");
  h2.className = "section-title";
  h2.textContent = title;
  const p = document.createElement("p");
  p.className = "section-subtitle";
  p.textContent = subtitle;
  const card = document.createElement("div");
  card.className = "chart-card";

  if (items.length === 0) {
    card.appendChild(emptyQualityNote("None found."));
    section.append(h2, p, card);
    return section;
  }

  const activeCount = items.filter((it) => !dismissedKeys.has(keyFn(it))).length;
  const dismissedCount = items.length - activeCount;
  const caption = document.createElement("p");
  caption.className = "chart-card__caption";
  const shown = items.slice(0, QUALITY_TABLE_CAP);
  caption.textContent = `${activeCount} active${dismissedCount > 0 ? `, ${dismissedCount} marked not-an-issue` : ""}`
    + (items.length > QUALITY_TABLE_CAP ? `. Showing the first ${QUALITY_TABLE_CAP} of ${items.length}.` : ".");
  card.appendChild(caption);

  const wrap = document.createElement("div");
  wrap.className = "viz-table-wrap";
  const table = document.createElement("table");
  table.className = "viz-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of [...columns, ""]) {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const item of shown) {
    const key = keyFn(item);
    const isDismissed = dismissedKeys.has(key);
    const tr = document.createElement("tr");
    if (isDismissed) tr.className = "quality-row--dismissed";
    for (const cell of rowFn(item)) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    const actionTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quality-dismiss-btn";
    btn.textContent = isDismissed ? "Restore" : "Not an issue";
    btn.addEventListener("click", async () => {
      const action = dismissedKeys.has(key) ? "restore" : "dismiss";
      const result = await backendPost({ idToken: currentIdToken, action, key }).catch(() => null);
      if (result && result.keys) dismissedKeys = new Set(result.keys);
      renderQualityTab(checks);
      updateQualityBadge(checks);
    });
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  card.appendChild(wrap);

  section.append(h2, p, card);
  return section;
}

function renderQualityTab(checks) {
  const root = document.getElementById("tab-panel-quality");
  root.innerHTML = "";

  const duplicateRowCount = checks.duplicates.reduce((s, g) => s + g.occurrences.length, 0);
  const summary = document.createElement("section");
  summary.className = "kpi-row";
  const tiles = [
    ["Duplicate rows", duplicateRowCount],
    ["Extreme margin outliers", checks.extremeMargins.length],
    ["Blank turnover, non-zero GGR", checks.blankTurnovers.length],
    ["Operator naming inconsistencies", checks.groupInconsistencies.length],
    ["Missing months in a regular run", checks.presenceGaps.length],
  ];
  for (const [label, value] of tiles) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    const l = document.createElement("div"); l.className = "stat-tile__label"; l.textContent = label;
    const v = document.createElement("div"); v.className = "stat-tile__value"; v.textContent = String(value);
    tile.append(l, v);
    summary.appendChild(tile);
  }
  root.appendChild(summary);

  root.appendChild(buildQualitySection(
    checks,
    "Duplicate rows",
    "Same month, operator, vertical, and channel entered more than once. The most common copy/paste mistake, and it quietly inflates totals for that period on every Dashboard chart.",
    checks.duplicates,
    ["Month", "Operator", "Vertical", "Channel", "×", "GGR / Turnover per occurrence"],
    (g) => `dup:${g.monthKey}:${g.operator}:${g.vertical}:${g.channel}`,
    (g) => [
      g.monthLabel, g.operator, g.vertical, g.channel, String(g.occurrences.length),
      g.occurrences.map((o) => `${Charts.formatMoney(o.ggr)} / ${Charts.formatMoney(o.turnover)}`).join("   vs.   "),
    ]
  ));

  root.appendChild(buildQualitySection(
    checks,
    "Extreme margins",
    "GGR divided by Turnover that doesn't make sense for its direction. A negative margin is only flagged once Turnover is over €1M and the loss is 50% or worse, so an ordinary bad month doesn't bury real typos. A positive margin is only flagged above 100% (GGR bigger than Turnover), which shouldn't happen at all.",
    checks.extremeMargins,
    ["Month", "Operator", "Vertical", "Channel", "GGR", "Turnover", "Margin"],
    (r) => `margin:${r.monthKey}:${r.operator}:${r.vertical}:${r.channel}`,
    (r) => [r.monthLabel, r.operator, r.vertical, r.channel, Charts.formatMoney(r.ggr), Charts.formatMoney(r.turnover), Charts.formatPercent(r.margin)]
  ));

  root.appendChild(buildQualitySection(
    checks,
    "Blank Turnover with non-zero GGR",
    "Not necessarily wrong. Some operators genuinely don't report turnover for a channel, but it breaks margin math for that row, so it's worth a glance.",
    checks.blankTurnovers,
    ["Month", "Operator", "Vertical", "Channel", "GGR"],
    (r) => `blank:${r.monthKey}:${r.operator}:${r.vertical}:${r.channel}`,
    (r) => [r.monthLabel, r.operator, r.vertical, r.channel, Charts.formatMoney(r.ggr)]
  ));

  root.appendChild(buildQualitySection(
    checks,
    "Operator → Group naming inconsistencies",
    "Splits one group's totals across two labels in the Operator group rollups. Could be spelling drift (like a dropped “S.R.L.”) or a real ownership change. Worth a look either way.",
    checks.groupInconsistencies,
    ["Operator", "Group names seen"],
    (g) => `group:${g.operator}`,
    (g) => [g.operator, g.variants.map((v) => `${v.name} (${v.count} rows, from ${v.firstSeen})`).join("   /   ")]
  ));

  root.appendChild(buildQualitySection(
    checks,
    "Missing months in a regular run",
    "An operator, vertical, and channel combo that's reported in 95%+ of the months between its own first and last appearance, but skipped one in the middle. That's different from a combo that simply hasn't launched yet or has stopped for good, since neither of those is an error. August and September 2022 don't count against anyone, since ADM's own reporting had a market-wide gap those two months.",
    checks.presenceGaps,
    ["Operator", "Vertical", "Channel", "Presence", "Missing months"],
    (g) => `gap:${g.operator}:${g.vertical}:${g.channel}`,
    (g) => [g.operator, g.vertical, g.channel, `${g.presentCount}/${g.totalCount} (${Charts.formatPercent(g.presenceRate)})`, g.missingMonths.join(", ")]
  ));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  showStatus("loading", "Loading market data…", "Fetching the latest rows from the Google Sheet.");
  let records;
  try {
    records = await loadRecords();
  } catch (err) {
    showStatus("error", "Couldn't load the sheet", err.message);
    return;
  }
  if (records.length === 0) {
    showStatus("error", "The sheet loaded but had no usable rows.", "Check that the column headers match what the dashboard expects.");
    return;
  }

  hideStatus();

  // Computing the checks is cheap and doesn't need to wait on sign-in — the
  // Sheet they're computed from is the same public one the Dashboard tab
  // already reads. Rendering them (and the tab that shows them) does wait,
  // in setupAuth() below.
  const qualityChecks = Quality.runAllChecks(records);

  const allMonths = distinctMonths(records);
  const operators = distinctOperators(records);
  const verticalOrder = distinctVerticals(records);
  const channelOrder = CHANNEL_ORDER.filter((c) => records.some((r) => r.channel === c));

  lastUpdatedEl.textContent = `Data through ${allMonths[allMonths.length - 1].label}`;

  // --- URL state persistence ------------------------------------------------
  // Every filter/view is reflected in the query string (via history.replace-
  // State, so filtering doesn't spam browser history) and read back on load,
  // so a copy-pasted link reproduces the exact view. Unknown/stale values
  // (an old link after data changes shape) fall back to defaults instead of
  // throwing.
  const monthKeySet = new Set(allMonths.map((m) => m.key));
  const operatorNameSet = new Set(operators.map((o) => o.operator));
  const VALID_METRICS = new Set(["ggr", "turnover", "hold", "share"]);
  const VALID_BASIS = new Set(["ggr", "turnover"]);
  const VALID_LEADERBOARD_MODES = new Set(["total", "channel", "vertical"]);
  const VALID_SHARE_VIEWS = new Set(["stacked", "lines"]);
  const VALID_GROWTH_PERIODS = new Set(["mom", "yoy"]);
  const VALID_GROWTH_OPERATOR_MODES = new Set(["top10", "select"]);

  const urlParams = new URLSearchParams(window.location.search);
  const urlFrom = urlParams.get("from");
  const urlTo = urlParams.get("to");
  const urlVerticals = urlParams.getAll("v").filter((v) => verticalOrder.includes(v));
  const urlChannels = urlParams.getAll("ch").filter((c) => channelOrder.includes(c));
  const urlOperators = urlParams.getAll("op").filter((o) => operatorNameSet.has(o));
  const urlMetric = urlParams.get("metric");
  const urlBasis = urlParams.get("basis");
  const urlLeaderboardMode = urlParams.get("lb");
  const urlShareView = urlParams.get("shareview");
  const urlVerticalTrendView = urlParams.get("vtv");
  const urlGrowthPeriod = urlParams.get("gp");
  const urlGrowthOperatorMode = urlParams.get("gom");
  const urlTab = urlParams.get("tab");

  const state = {
    // Default view is the most recent month, not the whole dataset — a
    // multi-year "All time" view is rarely what you want to land on.
    from: urlFrom && monthKeySet.has(urlFrom) ? urlFrom : allMonths[allMonths.length - 1].key,
    to: urlTo && monthKeySet.has(urlTo) ? urlTo : allMonths[allMonths.length - 1].key,
    verticals: urlVerticals.length ? new Set(urlVerticals) : new Set(verticalOrder),
    channels: urlChannels.length ? new Set(urlChannels) : new Set(channelOrder),
    operators: new Set(urlOperators),
    metric: urlMetric && VALID_METRICS.has(urlMetric) ? urlMetric : "ggr",
    operatorShareBasis: urlBasis && VALID_BASIS.has(urlBasis) ? urlBasis : "ggr",
    operatorShareView: urlShareView && VALID_SHARE_VIEWS.has(urlShareView) ? urlShareView : "stacked",
    verticalTrendView: urlVerticalTrendView && VALID_SHARE_VIEWS.has(urlVerticalTrendView) ? urlVerticalTrendView : "stacked",
    leaderboardMode: urlLeaderboardMode && VALID_LEADERBOARD_MODES.has(urlLeaderboardMode) ? urlLeaderboardMode : "total",
    // One shared MoM/YoY toggle across all three Growth cards — they're
    // meant to be read together, so three separately-clickable but
    // supposedly-synced toggles would just be three places to click instead
    // of one, for no real benefit.
    growthPeriod: urlGrowthPeriod && VALID_GROWTH_PERIODS.has(urlGrowthPeriod) ? urlGrowthPeriod : "mom",
    // "top10" auto-ranks by the current filters + metric; "select" shows
    // exactly the operators picked in the Operators filter instead.
    growthOperatorMode: urlGrowthOperatorMode && VALID_GROWTH_OPERATOR_MODES.has(urlGrowthOperatorMode) ? urlGrowthOperatorMode : "top10",
  };
  if (state.from > state.to) { state.from = allMonths[allMonths.length - 1].key; state.to = allMonths[allMonths.length - 1].key; }

  // Always starts on Dashboard, even if the URL says ?tab=quality — that
  // param is only honored once setupAuth() below confirms a signed-in,
  // allowlisted user, so a signed-out visitor pasting that link in gets
  // the Dashboard, not a glimpse of the Quality tab while it loads.
  let activeTab = "dashboard";

  function syncURL() {
    const params = new URLSearchParams();
    params.set("from", state.from);
    params.set("to", state.to);
    if (state.verticals.size !== verticalOrder.length) {
      for (const v of verticalOrder) if (state.verticals.has(v)) params.append("v", v);
    }
    if (state.channels.size !== channelOrder.length) {
      for (const c of channelOrder) if (state.channels.has(c)) params.append("ch", c);
    }
    // Iterate the Set directly (not the master operator list) to preserve
    // selection order — that's what the compare-color assignment keys off.
    for (const op of state.operators) params.append("op", op);
    if (state.metric !== "ggr") params.set("metric", state.metric);
    if (state.operatorShareBasis !== "ggr") params.set("basis", state.operatorShareBasis);
    if (state.operatorShareView !== "stacked") params.set("shareview", state.operatorShareView);
    if (state.verticalTrendView !== "stacked") params.set("vtv", state.verticalTrendView);
    if (state.leaderboardMode !== "total") params.set("lb", state.leaderboardMode);
    if (state.growthPeriod !== "mom") params.set("gp", state.growthPeriod);
    if (state.growthOperatorMode !== "top10") params.set("gom", state.growthOperatorMode);
    if (activeTab !== "dashboard") params.set("tab", activeTab);
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }

  const tabs = setupTabs(activeTab, (tab) => { activeTab = tab; syncURL(); });
  setupFilterSheet();

  setupAuth(() => {
    renderQualityTab(qualityChecks);
    updateQualityBadge(qualityChecks);
    if (urlTab === "quality") tabs.activate("quality");
  });

  buildFilterBar();
  render();

  function monthsInRange() {
    return allMonths.filter((m) => m.key >= state.from && m.key <= state.to);
  }

  // Operators are ordered by Online Sportsbetting GGR within the currently
  // selected date range — recomputed whenever the date range changes, since
  // that's the one ranking criterion the user asked for regardless of what
  // Vertical/Channel filters are active elsewhere.
  function rankedOperatorOptions() {
    const rankingPool = records.filter((r) =>
      r.key >= state.from && r.key <= state.to && r.vertical === "Sportsbetting" && r.channel === "Online"
    );
    const ranked = Agg.topKeysByTotal(rankingPool, "operator", "ggr", operators.length);
    const rankIndex = new Map(ranked.map((op, i) => [op, i]));
    return [...operators]
      .sort((a, b) => {
        const ra = rankIndex.has(a.operator) ? rankIndex.get(a.operator) : Infinity;
        const rb = rankIndex.has(b.operator) ? rankIndex.get(b.operator) : Infinity;
        return ra - rb;
      })
      .map((o) => ({
        key: o.operator, label: o.operator, meta: o.group, colorClass: Charts.operatorColorClass(o.operator),
      }));
  }

  function buildFilterBar() {
    filterBar.innerHTML = "";

    let operatorSelect;

    const dateRange = createDateRangeControl({
      months: allMonths,
      value: { from: state.from, to: state.to },
      onChange: (v) => {
        state.from = v.from;
        state.to = v.to;
        // Guarded: this fires once synchronously during construction, before
        // operatorSelect (built right after) exists yet.
        if (operatorSelect) operatorSelect.setOptions(rankedOperatorOptions());
        render();
      },
    });

    const verticalSelect = createMultiSelect({
      label: "Vertical",
      options: verticalOrder.map((v, i) => ({ key: v, label: v, colorClass: Charts.rankColorClass(i) })),
      selected: state.verticals,
      onChange: () => render(),
    });

    const channelSelect = createMultiSelect({
      label: "Channel",
      options: channelOrder.map((c) => ({ key: c, label: c })),
      selected: state.channels,
      onChange: () => render(),
    });

    operatorSelect = createMultiSelect({
      label: "Operators",
      options: rankedOperatorOptions(),
      selected: state.operators,
      onChange: () => render(),
    });

    const metricToggle = createSegmented({
      options: [
        { key: "ggr", label: "GGR" },
        { key: "turnover", label: "Turnover" },
        { key: "hold", label: "Margin %" },
        { key: "share", label: "Market Share %" },
      ],
      selected: { value: state.metric },
      onChange: (key) => { state.metric = key; render(); },
    });

    const resetBtn = createResetButton(() => {
      state.from = allMonths[allMonths.length - 1].key;
      state.to = allMonths[allMonths.length - 1].key;
      state.verticals = new Set(verticalOrder);
      state.channels = new Set(channelOrder);
      state.operators = new Set();
      state.metric = "ggr";
      state.operatorShareBasis = "ggr";
      state.operatorShareView = "stacked";
      state.verticalTrendView = "stacked";
      state.leaderboardMode = "total";
      state.growthPeriod = "mom";
      state.growthOperatorMode = "top10";
      buildFilterBar();
      render();
    });

    filterBar.append(
      dateRange.el, verticalSelect.el, channelSelect.el, operatorSelect.el, metricToggle.el, resetBtn
    );
  }

  // A hoisted function declaration, not `const` — `buildFilterBar()` (called
  // below, before this line runs) triggers a synchronous `render()` during
  // its own construction (the date-range control fires its initial
  // `onChange` immediately), and that first render already calls
  // `momPercent`/`yoyPercent` with this as their default scope. A `const`
  // here would be in its temporal dead zone at that point and throw.
  function defaultGrowthScope(r) { return state.verticals.has(r.vertical) && state.channels.has(r.channel); }

  // "Share" isn't a raw record field, so it isn't a straight Agg.sum like
  // GGR/Turnover/Margin — it's a category's GGR as a % of some wider
  // total's GGR at that month. `totalScope` identifies that wider total;
  // for every other metric it's unused.
  function metricValueAt(monthKey, metric, scope, totalScope) {
    if (metric === "share") {
      const catGGR = Agg.sum(records.filter((r) => r.key === monthKey && scope(r)), "ggr");
      const totalGGR = Agg.sum(records.filter((r) => r.key === monthKey && totalScope(r)), "ggr");
      return totalGGR ? (catGGR / totalGGR) * 100 : null;
    }
    return Agg.sum(records.filter((r) => r.key === monthKey && scope(r)), metric);
  }

  // MoM: latest month in the current range vs. the preceding calendar month,
  // like YoY (below), ignoring the date-range filter for the "prior" side —
  // with a narrow range (e.g. the "Last month" default) the actual previous
  // month usually isn't itself inside the selected range, so restricting the
  // comparison to `months` made MoM silently go blank the moment the range
  // narrowed to one month. `momScope` mirrors `yoyScope`: defaults to the
  // page-wide vertical/channel filters, narrowed by a per-category caller;
  // `totalScope` (only relevant for metric "share") defaults to the same
  // scope, since most callers aren't asking a share question.
  // Returns { prev, latest, pct } instead of just the percent — the growth
  // cards need the two raw values themselves (to show "previous" and "new"
  // alongside the %), not just the delta.
  function momValues(months, metric, momScope = defaultGrowthScope, totalScope = momScope) {
    const latestKey = months[months.length - 1]?.key;
    if (!latestKey) return { prev: null, latest: null, pct: null };
    const latestIdx = allMonths.findIndex((m) => m.key === latestKey);
    if (latestIdx <= 0) return { prev: null, latest: null, pct: null };
    const prevKey = allMonths[latestIdx - 1].key;
    const latest = metricValueAt(latestKey, metric, momScope, totalScope);
    const prev = metricValueAt(prevKey, metric, momScope, totalScope);
    const pct = latest !== null && prev ? ((latest - prev) / Math.abs(prev)) * 100 : null;
    return { prev, latest, pct };
  }
  // `yoyScope`/`totalScope`: see momValues above — same pattern, just
  // comparing against the same calendar month one year back instead of the
  // preceding month.
  function yoyValues(months, metric, yoyScope = defaultGrowthScope, totalScope = yoyScope) {
    const latestMonthKey = months[months.length - 1]?.key;
    if (!latestMonthKey) return { prev: null, latest: null, pct: null };
    const latest = metricValueAt(latestMonthKey, metric, yoyScope, totalScope);
    const [y, mm] = latestMonthKey.split("-").map(Number);
    const yoyKey = `${y - 1}-${String(mm).padStart(2, "0")}`;
    if (!allMonths.some((m) => m.key === yoyKey) || latest === null) return { prev: null, latest, pct: null };
    const yoyVal = metricValueAt(yoyKey, metric, yoyScope, totalScope);
    const pct = yoyVal ? ((latest - yoyVal) / Math.abs(yoyVal)) * 100 : null;
    return { prev: yoyVal, latest, pct };
  }
  function yoyPercent(months, metric, yoyScope = defaultGrowthScope, totalScope = yoyScope) {
    return yoyValues(months, metric, yoyScope, totalScope).pct;
  }

  // YoY, not MoM — betting volume is heavily seasonal (e.g. a big
  // tournament month vs. the month before it), so a month-over-month delta
  // mixes "did the business actually grow" with "is it just that time of
  // year again" in a way a reader can't untangle. Comparing against the
  // same month last year cancels that out. There's no separate standalone
  // YoY tile anymore for the same reason there's no separate MoM one now —
  // it's just what every tile's delta means.
  function renderKPIs(filtered, months) {
    kpiRow.innerHTML = "";

    const totalGGR = Agg.sum(filtered, "ggr");
    const totalTurnover = Agg.sum(filtered, "turnover");
    const overallMargin = Agg.sum(filtered, "hold");

    addTile("Total GGR", Charts.formatMetric(totalGGR, "ggr"), yoyPercent(months, "ggr"), "YoY", true);
    addTile("Total Turnover", Charts.formatMetric(totalTurnover, "turnover"), yoyPercent(months, "turnover"), "YoY", true);
    addTile("Overall margin", Charts.formatMetric(overallMargin, "hold"), yoyPercent(months, "hold"), "YoY", true);
  }

  function addTile(label, value, deltaPct, deltaCaption, showDelta) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    const l = document.createElement("div"); l.className = "stat-tile__label"; l.textContent = label;
    const v = document.createElement("div"); v.className = "stat-tile__value"; v.textContent = value;
    tile.append(l, v);
    if (showDelta && deltaPct !== null && deltaPct !== undefined) {
      const d = document.createElement("div");
      const dir = deltaPct > 0.05 ? "up" : deltaPct < -0.05 ? "down" : "flat";
      d.className = `stat-tile__delta stat-tile__delta--${dir === "up" ? "good" : dir === "down" ? "bad" : "flat"}`;
      const glyph = document.createElement("span");
      glyph.className = `delta-glyph-${dir}`;
      const text = document.createElement("span");
      text.textContent = ` ${Math.abs(deltaPct).toFixed(1)}%`;
      const caption = document.createElement("span");
      caption.className = "stat-tile__delta-caption";
      caption.textContent = ` ${deltaCaption}`;
      d.append(glyph, text, caption);
      tile.appendChild(d);
    }
    kpiRow.appendChild(tile);
  }

  function render() {
    // Each card below is cleared then rebuilt in sequence (not diffed), so
    // partway through a render the document is transiently shorter than
    // both its start and end height. If the page is scrolled past that
    // transient height, the browser clamps scrollY down right then — and
    // does not bring it back up once the content regrows, even though the
    // final height matches where you started. Save/restore around the
    // whole rebuild so a filter tweak never silently yanks the viewport.
    const scrollYBeforeRender = window.scrollY;

    const filtered = Agg.filterRecords(records, state);
    const months = monthsInRange();
    // A time-series chart with one point on the x-axis has nothing to draw
    // a line or stack across — worse, a single-point line path (`M x,y`
    // with no `L` segment) is a real element with zero bounding-box size,
    // so it silently renders nothing rather than erroring or falling back.
    // Every chart below that's normally a trend-over-time switches to a
    // single-period breakdown (bar chart, or an explicit "need more than
    // one month" note) when this is true.
    const singleMonth = months.length === 1;

    // Colors for the compare-set: assigned by selection order (index 0..5),
    // never by a hash of the name. A hash into 8 slots collides constantly
    // once you're comparing more than 2-3 operators — the whole point of
    // "compare" breaks if two lines render identically. Position-based is
    // collision-free by construction since the set is capped at 6.
    const compareColorMap = new Map([...state.operators].map((op, i) => [op, Charts.rankColorClass(i)]));

    renderKPIs(filtered, months);

    // --- Market overview: growth by operator/vertical/channel ---------------
    // MoM/YoY is the headline read of this dashboard, so these three growth
    // cards lead the section — above the volume/composition charts below.
    // One shared period across all three (state.growthPeriod) — each card
    // gets its own toggle instance (consistent with every other card's
    // local-controls pattern) but all three write the same state field, so
    // clicking any one re-renders all three in sync rather than letting them
    // show different periods at once. They follow the page-wide metric
    // toggle too, same as everything else — "share" is derived (a
    // category's GGR as a % of the wider filtered total at that month, via
    // `totalScope`), not a raw summable field, so it needs that extra
    // parameter; GGR/Turnover/Margin % don't.
    const isYoy = state.growthPeriod === "yoy";
    const growthPeriodLabel = isYoy ? "YoY %" : "MoM %";
    const growthComparisonPhrase = isYoy ? "vs. the same month last year" : "vs. the prior calendar month";
    function growthPeriodToggle() {
      return createSegmented({
        options: [{ key: "mom", label: "MoM" }, { key: "yoy", label: "YoY" }],
        selected: { value: state.growthPeriod },
        onChange: (key) => { state.growthPeriod = key; render(); },
      });
    }

    {
      // "Top 10" auto-ranks by the current filters and metric — same
      // convention as the Operator leaderboard further down. "Select" shows
      // exactly the operators picked in the Operators filter, in whatever
      // order they were picked, so someone comparing a specific handful
      // isn't stuck reading whoever the market happens to rank highest.
      const modeToggle = createSegmented({
        options: [{ key: "top10", label: "Top 10" }, { key: "select", label: "Select" }],
        selected: { value: state.growthOperatorMode },
        onChange: (key) => { state.growthOperatorMode = key; render(); },
      });
      const isSelectMode = state.growthOperatorMode === "select";
      const opList = isSelectMode
        ? [...state.operators]
        : Agg.topKeysByTotal(filtered, "operator", state.metric === "share" ? "ggr" : state.metric, 10);
      const items = opList.map((op) => {
        const scope = (r) => r.operator === op && state.verticals.has(r.vertical) && state.channels.has(r.channel);
        const { prev, latest, pct } = isYoy
          ? yoyValues(months, state.metric, scope, defaultGrowthScope)
          : momValues(months, state.metric, scope, defaultGrowthScope);
        return { key: op, value: pct, prev, latest };
      });
      const { body, tableSlot } = Charts.buildCardShell(cards.growthOperator, {
        title: "Growth by operator",
        caption: isSelectMode
          ? `Each picked operator's ${Charts.METRIC_LABEL[state.metric]} ${growthComparisonPhrase}, within the selected vertical(s) and channel(s).`
          : `Top 10 operators by GGR in the current filters. Each one's ${Charts.METRIC_LABEL[state.metric]} ${growthComparisonPhrase}, within the selected vertical(s) and channel(s).`,
        extra: [modeToggle.el, growthPeriodToggle().el],
      });
      if (isSelectMode && items.length === 0) {
        Charts.emptyState(body, "Pick operators above to see their growth here.");
        tableSlot.innerHTML = "";
      } else {
        Charts.renderDivergingBarChart(body, tableSlot, {
          items, valueColumnLabel: growthPeriodLabel, chartLabel: `Growth by operator (${growthPeriodLabel})`,
          metric: state.metric,
          previousLabel: isYoy ? "Prev. year" : "Prior month",
          newLabel: isYoy ? "Curr. year" : "Curr. month",
        });
      }
    }

    {
      const { body, tableSlot } = Charts.buildCardShell(cards.growthVertical, {
        title: "Growth by vertical",
        caption: `Each vertical's ${Charts.METRIC_LABEL[state.metric]} ${growthComparisonPhrase}, within the selected channel(s). This ignores the date range above, since the comparison always needs the actual prior period, which usually isn't in a narrow range.`,
        extra: growthPeriodToggle().el,
      });
      // A vertical's "share" is its GGR as a percent of the total across
      // the verticals currently selected — with only one vertical selected,
      // that total IS the vertical, so its share is always 100% and never
      // moves. Rather than plot a flat, always-0% chart that looks broken,
      // say why there's nothing to plot.
      if (state.metric === "share" && state.verticals.size === 1) {
        Charts.emptyState(body, "Share needs more than one vertical selected. With just one, it's always 100%.");
        tableSlot.innerHTML = "";
      } else {
        const items = verticalOrder.filter((v) => state.verticals.has(v)).map((v) => {
          const scope = (r) => r.vertical === v && state.channels.has(r.channel);
          const { prev, latest, pct } = isYoy
            ? yoyValues(months, state.metric, scope, defaultGrowthScope)
            : momValues(months, state.metric, scope, defaultGrowthScope);
          return { key: v, value: pct, prev, latest };
        });
        Charts.renderDivergingBarChart(body, tableSlot, {
          items, valueColumnLabel: growthPeriodLabel, chartLabel: `Growth by vertical (${growthPeriodLabel})`,
          metric: state.metric,
          previousLabel: isYoy ? "Prev. year" : "Prior month",
          newLabel: isYoy ? "Curr. year" : "Curr. month",
        });
      }
    }

    {
      const { body, tableSlot } = Charts.buildCardShell(cards.growthChannel, {
        title: "Growth by channel",
        caption: `Online vs. Retail ${Charts.METRIC_LABEL[state.metric]} ${growthComparisonPhrase}, within the selected vertical(s). Also ignores the date range above, for the same reason.`,
        extra: growthPeriodToggle().el,
      });
      // Same reasoning as Growth by vertical, above: one channel selected
      // means its share of the total is always 100%.
      if (state.metric === "share" && state.channels.size === 1) {
        Charts.emptyState(body, "Share needs both channels selected. With just one, it's always 100%.");
        tableSlot.innerHTML = "";
      } else {
        const items = channelOrder.filter((c) => state.channels.has(c)).map((c) => {
          const scope = (r) => r.channel === c && state.verticals.has(r.vertical);
          const { prev, latest, pct } = isYoy
            ? yoyValues(months, state.metric, scope, defaultGrowthScope)
            : momValues(months, state.metric, scope, defaultGrowthScope);
          return { key: c, value: pct, prev, latest };
        });
        Charts.renderDivergingBarChart(body, tableSlot, {
          items, valueColumnLabel: growthPeriodLabel, chartLabel: `Growth by channel (${growthPeriodLabel})`,
          metric: state.metric,
          previousLabel: isYoy ? "Prev. year" : "Prior month",
          newLabel: isYoy ? "Curr. year" : "Curr. month",
        });
      }
    }

    // --- Market overview: trend by vertical -------------------------------
    // With 2+ verticals selected this is a real composition breakdown. With
    // exactly one vertical selected (the common case — "just Sportsbetting
    // Online") a "breakdown by vertical" of a single vertical is a pointless
    // 100%-one-color block, so it collapses to a plain total-trend line
    // instead: same card, but showing something actually useful. A single
    // selected month takes priority over both of those: a time-series chart
    // with one point on the x-axis has no trend to show at all, so it falls
    // back to a bar-chart breakdown for that one month instead.
    {
      const singleVertical = state.verticals.size === 1;
      if (singleMonth) {
        const { body, tableSlot } = Charts.buildCardShell(cards.verticalTrend, {
          title: "Market trend",
          caption: `Only one month is selected, so there's no trend to draw. This is the per-vertical breakdown for ${months[0].label} instead. Pick a wider date range to see it as a trend over time.`,
        });
        let items;
        if (state.metric === "share") {
          const marketGGR = Agg.sum(filtered, "ggr");
          items = Agg.leaderboard(filtered, "ggr", verticalOrder.length, "vertical").map((it) => ({
            operator: it.operator,
            segments: [{ key: "total", label: "Share", value: marketGGR ? (it.value / marketGGR) * 100 : 0, colorClass: Charts.verticalColorClass(it.operator, verticalOrder) }],
          }));
        } else if (state.metric === "hold") {
          // Margin % isn't additive across verticals, so "% of total" has
          // no meaning here (unlike GGR/Turnover, below) — just the value.
          items = Agg.leaderboard(filtered, state.metric, verticalOrder.length, "vertical").map((it) => ({
            operator: it.operator,
            segments: [{ key: "total", label: Charts.METRIC_LABEL[state.metric], value: it.value, colorClass: Charts.verticalColorClass(it.operator, verticalOrder) }],
          }));
        } else {
          // GGR/Turnover are additive, so each vertical's € figure can
          // carry its own % of the total alongside it — both numbers
          // people actually want out of a single-month breakdown.
          const raw = Agg.leaderboard(filtered, state.metric, verticalOrder.length, "vertical");
          const grandTotal = raw.reduce((s, it) => s + it.value, 0);
          items = raw.map((it) => ({
            operator: it.operator,
            segments: [{ key: "total", label: Charts.METRIC_LABEL[state.metric], value: it.value, colorClass: Charts.verticalColorClass(it.operator, verticalOrder) }],
            note: grandTotal ? `${((it.value / grandTotal) * 100).toFixed(1)}%` : undefined,
          }));
        }
        Charts.renderBarChart(body, tableSlot, {
          items, metric: state.metric, categoryLabel: "Vertical", chartLabel: `Vertical breakdown for ${months[0].label}`,
        });
      } else if (singleVertical) {
        const [onlyVertical] = state.verticals;
        const { body, tableSlot } = Charts.buildCardShell(cards.verticalTrend, {
          title: "Market trend",
          caption: `Total ${Charts.METRIC_LABEL[state.metric === "share" ? "ggr" : state.metric]} for ${onlyVertical}, across the selected channel(s).`,
        });
        const basisMetric = state.metric === "share" ? "ggr" : state.metric;
        const totals = Agg.totalsByMonth(filtered, months, basisMetric);
        const series = [{ key: onlyVertical, label: onlyVertical, colorClass: Charts.verticalColorClass(onlyVertical, verticalOrder), values: totals }];
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series, metric: basisMetric, stacked: true, seriesLabel: "Vertical",
        });
      } else if (state.metric === "hold") {
        // Margin % isn't additive across verticals, so there's no "share of
        // margin" to stack or normalize — just each vertical's own margin %
        // as a line, same as before.
        const { body, tableSlot } = Charts.buildCardShell(cards.verticalTrend, {
          title: "Market trend by vertical",
          caption: "Overall margin % per vertical, per month.",
        });
        const { series } = Agg.monthlySeries(filtered, months, "vertical", "hold", null);
        const colored = series.map((s) => ({ ...s, label: s.key, colorClass: Charts.verticalColorClass(s.key, verticalOrder) }));
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series: colored, metric: "hold", stacked: false, seriesLabel: "Vertical",
        });
      } else {
        // Same Stacked/Lines pattern as Operator share, below: both views
        // always plot each vertical's % share of the total (GGR or
        // Turnover, picked by the page-wide metric toggle — "Share %"
        // itself is just the GGR case again), with the underlying € figure
        // carried alongside for the tooltip/table rather than dropped.
        // "Stacked" reads composition; "Lines" makes one vertical
        // overtaking another a literal line-crossing instead of two
        // shifting-baseline bands.
        const basisMetric = state.metric === "turnover" ? "turnover" : "ggr";
        const basisLabel = basisMetric === "turnover" ? "Turnover" : "GGR";
        const viewDisabledTitle = "Only one month is selected, so there's nothing to stack or trace a line across. This shows a single-month breakdown instead.";
        const viewToggle = createSegmented({
          options: [
            { key: "stacked", label: "Stacked", disabled: singleMonth, title: singleMonth ? viewDisabledTitle : undefined },
            { key: "lines", label: "Lines", disabled: singleMonth, title: singleMonth ? viewDisabledTitle : undefined },
          ],
          selected: { value: state.verticalTrendView },
          onChange: (key) => { state.verticalTrendView = key; render(); },
        });
        const viewCaption = state.verticalTrendView === "lines"
          ? "Each vertical's own % share line, independent of the others. Use this to spot exactly when one vertical's share overtakes another's, where their lines cross."
          : "Stacked to 100% each month. This reads composition well, but two adjacent bands overtaking each other can be hard to see since their baselines shift together. Switch to Lines to track that directly.";
        const { body, tableSlot } = Charts.buildCardShell(cards.verticalTrend, {
          title: "Market trend by vertical",
          caption: `Each vertical's % share of total ${basisLabel}, per month. ${viewCaption}`,
          extra: viewToggle.el,
        });
        const { series } = Agg.monthlySeries(filtered, months, "vertical", basisMetric, null);
        // Ascending total — smallest stacks first (bottom), biggest last
        // (top). The bottom band's baseline is pinned to 0 and never moves,
        // so it reads as visually "inert" even when it's the largest
        // contributor; putting the biggest band's own edge against the
        // stack's outer envelope (top) keeps it legible at a glance, and the
        // per-band end label (below) makes the exact value unambiguous
        // regardless of position anyway.
        series.sort((a, b) => a.values.reduce((s, v) => s + v, 0) - b.values.reduce((s, v) => s + v, 0));
        const withRaw = series.map((s) => ({ ...s, label: s.key, colorClass: Charts.verticalColorClass(s.key, verticalOrder), secondaryValues: [...s.values] }));
        const colored = Agg.normalizeStackToShare(withRaw, months);
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series: colored, metric: "share", secondaryMetric: basisMetric,
          stacked: state.verticalTrendView === "stacked", seriesLabel: "Vertical",
        });
      }
    }

    // --- Market overview: operator share ------------------------------------
    // Always a share view — this card is titled "share", so it shows share
    // on its own local GGR/Turnover toggle rather than the page-wide metric
    // toggle (which also has Margin %/Share % options that don't apply here
    // and would silently produce the exact same GGR-share chart, making the
    // global toggle look broken for this one card). Absolute € trend already
    // lives in the KPI tiles and the leaderboard; this chart's job is "how
    // has the mix shifted". Two view modes, same underlying data: "Stacked"
    // reads composition (how big is each slice of the whole), "Lines" trades
    // that for legibility of *rank* — a 100%-stack can bury one operator's
    // band overtaking another's inside a shifting baseline, where a plain
    // (non-cumulative) line per operator makes an overtake a literal
    // crossing of two lines.
    {
      const shareBasisToggle = createSegmented({
        options: [{ key: "ggr", label: "GGR" }, { key: "turnover", label: "Turnover" }],
        selected: { value: state.operatorShareBasis },
        onChange: (key) => { state.operatorShareBasis = key; render(); },
      });
      const shareViewDisabledTitle = "Only one month is selected, so there's nothing to stack or trace a line across. This shows a single-month breakdown instead.";
      const shareViewToggle = createSegmented({
        options: [
          { key: "stacked", label: "Stacked", disabled: singleMonth, title: singleMonth ? shareViewDisabledTitle : undefined },
          { key: "lines", label: "Lines", disabled: singleMonth, title: singleMonth ? shareViewDisabledTitle : undefined },
        ],
        selected: { value: state.operatorShareView },
        onChange: (key) => { state.operatorShareView = key; render(); },
      });
      const basisLabel = state.operatorShareBasis === "turnover" ? "Turnover" : "GGR";
      const viewCaption = singleMonth
        ? `Only one month is selected, so there's no trend to draw. This is the per-operator share breakdown for ${months[0]?.label} instead. Pick a wider date range to see it as a trend over time.`
        : state.operatorShareView === "lines"
        ? "Each operator's own % share line, independent of the others. Use this to spot exactly when one operator's share overtakes another's, where their lines cross."
        : "Stacked to 100% each month. This reads composition well, but two adjacent bands overtaking each other can be hard to see since their baselines shift together. Switch to Lines to track that directly.";
      const { body, tableSlot } = Charts.buildCardShell(cards.operatorShare, {
        title: "Operator share",
        caption: `Top 7 operators, ranked by Online Sportsbetting GGR over the selected date range regardless of the Vertical/Channel filters above. Shows each one's % share of total ${basisLabel} per month, independent of the GGR/Turnover/Margin/Share toggle above, which scopes the rest of the dashboard. ${viewCaption}`,
        extra: [shareBasisToggle.el, shareViewToggle.el],
      });
      // "Top 7" is always auto-detected — ranked by Online Sportsbetting GGR
      // specifically, over the current date range only, so the same set of
      // operators shows up regardless of whatever Vertical/Channel filters
      // are active elsewhere on the page (Sportsbetting/Online is the
      // market's flagship vertical, and a stable ranking criterion keeps
      // this chart's operator set from reshuffling every time the Vertical
      // filter changes). What's actually *plotted* for those 7 operators
      // still respects the current filters, same as everywhere else.
      const rankingPool = records.filter((r) => r.key >= state.from && r.key <= state.to && r.vertical === "Sportsbetting" && r.channel === "Online");
      const topOperators = Agg.topKeysByTotal(rankingPool, "operator", "ggr", 7);
      const groupMetric = state.operatorShareBasis === "turnover" ? "turnover" : "ggr";
      const { series } = Agg.monthlySeries(filtered, months, "operator", groupMetric, topOperators);
      const others = series.find((s) => s.key === "Other");
      // Descending here only decides color rank (biggest = slot 1/blue) —
      // kept separate from stacking order, below.
      const ranked = series.filter((s) => s.key !== "Other")
        .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
      const withColor = ranked.map((s, i) => ({ ...s, label: s.key, colorClass: Charts.rankColorClass(i), secondaryValues: [...s.values] }));
      // Stack ascending (smallest first/bottom, biggest last/top — see the
      // Market trend chart for why); "Other" anchors the bottom as a neutral
      // base rather than sitting on top of the biggest named operator.
      let colored = [...withColor].reverse();
      if (others) colored.unshift({ ...others, label: "Other", colorClass: "series-other", secondaryValues: [...others.values] });
      colored = Agg.normalizeStackToShare(colored, months);
      if (singleMonth) {
        const items = colored
          .map((s) => ({
            operator: s.label,
            segments: [{ key: "total", label: "Share", value: s.values[0] || 0, colorClass: s.colorClass }],
            note: Charts.formatMetric(s.secondaryValues[0] || 0, groupMetric),
          }))
          .sort((a, b) => b.segments[0].value - a.segments[0].value);
        Charts.renderBarChart(body, tableSlot, {
          items, metric: "share", categoryLabel: "Operator", chartLabel: `Operator share breakdown for ${months[0].label}`,
          noteLabel: Charts.METRIC_LABEL[groupMetric],
        });
      } else {
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series: colored, metric: "share", secondaryMetric: groupMetric,
          stacked: state.operatorShareView === "stacked", seriesLabel: "Operator",
        });
      }
    }

    // --- Market overview: leaderboard --------------------------------------
    {
      // Splitting a row into parts only makes sense for an additive
      // quantity (GGR/Turnover) — not Margin %/Share %, which aren't sums
      // of their rows. Each split mode also needs 2+ of its own dimension
      // currently selected in the filters, or there's nothing to split.
      // Falls back to "Total" automatically if a filter change invalidates
      // the mode currently selected, rather than rendering something wrong.
      const splitEligible = state.metric === "ggr" || state.metric === "turnover";
      const channelSplitValid = splitEligible && state.channels.size > 1;
      const verticalSplitValid = splitEligible && state.verticals.size > 1;
      if (state.leaderboardMode === "channel" && !channelSplitValid) state.leaderboardMode = "total";
      if (state.leaderboardMode === "vertical" && !verticalSplitValid) state.leaderboardMode = "total";

      const disabledReason = !splitEligible ? "Only available for GGR or Turnover" : undefined;
      const modeToggle = createSegmented({
        options: [
          { key: "total", label: "Total" },
          {
            key: "channel", label: "By channel", disabled: !channelSplitValid,
            title: disabledReason || (!channelSplitValid ? "Select both Online and Retail in the Channel filter to use this" : undefined),
          },
          {
            key: "vertical", label: "By vertical", disabled: !verticalSplitValid,
            title: disabledReason || (!verticalSplitValid ? "Select more than one vertical in the Vertical filter to use this" : undefined),
          },
        ],
        selected: { value: state.leaderboardMode },
        onChange: (key) => { state.leaderboardMode = key; render(); },
      });

      const { body, tableSlot } = Charts.buildCardShell(cards.leaderboard, {
        title: "Operator leaderboard",
        caption: state.leaderboardMode === "channel"
          ? "Top 15 operators, split by channel. Operators picked in “Compare operators” are highlighted (dimmed if not picked)."
          : state.leaderboardMode === "vertical"
          ? "Top 15 operators, split by vertical. Operators picked in “Compare operators” are highlighted (dimmed if not picked)."
          : state.metric === "share"
          ? "Each operator's % share of total GGR over the selected range, after the vertical/channel filters above."
          : "Top 15 operators over the selected range. Operators picked in “Compare operators” are highlighted.",
        extra: modeToggle.el,
      });

      let items, legend = null;
      const hasCompareSet = state.operators.size > 0;

      if (state.leaderboardMode === "channel") {
        const segOrder = channelOrder.filter((c) => state.channels.has(c));
        const segColors = segOrder.map((_, i) => Charts.rankColorClass(i));
        const raw = Agg.leaderboardSegmented(filtered, state.metric, 15, "channel", segOrder);
        items = raw.map((it) => ({
          operator: it.operator,
          dim: hasCompareSet && !state.operators.has(it.operator),
          segments: segOrder.map((key, i) => ({ key, label: key, value: it.segmentValues[i], colorClass: segColors[i] })),
        }));
        legend = segOrder.map((key, i) => ({ key, label: key, colorClass: segColors[i], swatchType: "rect" }));
      } else if (state.leaderboardMode === "vertical") {
        const segOrder = verticalOrder.filter((v) => state.verticals.has(v));
        const raw = Agg.leaderboardSegmented(filtered, state.metric, 15, "vertical", segOrder);
        items = raw.map((it) => ({
          operator: it.operator,
          dim: hasCompareSet && !state.operators.has(it.operator),
          segments: segOrder.map((key, i) => ({ key, label: key, value: it.segmentValues[i], colorClass: Charts.verticalColorClass(key, verticalOrder) })),
        }));
        legend = segOrder.map((key) => ({ key, label: key, colorClass: Charts.verticalColorClass(key, verticalOrder), swatchType: "rect" }));
      } else {
        let base;
        if (state.metric === "share") {
          const marketGGR = Agg.sum(filtered, "ggr");
          base = Agg.leaderboard(filtered, "ggr", 15).map((it) => ({
            operator: it.operator, value: marketGGR ? (it.value / marketGGR) * 100 : 0,
          }));
        } else {
          base = Agg.leaderboard(filtered, state.metric, 15);
        }
        items = base.map((it) => ({
          operator: it.operator,
          segments: [{ key: "total", label: Charts.METRIC_LABEL[state.metric], value: it.value, colorClass: compareColorMap.get(it.operator) || "seq-500" }],
        }));
      }

      Charts.renderBarChart(body, tableSlot, { items, metric: state.metric, legend });
    }

    // Nothing to show until operators are actually picked — an empty-state
    // placeholder in three chart cards at once just reads as dead space
    // that the visitor has to scroll past, so the whole section collapses
    // instead. renderTimeSeriesChart etc. below still run to populate the
    // cards' hidden content, so it's ready the instant a pick is made.
    compareSection.hidden = state.operators.size === 0;

    // --- Compare: trend per selected operator ------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.compareTrend, {
        title: "Compared operators: trend",
        caption: state.metric === "share"
          ? "Each operator's % share of total GGR, per month, within whatever verticals & channels are selected above."
          : "Sums GGR/Turnover across whatever verticals & channels are selected above.",
      });
      const selectedOps = [...state.operators];
      if (selectedOps.length === 0) {
        Charts.emptyState(body, "Pick operators above to trace their trend here.");
        tableSlot.innerHTML = "";
      } else if (singleMonth) {
        // Same fix as Market trend/Operator share: a 1-point line is a
        // zero-length path that renders nothing — this looked exactly like
        // "the chart is empty" despite the data being right there. Falls
        // back to a bar per operator for that one month instead.
        let items;
        if (state.metric === "share") {
          const marketTotal = Agg.sum(filtered, "ggr");
          items = Agg.operatorTrend(filtered, months, selectedOps, "ggr").map((s) => ({
            operator: s.key,
            segments: [{ key: "total", label: "Share", value: marketTotal ? (s.values[0] / marketTotal) * 100 : 0, colorClass: compareColorMap.get(s.key) }],
          }));
        } else {
          items = Agg.operatorTrend(filtered, months, selectedOps, state.metric).map((s) => ({
            operator: s.key,
            segments: [{ key: "total", label: Charts.METRIC_LABEL[state.metric], value: s.values[0] || 0, colorClass: compareColorMap.get(s.key) }],
          }));
        }
        items.sort((a, b) => b.segments[0].value - a.segments[0].value);
        Charts.renderBarChart(body, tableSlot, {
          items, metric: state.metric, categoryLabel: "Operator", chartLabel: `Compared operators for ${months[0].label}`,
        });
      } else if (state.metric === "share") {
        const marketTotals = Agg.totalsByMonth(filtered, months, "ggr");
        const series = Agg.operatorTrend(filtered, months, selectedOps, "ggr").map((s) => ({
          key: s.key, label: s.key, colorClass: compareColorMap.get(s.key), values: Agg.shareSeries(s.values, marketTotals),
        }));
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series, metric: "share", stacked: false, seriesLabel: "Operator",
        });
      } else {
        const series = Agg.operatorTrend(filtered, months, selectedOps, state.metric)
          .map((s) => ({ ...s, label: s.key, colorClass: compareColorMap.get(s.key) }));
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series, metric: state.metric, stacked: false, seriesLabel: "Operator",
        });
      }
    }

    // --- Compare: vs. market, indexed to 100 -------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.compareIndexed, {
        title: "Compared operators vs. market",
        caption: `Indexed to 100 at ${months[0] ? months[0].label : "the start"}, the first month of whatever date range is selected above. A line above the dashed 100 mark is outgrowing the market since then, below is lagging it.`,
      });
      const selectedOps = [...state.operators];
      if (selectedOps.length === 0) {
        Charts.emptyState(body, "Pick operators above to see if they're outgrowing or lagging the market.");
        tableSlot.innerHTML = "";
      } else if (singleMonth) {
        // Indexed-to-100 is a trajectory over time by definition — with one
        // month there's nothing to index against, so a bar-chart fallback
        // (like the other cards) wouldn't mean anything here either.
        Charts.emptyState(body, "Indexed growth needs more than one month to show a trajectory. Pick a wider date range to compare growth here.");
        tableSlot.innerHTML = "";
      } else {
        // "Share" and "index" are both already relative — indexing a share
        // doesn't add information, so this chart always indexes the
        // underlying GGR/Turnover/Margin growth (GGR when the toggle is on
        // Market Share %, since that's what share is a share of).
        const basisMetric = state.metric === "share" ? "ggr" : state.metric;
        const marketTotals = Agg.totalsByMonth(filtered, months, basisMetric);
        const marketSeries = { key: "Market", label: "Market (all operators)", colorClass: "series-other", values: Agg.indexSeries(marketTotals) };
        const opSeries = Agg.operatorTrend(filtered, months, selectedOps, basisMetric).map((s) => ({
          key: s.key, label: s.key, colorClass: compareColorMap.get(s.key), values: Agg.indexSeries(s.values),
        }));
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series: [marketSeries, ...opSeries], metric: "index", stacked: false, seriesLabel: "Index",
        });
      }
    }

    // --- Compare: vertical x channel matrix --------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.compareMatrix, {
        title: "Compared operators: vertical × channel breakdown",
        caption: state.metric === "share"
          ? "Each operator's % share of GGR within that exact vertical × channel slice, e.g. their share of Sportsbetting/Online specifically."
          : "Totals over the selected date range, after the vertical/channel filters above.",
      });
      const selectedOps = [...state.operators];
      const panels = selectedOps.map((op) => ({
        operator: op,
        ...(state.metric === "share"
          ? Agg.shareMatrix(filtered, op, verticalOrder, channelOrder)
          : Agg.compareMatrix(filtered, op, verticalOrder, channelOrder, state.metric)),
      }));
      Charts.renderHeatmapGrid(body, tableSlot, { panels, metric: state.metric });
    }

    syncURL();

    if (window.scrollY !== scrollYBeforeRender) window.scrollTo(window.scrollX, scrollYBeforeRender);
  }
}

boot();
