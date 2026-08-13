// js/app.js — bootstraps the dashboard: fetch the sheet, build the filter
// bar, and re-render every chart/tile whenever the filter state changes.

import {
  loadRecords, distinctMonths, distinctOperators, distinctVerticals, CHANNEL_ORDER,
} from "./data.js";
import * as Agg from "./aggregate.js";
import * as Charts from "./charts.js";
import * as Quality from "./quality.js";
import { createMultiSelect, createDateRangeControl, createSegmented, createResetButton } from "./components.js";

const statusBanner = document.getElementById("status-banner");
const filterBar = document.getElementById("filter-bar");
const kpiRow = document.getElementById("kpi-row");
const lastUpdatedEl = document.getElementById("last-updated");

const cards = {
  verticalTrend: document.getElementById("card-vertical-trend"),
  operatorShare: document.getElementById("card-group-share"),
  leaderboard: document.getElementById("card-leaderboard"),
  compareTrend: document.getElementById("card-compare-trend"),
  compareIndexed: document.getElementById("card-compare-indexed"),
  compareMatrix: document.getElementById("card-compare-matrix"),
};

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
// Theme toggle
// ---------------------------------------------------------------------------
(function initTheme() {
  const glyph = document.getElementById("theme-toggle-glyph");
  const stored = localStorage.getItem("gamdata-theme");
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  function syncGlyph() {
    const active = document.documentElement.getAttribute("data-theme")
      || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    glyph.textContent = active === "dark" ? "☀" : "☽";
  }
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme")
      || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("gamdata-theme", next);
    syncGlyph();
  });
  syncGlyph();
})();

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function setupTabs() {
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
  }
  dashboardBtn.addEventListener("click", () => activate("dashboard"));
  qualityBtn.addEventListener("click", () => activate("quality"));
}

// ---------------------------------------------------------------------------
// Data Quality tab
// ---------------------------------------------------------------------------
const QUALITY_TABLE_CAP = 300;
const QUALITY_DISMISS_KEY = "gamdata-quality-dismissed";

