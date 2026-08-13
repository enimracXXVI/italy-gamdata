// js/app.js — bootstraps the dashboard: fetch the sheet, build the filter
// bar, and re-render every chart/tile whenever the filter state changes.

import {
  loadRecords, distinctMonths, distinctOperators, distinctVerticals, CHANNEL_ORDER,
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
  groupShare: document.getElementById("card-group-share"),
  leaderboard: document.getElementById("card-leaderboard"),
  compareTrend: document.getElementById("card-compare-trend"),
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
  hideStatus();

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
        { key: "hold", label: "Hold %" },
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

  function renderKPIs(filtered, months) {
    kpiRow.innerHTML = "";
    const totals = Agg.totalsByMonth(filtered, months, state.metric);
    const latest = totals[totals.length - 1] ?? 0;
    const prev = totals.length > 1 ? totals[totals.length - 2] : null;
    const momPct = prev !== null && prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : null;

    const latestMonthKey = months[months.length - 1]?.key;
    let yoyPct = null;
    if (latestMonthKey) {
      const [y, mm] = latestMonthKey.split("-").map(Number);
      const yoyKey = `${y - 1}-${mm.toString().padStart(2, "0")}`;
      const yoyIdx = allMonths.findIndex((m) => m.key === yoyKey);
      if (yoyIdx >= 0) {
        const yoyVal = Agg.sum(records.filter((r) => r.key === yoyKey && state.verticals.has(r.vertical) && state.channels.has(r.channel)), state.metric);
        if (yoyVal) yoyPct = ((latest - yoyVal) / Math.abs(yoyVal)) * 100;
      }
    }

    const totalGGR = Agg.sum(filtered, "ggr");
    const totalTurnover = Agg.sum(filtered, "turnover");
    const blendedHold = Agg.sum(filtered, "hold");
    const operatorCount = new Set(filtered.map((r) => r.operator)).size;

    addTile("Total GGR", Charts.formatMetric(totalGGR, "ggr"), momPct, "vs prior month", state.metric === "ggr");
    addTile("Total Turnover", Charts.formatMetric(totalTurnover, "turnover"), null, "", false);
    addTile("Blended hold", Charts.formatMetric(blendedHold, "hold"), null, "", false);
    addTile(`${Charts.METRIC_LABEL[state.metric]}, latest month`, Charts.formatMetric(latest, state.metric), momPct, "MoM", true);
    addTile("Year over year", yoyPct === null ? "—" : `${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)}%`, yoyPct, "vs same month last year", true);
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
        caption: state.metric === "hold" ? "Blended hold % per vertical, per month." : "Stacked monthly total across the selected verticals & channels.",
      });
      const { series } = Agg.monthlySeries(filtered, months, "vertical", state.metric, null);
      series.sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
      const colored = series.map((s) => ({ ...s, label: s.key, colorClass: Charts.verticalColorClass(s.key, verticalOrder) }));
      Charts.renderTimeSeriesChart(body, tableSlot, {
        months, series: colored, metric: state.metric, stacked: state.metric !== "hold", seriesLabel: "Vertical",
      });
    }

    // --- Market overview: operator group share -----------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.groupShare, {
        title: "Operator group share",
        caption: "Top 7 groups by volume; smaller groups fold into “Other”.",
      });
      const topGroups = Agg.topKeysByTotal(filtered, "operatorGroup", state.metric === "hold" ? "ggr" : state.metric, 7);
      const { series } = Agg.monthlySeries(filtered, months, "operatorGroup", state.metric, topGroups);
      const others = series.find((s) => s.key === "Other");
      const ranked = series.filter((s) => s.key !== "Other")
        .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
      const colored = ranked.map((s, i) => ({ ...s, label: s.key, colorClass: Charts.rankColorClass(i) }));
      if (others) colored.push({ ...others, label: "Other", colorClass: "series-other" });
      Charts.renderTimeSeriesChart(body, tableSlot, {
        months, series: colored, metric: state.metric, stacked: state.metric !== "hold", seriesLabel: "Operator group",
      });
    }

    // --- Market overview: leaderboard --------------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.leaderboard, {
        title: "Operator leaderboard",
        caption: "Top 15 operators over the selected range. Operators picked in “Compare operators” are highlighted.",
      });
      const items = Agg.leaderboard(filtered, state.metric, 15);
      const emphasisMap = new Map([...state.operators].map((o) => [o, Charts.operatorColorClass(o)]));
      Charts.renderBarChart(body, tableSlot, { items, metric: state.metric, emphasisMap });
    }

    // --- Compare: trend per selected operator ------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.compareTrend, {
        title: "Compared operators — trend",
        caption: "Sums GGR/Turnover across whatever verticals & channels are selected above.",
      });
      const selectedOps = [...state.operators];
      if (selectedOps.length === 0) {
        Charts.emptyState(body, "Select up to 6 operators in “Compare operators” above to trace their trend here.");
        tableSlot.innerHTML = "";
      } else {
        const series = Agg.operatorTrend(filtered, months, selectedOps, state.metric)
          .map((s) => ({ ...s, label: s.key, colorClass: Charts.operatorColorClass(s.key) }));
        Charts.renderTimeSeriesChart(body, tableSlot, {
          months, series, metric: state.metric, stacked: false, seriesLabel: "Operator",
        });
      }
    }

    // --- Compare: vertical x channel matrix --------------------------------
    {
      const { body, tableSlot } = Charts.buildCardShell(cards.compareMatrix, {
        title: "Compared operators — vertical × channel breakdown",
        caption: "Totals over the selected date range, after the vertical/channel filters above.",
      });
      const selectedOps = [...state.operators];
      const panels = selectedOps.map((op) => ({
        operator: op,
        ...Agg.compareMatrix(filtered, op, verticalOrder, channelOrder, state.metric),
      }));
      Charts.renderHeatmapGrid(body, tableSlot, { panels, metric: state.metric });
    }
  }
}

boot();
