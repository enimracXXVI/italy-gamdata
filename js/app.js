// js/app.js — bootstraps the dashboard: fetch the sheet, build the filter
// bar, and re-render every chart/tile whenever the filter state changes.

import {
  loadRecords, distinctMonths, distinctOperators, distinctVerticals, findDuplicateRows, CHANNEL_ORDER,
} from "./data.js";
import * as Agg from "./aggregate.js";
import * as Charts from "./charts.js";
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

  const dupes = findDuplicateRows(records);
  if (dupes) {
    const top = dupes.months[0];
    const restCount = dupes.months.length - 1;
    const detail = restCount > 0
      ? `Worst: ${top.label} has ${top.count} operator/vertical/channel combos entered more than once (plus smaller repeats in ${restCount} other month${restCount === 1 ? "" : "s"}). Totals for those months are inflated until the extra rows are removed from the sheet.`
      : `${top.label} has ${top.count} operator/vertical/channel combos entered more than once. Totals for that month are inflated until the extra rows are removed from the sheet.`;
    showStatus("warning", `Data quality: ${dupes.rowCount} duplicate rows found`, detail);
  } else {
    hideStatus();
  }

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
    {
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

    // --- Market overview: operator share ------------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.operatorShare, {
        title: "Operator share",
        caption: state.metric === "share" ? "Top 7 operators' % share of total GGR, per month — always sums to 100%."
          : "Top 7 operators by volume; smaller operators fold into “Other”.",
      });
      const groupMetric = state.metric === "share" ? "ggr" : state.metric;
      const topOperators = Agg.topKeysByTotal(filtered, "operator", groupMetric === "hold" ? "ggr" : groupMetric, 7);
      const { series } = Agg.monthlySeries(filtered, months, "operator", groupMetric, topOperators);
      const others = series.find((s) => s.key === "Other");
      const ranked = series.filter((s) => s.key !== "Other")
        .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
      let colored = ranked.map((s) => ({ ...s, label: s.key, colorClass: Charts.operatorColorClass(s.key) }));
      if (others) colored.push({ ...others, label: "Other", colorClass: "series-other" });
      if (state.metric === "share") colored = Agg.normalizeStackToShare(colored, months);
      Charts.renderTimeSeriesChart(body, tableSlot, {
        months, series: colored, metric: state.metric, stacked: state.metric !== "hold", seriesLabel: "Operator",
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
        caption: `Indexed to 100 at ${months[0] ? months[0].label : "the start of the range"} — a line above the dashed 100 mark is outgrowing the market, below is lagging it.`,
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