function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(QUALITY_DISMISS_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveDismissed(set) {
  localStorage.setItem(QUALITY_DISMISS_KEY, JSON.stringify([...set]));
}
const dismissedKeys = loadDismissed();

function updateQualityBadge(checks) {
  const activeCount = [
    ...checks.duplicates.map((g) => `dup:${g.monthKey}:${g.operator}:${g.vertical}:${g.channel}`),
    ...checks.extremeMargins.map((r) => `margin:${r.monthKey}:${r.operator}:${r.vertical}:${r.channel}`),
    ...checks.blankTurnovers.map((r) => `blank:${r.monthKey}:${r.operator}:${r.vertical}:${r.channel}`),
    ...checks.groupInconsistencies.map((g) => `group:${g.operator}`),
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
 * the raw check results; `keyFn` derives a stable localStorage key per item
 * so "not an issue" survives reloads (the sheet re-generates the same
 * finding every time otherwise); `rowFn` formats one item into display
 * cells. Dismissed rows stay visible but muted, with a "Restore" button —
 * nothing silently disappears without a visible trail back. */
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
    + (items.length > QUALITY_TABLE_CAP ? ` — showing the first ${QUALITY_TABLE_CAP} of ${items.length}.` : ".");
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
    btn.addEventListener("click", () => {
      if (dismissedKeys.has(key)) dismissedKeys.delete(key); else dismissedKeys.add(key);
      saveDismissed(dismissedKeys);
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
    "Same month + operator + vertical + channel entered more than once — the most common copy/paste slip, and it silently inflates totals for that period in every chart on the Dashboard tab.",
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
    "GGR ÷ Turnover beyond ±50%, restricted to rows with at least €5,000 of GGR so a tiny operator's small-number noise doesn't drown out real typos (a missing digit on Turnover is the usual cause).",
    checks.extremeMargins,
    ["Month", "Operator", "Vertical", "Channel", "GGR", "Turnover", "Margin"],
    (r) => `margin:${r.monthKey}:${r.operator}:${r.vertical}:${r.channel}`,
    (r) => [r.monthLabel, r.operator, r.vertical, r.channel, Charts.formatMoney(r.ggr), Charts.formatMoney(r.turnover), Charts.formatPercent(r.margin)]
  ));

  root.appendChild(buildQualitySection(
    checks,
    "Blank Turnover with non-zero GGR",
    "Not necessarily wrong — some operators genuinely don't report turnover for a channel — but it breaks margin math for that row, so worth a glance.",
    checks.blankTurnovers,
    ["Month", "Operator", "Vertical", "Channel", "GGR"],
    (r) => `blank:${r.monthKey}:${r.operator}:${r.vertical}:${r.channel}`,
    (r) => [r.monthLabel, r.operator, r.vertical, r.channel, Charts.formatMoney(r.ggr)]
  ));

  root.appendChild(buildQualitySection(
    checks,
    "Operator → Group naming inconsistencies",
    "Splits one group's totals across two labels in the Operator group's rollups. Could be spelling drift (e.g. a dropped “S.R.L.”) or a genuine ownership change — worth a look either way.",
    checks.groupInconsistencies,
    ["Operator", "Group names seen"],
    (g) => `group:${g.operator}`,
    (g) => [g.operator, g.variants.map((v) => `${v.name} (${v.count} rows, from ${v.firstSeen})`).join("   /   ")]
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

  const qualityChecks = Quality.runAllChecks(records);
  renderQualityTab(qualityChecks);
  setupTabs();
  updateQualityBadge(qualityChecks);

  const allMonths = distinctMonths(records);
  const operators = distinctOperators(records);
  const verticalOrder = distinctVerticals(records);
  const channelOrder = CHANNEL_ORDER.filter((c) => records.some((r) => r.channel === c));

  lastUpdatedEl.textContent = `Data through ${allMonths[allMonths.length - 1].label}`;

  const state = {
    from: allMonths[0].key,
    to: allMonths[allMonths.length - 1].key,
    verticals: new Set(verticalOrder),
    channels: new Set(channelOrder),
    operators: new Set(),
    metric: "ggr",
    operatorShareBasis: "ggr",
  };

  buildFilterBar();
  render();

  function monthsInRange() {
    return allMonths.filter((m) => m.key >= state.from && m.key <= state.to);
  }

  function buildFilterBar() {
    filterBar.innerHTML = "";

    const dateRange = createDateRangeControl({
      months: allMonths,
      value: { from: state.from, to: state.to },
      onChange: (v) => { state.from = v.from; state.to = v.to; render(); },
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

    const operatorSelect = createMultiSelect({
      label: "Compare operators",
      options: operators.map((o) => ({
        key: o.operator, label: o.operator, meta: o.group, colorClass: Charts.operatorColorClass(o.operator),
      })),
      selected: state.operators,
      max: 6,
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
      state.from = allMonths[0].key;
      state.to = allMonths[allMonths.length - 1].key;
      state.verticals = new Set(verticalOrder);
      state.channels = new Set(channelOrder);
      state.operators = new Set();
      state.metric = "ggr";
      state.operatorShareBasis = "ggr";
      buildFilterBar();
      render();
    });

    filterBar.append(
      dateRange.el, verticalSelect.el, channelSelect.el, operatorSelect.el, metricToggle.el, resetBtn
    );
  }

  // MoM: latest-vs-prior month totals for a metric, restricted to `months` (the
  // current date-range filter). YoY: latest month vs the same calendar month
  // one year earlier, ignoring the date-range filter (it needs a prior year
  // to exist in the full dataset, not just in the selected range).
  function momPercent(filtered, months, metric) {
    const totals = Agg.totalsByMonth(filtered, months, metric);
    const latest = totals[totals.length - 1] ?? null;
    const prev = totals.length > 1 ? totals[totals.length - 2] : null;
    if (latest === null || prev === null || prev === 0) return null;
    return ((latest - prev) / Math.abs(prev)) * 100;
  }
  function yoyPercent(filtered, months, metric) {
    const latestMonthKey = months[months.length - 1]?.key;
    if (!latestMonthKey) return null;
    const latest = Agg.totalsByMonth(filtered, months, metric).at(-1) ?? null;
    const [y, mm] = latestMonthKey.split("-").map(Number);
    const yoyKey = `${y - 1}-${String(mm).padStart(2, "0")}`;
    if (!allMonths.some((m) => m.key === yoyKey) || latest === null) return null;
    const yoyVal = Agg.sum(
      records.filter((r) => r.key === yoyKey && state.verticals.has(r.vertical) && state.channels.has(r.channel)),
      metric
    );
    return yoyVal ? ((latest - yoyVal) / Math.abs(yoyVal)) * 100 : null;
  }

  function renderKPIs(filtered, months) {
    kpiRow.innerHTML = "";

    const totalGGR = Agg.sum(filtered, "ggr");
    const totalTurnover = Agg.sum(filtered, "turnover");
    const blendedMargin = Agg.sum(filtered, "hold");
    const operatorCount = new Set(filtered.map((r) => r.operator)).size;
    // Always GGR-based regardless of the metric toggle — "share" and "index"
    // aren't quantities you can take a year-over-year delta of the same way.
    const yoyPct = yoyPercent(filtered, months, "ggr");

    addTile("Total GGR", Charts.formatMetric(totalGGR, "ggr"), momPercent(filtered, months, "ggr"), "MoM", true);
    addTile("Total Turnover", Charts.formatMetric(totalTurnover, "turnover"), momPercent(filtered, months, "turnover"), "MoM", true);
    addTile("Blended margin", Charts.formatMetric(blendedMargin, "hold"), momPercent(filtered, months, "hold"), "MoM", true);
    addTile("Year over year (GGR)", yoyPct === null ? "—" : `${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)}%`, yoyPct, "vs same month last year", true);
    addTile("Operators in view", String(operatorCount), null, "", false);
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
    const filtered = Agg.filterRecords(records, state);
    const months = monthsInRange();

    renderKPIs(filtered, months);

    // --- Market overview: trend by vertical -------------------------------
    // With 2+ verticals selected this is a real composition breakdown. With
    // exactly one vertical selected (the common case — "just Sportsbetting
    // Online") a "breakdown by vertical" of a single vertical is a pointless
    // 100%-one-color block, so it collapses to a plain total-trend line
    // instead: same card, but showing something actually useful.
    {
      const singleVertical = state.verticals.size === 1;
      if (singleVertical) {
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
      } else {
        const { body, tableSlot } = Charts.buildCardShell(cards.verticalTrend, {
          title: "Market trend by vertical",
          caption: state.metric === "hold" ? "Blended margin % per vertical, per month."
            : state.metric === "share" ? "Each vertical's % share of total GGR, per month — always sums to 100%."
            : "Stacked monthly total across the selected verticals & channels.",
        });
        const groupMetric = state.metric === "share" ? "ggr" : state.metric;
        const { series } = Agg.monthlySeries(filtered, months, "vertical", groupMetric, null);
        series.sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
        let colored = series.map((s) => ({ ...s, label: s.key, colorClass: Charts.verticalColorClass(s.key, verticalOrder) }));
        if (state.metric === "share") colored = Agg.normalizeStackToShare(colored, months);
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series: colored, metric: state.metric, stacked: state.metric !== "hold", seriesLabel: "Vertical",
        });
      }
    }

    // --- Market overview: operator share ------------------------------------
    // Always a 100%-stacked composition view — this card is titled "share",
    // so it always shows share, on its own local GGR/Turnover toggle rather
    // than the page-wide metric toggle (which also has Margin %/Share %
    // options that don't apply here and would silently produce the exact
    // same GGR-share chart, making the global toggle look broken for this
    // one card). Absolute € trend already lives in the KPI tiles and the
    // leaderboard; this chart's job is "how has the mix shifted".
    {
      const shareBasisToggle = createSegmented({
        options: [{ key: "ggr", label: "GGR" }, { key: "turnover", label: "Turnover" }],
        selected: { value: state.operatorShareBasis },
        onChange: (key) => { state.operatorShareBasis = key; render(); },
      });
      const { body, tableSlot } = Charts.buildCardShell(cards.operatorShare, {
        title: "Operator share",
        caption: `Top 7 operators' % share of total ${state.operatorShareBasis === "turnover" ? "Turnover" : "GGR"}, per month — always sums to 100%. Independent of the GGR/Turnover/Margin/Share toggle above, which scopes the rest of the dashboard.`,
        extra: shareBasisToggle.el,
      });
      const groupMetric = state.operatorShareBasis === "turnover" ? "turnover" : "ggr";
      const topOperators = Agg.topKeysByTotal(filtered, "operator", groupMetric, 7);
      const { series } = Agg.monthlySeries(filtered, months, "operator", groupMetric, topOperators);
      const others = series.find((s) => s.key === "Other");
      const ranked = series.filter((s) => s.key !== "Other")
        .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
      let colored = ranked.map((s) => ({ ...s, label: s.key, colorClass: Charts.operatorColorClass(s.key) }));
      if (others) colored.push({ ...others, label: "Other", colorClass: "series-other" });
      colored = Agg.normalizeStackToShare(colored, months);
      Charts.renderTimeSeriesChart(body, tableSlot, {
        months, series: colored, metric: "share", stacked: true, seriesLabel: "Operator",
      });
    }

    // --- Market overview: leaderboard --------------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.leaderboard, {
        title: "Operator leaderboard",
        caption: state.metric === "share"
          ? "Each operator's % share of total GGR over the selected range, after the vertical/channel filters above."
          : "Top 15 operators over the selected range. Operators picked in “Compare operators” are highlighted.",
      });
      let items;
      if (state.metric === "share") {
        const marketGGR = Agg.sum(filtered, "ggr");
        items = Agg.leaderboard(filtered, "ggr", 15).map((it) => ({
          operator: it.operator, value: marketGGR ? (it.value / marketGGR) * 100 : 0,
        }));
      } else {
        items = Agg.leaderboard(filtered, state.metric, 15);
      }
      const emphasisMap = new Map([...state.operators].map((o) => [o, Charts.operatorColorClass(o)]));
      Charts.renderBarChart(body, tableSlot, { items, metric: state.metric, emphasisMap });
    }

    // --- Compare: trend per selected operator ------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.compareTrend, {
        title: "Compared operators — trend",
        caption: state.metric === "share"
          ? "Each operator's % share of total GGR, per month, within whatever verticals & channels are selected above."
          : "Sums GGR/Turnover across whatever verticals & channels are selected above.",
      });
      const selectedOps = [...state.operators];
      if (selectedOps.length === 0) {
        Charts.emptyState(body, "Select up to 6 operators in “Compare operators” above to trace their trend here.");
        tableSlot.innerHTML = "";
      } else if (state.metric === "share") {
        const marketTotals = Agg.totalsByMonth(filtered, months, "ggr");
        const series = Agg.operatorTrend(filtered, months, selectedOps, "ggr").map((s) => ({
          key: s.key, label: s.key, colorClass: Charts.operatorColorClass(s.key), values: Agg.shareSeries(s.values, marketTotals),
        }));
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series, metric: "share", stacked: false, seriesLabel: "Operator",
        });
      } else {
        const series = Agg.operatorTrend(filtered, months, selectedOps, state.metric)
          .map((s) => ({ ...s, label: s.key, colorClass: Charts.operatorColorClass(s.key) }));
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series, metric: state.metric, stacked: false, seriesLabel: "Operator",
        });
      }
    }

    // --- Compare: vs. market, indexed to 100 -------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.compareIndexed, {
        title: "Compared operators vs. market",
        caption: `Indexed to 100 at ${months[0] ? months[0].label : "the start"} — the first month of whatever date range is selected above. A line above the dashed 100 mark is outgrowing the market since then, below is lagging it.`,
      });
      const selectedOps = [...state.operators];
      if (selectedOps.length === 0) {
        Charts.emptyState(body, "Select up to 6 operators above to see whether they're outgrowing or lagging the overall market.");
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
          key: s.key, label: s.key, colorClass: Charts.operatorColorClass(s.key), values: Agg.indexSeries(s.values),
        }));
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series: [marketSeries, ...opSeries], metric: "index", stacked: false, seriesLabel: "Index",
        });
      }
    }

    // --- Compare: vertical x channel matrix --------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.compareMatrix, {
        title: "Compared operators — vertical × channel breakdown",
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
  }
}

boot();
