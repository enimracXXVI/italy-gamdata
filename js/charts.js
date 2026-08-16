// js/charts.js — hand-rolled SVG chart primitives: line/area, bar, heatmap,
// legend, tooltip, table-view. Every element gets a class; nothing is styled
// with a style="" attribute or an inline color — colors come from the
// series-*/seq-* classes defined in css/styles.css.

const SVG_NS = "http://www.w3.org/2000/svg";

export const SERIES_CLASSES = [
  "series-1", "series-2", "series-3", "series-4",
  "series-5", "series-6", "series-7", "series-8",
];
export const SERIES_OTHER_CLASS = "series-other";
const SEQ_CLASSES = ["seq-100", "seq-200", "seq-300", "seq-400", "seq-500", "seq-600", "seq-700"];

// ---------------------------------------------------------------------------
// Color assignment
// ---------------------------------------------------------------------------

/** Stable hash so an operator keeps the same color regardless of which other
 * operators are currently selected ("color follows the entity, not its rank"). */
function hashSlot(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % SERIES_CLASSES.length;
}
export function operatorColorClass(name) {
  return SERIES_CLASSES[hashSlot(name)];
}
export function verticalColorClass(vertical, verticalOrder) {
  const i = verticalOrder.indexOf(vertical);
  return i >= 0 && i < SERIES_CLASSES.length ? SERIES_CLASSES[i] : SERIES_OTHER_CLASS;
}
export function rankColorClass(index) {
  return index < SERIES_CLASSES.length ? SERIES_CLASSES[index] : SERIES_OTHER_CLASS;
}
function seqClassForRatio(ratio) {
  const i = Math.max(0, Math.min(SEQ_CLASSES.length - 1, Math.round(ratio * (SEQ_CLASSES.length - 1))));
  return SEQ_CLASSES[i];
}
/** Money metrics (GGR/Turnover) often have one dominant vertical dwarfing the
 * rest — a linear ratio crushes every other cell to the palest step next to
 * it, which reads as "one dark cell, everything else blank". Log-scale the
 * ratio so mid-size cells stay visually distinct. Bounded metrics (margin %,
 * share %) are already well-distributed, so they stay linear. */
function heatmapRatio(value, max, metric) {
  if (value === null || value === undefined || !max) return 0;
  const v = Math.max(0, value);
  if (metric === "hold" || metric === "share") return v / max;
  return Math.log(v + 1) / Math.log(max + 1);
}
function inkClassForSeqIndex(seqClass) {
  // steps 500/600/700 are dark enough to need white ink on the cell
  return ["seq-500", "seq-600", "seq-700"].includes(seqClass) ? "cell-ink-light" : "cell-ink-dark";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  let scaled, suffix;
  if (abs >= 1e9) { scaled = n / 1e9; suffix = "B"; }
  else if (abs >= 1e6) { scaled = n / 1e6; suffix = "M"; }
  else if (abs >= 1e3) { scaled = n / 1e3; suffix = "k"; }
  else { scaled = n; suffix = ""; }
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `€${scaled.toFixed(digits)}${suffix}`;
}
export function formatPercent(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}
export function formatMetric(value, metric) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (metric === "index") return value.toFixed(1);
  if (metric === "share") return `${value.toFixed(1)}%`;
  return metric === "hold" ? formatPercent(value) : formatMoney(value);
}
export const METRIC_LABEL = { ggr: "GGR", turnover: "Turnover", hold: "Margin %", index: "Index (start = 100)", share: "Market share %" };

// ---------------------------------------------------------------------------
// DOM/SVG helpers
// ---------------------------------------------------------------------------

function svgEl(tag, attrs = {}, className) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (className) node.setAttribute("class", className);
  return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// Finer step table than the classic {1,2,5,10} — that set can leave up to
// ~43% empty headroom above the real peak (e.g. a 700-unit peak rounds all
// the way to 1000). These steps cap headroom at ~25% while still landing on
// round-looking numbers.
const NICE_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceMax(max) {
  if (max <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const residual = max / magnitude;
  const niceResidual = NICE_STEPS.find((s) => s >= residual) ?? 10;
  return niceResidual * magnitude;
}

/** Every chart's viewBox width is set to the container's real measured pixel
 * width (not a fixed constant), so 1 SVG unit = 1 real px at render time —
 * otherwise a chart in a full-width 1-col card scales its viewBox up ~2x
 * relative to the same code in a 2-col card, and every font-size/stroke-width
 * inflates along with it. This is what keeps text/stroke sizing consistent
 * across every chart regardless of how wide its card happens to be. */
function measureWidth(el, fallback = 640) {
  const w = Math.round(el.getBoundingClientRect().width);
  return w > 0 ? w : fallback;
}

/** Picks up to `maxLabels` evenly-spaced indices from a 0..n-1 range,
 * always including the first and last. Avoids the classic "modulo step"
 * bug where the forced-last label lands right next to the previous one. */
function evenlySpacedIndices(n, maxLabels) {
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const idx = new Set();
  for (let k = 0; k < maxLabels; k++) {
    idx.add(Math.round((k * (n - 1)) / (maxLabels - 1)));
  }
  return [...idx].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Tooltip (single shared instance, positioned in viewport coordinates)
// ---------------------------------------------------------------------------

const tooltipEl = document.getElementById("viz-tooltip");

export function showTooltip(clientX, clientY, title, rows) {
  clear(tooltipEl);
  const titleEl = document.createElement("div");
  titleEl.className = "tooltip__title";
  titleEl.textContent = title;
  tooltipEl.appendChild(titleEl);

  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "tooltip__row";
    const key = document.createElement("span");
    key.className = `tooltip__row-key ${row.colorClass || ""}`;
    const label = document.createElement("span");
    label.className = "tooltip__row-label";
    label.textContent = row.label;
    const value = document.createElement("span");
    value.className = "tooltip__row-value";
    value.textContent = row.value;
    rowEl.append(key, label, value);
    tooltipEl.appendChild(rowEl);
  }

  tooltipEl.hidden = false;
  const pad = 14;
  let left = clientX + pad;
  let top = clientY + pad;
  const rect = tooltipEl.getBoundingClientRect();
  if (left + rect.width > window.innerWidth - 8) left = clientX - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = clientY - rect.height - pad;
  tooltipEl.style.left = `${Math.max(8, left)}px`;
  tooltipEl.style.top = `${Math.max(8, top)}px`;
}
export function hideTooltip() { tooltipEl.hidden = true; }

// ---------------------------------------------------------------------------
// Legend (toggle-to-isolate)
// ---------------------------------------------------------------------------

export function buildLegend(items, onToggle) {
  const wrap = document.createElement("div");
  wrap.className = "viz-legend";
  const hidden = new Set();

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "viz-legend-item";
    const swatch = document.createElement("span");
    swatch.className = `viz-legend-swatch ${item.swatchType === "line" ? "viz-legend-swatch--line" : ""} ${item.colorClass}`;
    const label = document.createElement("span");
    label.textContent = item.label;
    btn.append(swatch, label);
    btn.addEventListener("click", () => {
      if (hidden.has(item.key)) hidden.delete(item.key); else hidden.add(item.key);
      btn.classList.toggle("viz-legend-item--dimmed", hidden.has(item.key));
      onToggle(hidden);
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Table view (accessibility twin) — generic builder
// ---------------------------------------------------------------------------

export function buildTable({ caption, columns, rows }) {
  const wrap = document.createElement("div");
  wrap.className = "viz-table-wrap";
  const table = document.createElement("table");
  table.className = "viz-table";

  if (caption) {
    const cap = document.createElement("caption");
    cap.textContent = caption;
    table.appendChild(cap);
  }
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

let openInfoPopoverCloser = null;

/** Small "ⓘ" button + popover, used to move a chart's explanation out of
 * permanent on-card text. Click/tap toggles it (works on touch, where hover
 * doesn't exist); it also opens on mouse hover as a desktop convenience. */
function buildInfoButton(text) {
  const wrap = document.createElement("span");
  wrap.className = "info-button-wrap";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "info-button";
  button.textContent = "i";
  button.setAttribute("aria-label", "About this chart");

  const popover = document.createElement("div");
  popover.className = "info-popover";
  popover.textContent = text;
  popover.hidden = true;

  let isOpen = false;
  function close() {
    if (!isOpen) return;
    popover.hidden = true;
    isOpen = false;
    if (openInfoPopoverCloser === close) openInfoPopoverCloser = null;
    document.removeEventListener("pointerdown", onOutside, true);
  }
  function onOutside(evt) {
    if (!wrap.contains(evt.target)) close();
  }
  function open() {
    if (isOpen) return;
    if (openInfoPopoverCloser) openInfoPopoverCloser();
    popover.hidden = false;
    popover.classList.remove("info-popover--flip");
    isOpen = true;
    openInfoPopoverCloser = close;
    document.addEventListener("pointerdown", onOutside, true);
    // The button can sit anywhere along a card's title row, so a fixed
    // left-anchored popover runs off the right edge of the screen whenever
    // it's opened from a button positioned more than ~280px from the left —
    // exactly the "have to scroll sideways to read it" bug on mobile. Flip
    // to hang from the right edge of the button instead, once we can
    // actually measure where it landed.
    if (popover.getBoundingClientRect().right > window.innerWidth) {
      popover.classList.add("info-popover--flip");
    }
  }
  // Click always opens (never toggles-closed) — a toggle here would fight
  // the hover handler below: a mouse click fires `mouseenter` before
  // `click`, so by the time `click` ran the popover would already be open
  // and a toggle would immediately close what hover just opened. Closing is
  // handled by mouseleave (desktop) and the outside-pointerdown listener
  // (desktop click-away and touch tap-away alike).
  button.addEventListener("click", (evt) => {
    evt.stopPropagation();
    open();
  });
  wrap.addEventListener("mouseenter", open);
  wrap.addEventListener("mouseleave", close);

  wrap.append(button, popover);
  return wrap;
}

/** Wires the standard chart-card header: title, caption, and a table-view
 * toggle button that swaps the chart body for its table twin. `caption`
 * (the "what am I looking at" explanation) lives behind a small (i) button
 * next to the title rather than as permanent text — hover or tap/click to
 * read it, so the card's default state is just the chart. `extra` is an
 * optional DOM node, or array of them (e.g. small local toggles), inserted
 * before the table button. */
export function buildCardShell(card, { title, caption, extra }) {
  clear(card);
  const header = document.createElement("div");
  header.className = "chart-card__header";

  const titleRow = document.createElement("div");
  titleRow.className = "chart-card__title-row";
  const h3 = document.createElement("h3");
  h3.className = "chart-card__title";
  h3.textContent = title;
  titleRow.appendChild(h3);
  if (caption) titleRow.appendChild(buildInfoButton(caption));

  const controls = document.createElement("div");
  controls.className = "chart-card__controls";
  if (extra) for (const el of Array.isArray(extra) ? extra : [extra]) controls.appendChild(el);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "table-toggle";
  toggle.textContent = "View as table";
  controls.appendChild(toggle);

  header.append(titleRow, controls);

  const body = document.createElement("div");
  const tableSlot = document.createElement("div");
  tableSlot.hidden = true;

  card.append(header, body, tableSlot);

  let showingTable = false;
  toggle.addEventListener("click", () => {
    showingTable = !showingTable;
    body.hidden = showingTable;
    tableSlot.hidden = !showingTable;
    toggle.textContent = showingTable ? "View as chart" : "View as table";
    toggle.classList.toggle("table-toggle--active", showingTable);
  });

  return { body, tableSlot };
}

export function emptyState(container, message) {
  clear(container);
  const p = document.createElement("p");
  p.className = "chart-card__empty";
  p.textContent = message;
  container.appendChild(p);
}

// ---------------------------------------------------------------------------
// Line / stacked-area chart
// ---------------------------------------------------------------------------

export function renderTimeSeriesChart(body, tableSlot, { months, series, metric, stacked, seriesLabel }) {
  clear(body);
  if (months.length === 0 || series.length === 0) {
    emptyState(body, "No data for the current filters.");
    return;
  }

  const W = measureWidth(body), H = 260;
  const marginL = 56, marginR = 12, marginT = 12, marginB = 28;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  // An "index" chart (operator vs. market, both rebased to 100) is centered
  // on its data range rather than 0 — a 0-based axis would waste most of the
  // plot on empty space below values that hover around 100.
  let yMin = 0, yMax;
  if (metric === "index") {
    const allVals = series.flatMap((s) => s.values).filter((v) => typeof v === "number");
    const dataMin = Math.min(100, ...(allVals.length ? allVals : [100]));
    const dataMax = Math.max(100, ...(allVals.length ? allVals : [100]));
    const pad = Math.max(5, (dataMax - dataMin) * 0.2);
    yMin = Math.floor((dataMin - pad) / 10) * 10;
    yMax = Math.ceil((dataMax + pad) / 10) * 10;
  } else if (metric === "share" && stacked) {
    // A 100%-stacked share chart sums to exactly 100 by construction
    // (normalizeStackToShare) — pin the axis rather than let floating-point
    // summation noise (100.00000000001) trip niceMax's ">1" rounding
    // threshold and double it to 200.
    yMax = 100;
  } else {
    const stackedTotals = months.map((_, i) => series.reduce((acc, s) => acc + (s.values[i] || 0), 0));
    const rawMax = stacked ? Math.max(...stackedTotals) : Math.max(...series.flatMap((s) => s.values));
    yMax = niceMax(rawMax || 1);
  }

  const xFor = (i) => marginL + (months.length === 1 ? plotW / 2 : (i / (months.length - 1)) * plotW);
  const yFor = (v) => marginT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Trend chart" }, "viz-svg");

  // gridlines + y labels
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const v = yMin + ((yMax - yMin) / ticks) * t;
    const y = yFor(v);
    svg.appendChild(svgEl("line", { x1: marginL, x2: W - marginR, y1: y, y2: y }, "viz-gridline"));
    const label = svgEl("text", { x: marginL - 8, y: y + 3 }, "viz-axis-label viz-axis-label--y");
    label.textContent = formatMetric(v, metric);
    svg.appendChild(label);
  }
  svg.appendChild(svgEl("line", { x1: marginL, x2: marginL, y1: marginT, y2: marginT + plotH }, "viz-axis-line"));
  svg.appendChild(svgEl("line", { x1: marginL, x2: W - marginR, y1: marginT + plotH, y2: marginT + plotH }, "viz-axis-line"));
  if (metric === "index" && 100 > yMin && 100 < yMax) {
    svg.appendChild(svgEl("line", { x1: marginL, x2: W - marginR, y1: yFor(100), y2: yFor(100) }, "viz-baseline"));
  }

  // x labels: evenly spaced (never a modulo-step clash at the last label),
  // count adapts to the chart's real measured width so labels never crowd.
  const maxLabels = Math.max(3, Math.min(8, Math.floor(plotW / 68)));
  for (const i of evenlySpacedIndices(months.length, maxLabels)) {
    const label = svgEl("text", { x: xFor(i), y: H - 8 }, "viz-axis-label viz-axis-label--x");
    const [monthName, year] = months[i].label.split(" ");
    label.textContent = `${monthName.slice(0, 3)} ${year.slice(2)}`;
    svg.appendChild(label);
  }

  const plotGroup = svgEl("g");
  svg.appendChild(plotGroup);

  if (stacked) {
    let cumulative = months.map(() => 0);
    for (const s of series) {
      const topPts = months.map((_, i) => {
        cumulative[i] += s.values[i] || 0;
        return cumulative[i];
      });
      const bottomPts = topPts.map((v, i) => v - (s.values[i] || 0));
      const top = months.map((_, i) => `${xFor(i)},${yFor(topPts[i])}`).join(" L ");
      const bottom = months.map((_, i) => `${xFor(i)},${yFor(bottomPts[i])}`).reverse().join(" L ");
      const d = `M ${top} L ${bottom} Z`;
      plotGroup.appendChild(svgEl("path", { d }, `viz-area viz-area-stack-gap ${s.colorClass}`));
    }
  } else {
    for (const s of series) {
      const d = "M " + months.map((_, i) => `${xFor(i)},${yFor(s.values[i] || 0)}`).join(" L ");
      plotGroup.appendChild(svgEl("path", { d }, `viz-line ${s.colorClass}`));
    }
  }

  // hover layer: crosshair + per-series markers + tooltip
  const crosshair = svgEl("line", { x1: 0, x2: 0, y1: marginT, y2: marginT + plotH, visibility: "hidden" }, "viz-crosshair-line");
  svg.appendChild(crosshair);
  const markers = series.map((s) => svgEl("circle", { r: 3.5, visibility: "hidden" }, `viz-marker ${s.colorClass}`));
  markers.forEach((m) => svg.appendChild(m));

  const hit = svgEl("rect", { x: marginL, y: marginT, width: plotW, height: plotH }, "viz-hit-rect");
  svg.appendChild(hit);

  function nearestIndex(clientX) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    const ctm = svg.getScreenCTM().inverse();
    const local = pt.matrixTransform(ctm);
    const ratio = months.length === 1 ? 0 : (local.x - marginL) / plotW;
    return Math.max(0, Math.min(months.length - 1, Math.round(ratio * (months.length - 1))));
  }

  function onMove(evt) {
    const i = nearestIndex(evt.clientX);
    const x = xFor(i);
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.setAttribute("visibility", "visible");

    const rows = [];
    series.forEach((s, si) => {
      const v = stacked
        ? series.slice(0, si + 1).reduce((acc, ss) => acc + (ss.values[i] || 0), 0)
        : s.values[i] || 0;
      markers[si].setAttribute("cx", x);
      markers[si].setAttribute("cy", yFor(v));
      markers[si].setAttribute("visibility", "visible");
      const raw = s.values[i] || 0;
      rows.push({ colorClass: s.colorClass, label: s.label, value: formatMetric(raw, metric) });
    });
    showTooltip(evt.clientX, evt.clientY, months[i].label, rows);
  }
  function onLeave() {
    crosshair.setAttribute("visibility", "hidden");
    markers.forEach((m) => m.setAttribute("visibility", "hidden"));
    hideTooltip();
  }
  hit.addEventListener("pointermove", onMove);
  hit.addEventListener("pointerdown", onMove);
  hit.addEventListener("pointerleave", onLeave);

  body.appendChild(svg);

  if (series.length > 1) {
    body.appendChild(buildLegend(
      series.map((s) => ({ key: s.key, label: s.label, colorClass: s.colorClass, swatchType: stacked ? "rect" : "line" })),
      (hiddenSet) => {
        Array.from(plotGroup.children).forEach((node, i) => {
          node.classList.toggle("viz-bar--dim", hiddenSet.has(series[i].key));
        });
      }
    ));
  }

  clear(tableSlot);
  tableSlot.appendChild(buildTable({
    caption: `${seriesLabel || "Series"} by month (${METRIC_LABEL[metric]})`,
    columns: ["Month", ...series.map((s) => s.label)],
    rows: months.map((m, i) => [m.label, ...series.map((s) => formatMetric(s.values[i] || 0, metric))]),
  }));
}

// ---------------------------------------------------------------------------
// Horizontal bar chart (leaderboard)
// ---------------------------------------------------------------------------

/** `items`: [{ operator, segments: [{key, label, value, colorClass}], dim? }].
 * A single-segment row (mode "as is") renders as a plain bar; 2+ segments
 * render as a stacked horizontal bar with a thin gap between them. The
 * total (sum of segments) drives the row's overall length and end label.
 * `dim`, when true, mutes a row (used to de-emphasize non-compared
 * operators once one of the split modes makes per-operator color emphasis
 * impractical). Despite the field name, `item.operator` is just "this row's
 * category label" — reused as-is for non-operator breakdowns (e.g. a
 * single-month vertical breakdown); `categoryLabel`/`chartLabel` control
 * what the axis/table/aria-label call that category everywhere else. */
export function renderBarChart(body, tableSlot, { items, metric, legend, categoryLabel = "Operator", chartLabel }) {
  clear(body);
  chartLabel = chartLabel ?? `${categoryLabel} leaderboard`;
  if (items.length === 0) {
    emptyState(body, "No data for the current filters.");
    return;
  }
  const rowH = 26, gap = 8;
  // A `note` appends "(N%)" after the value — needs more room on the right
  // than a bare value does, or the combined text overflows past the card's
  // own edge (the SVG doesn't clip text by default).
  const hasNotes = items.some((it) => it.note);
  const marginL = 8, marginR = hasNotes ? 130 : 64, marginT = 4, marginB = 4;
  const maxLabelChars = 24;
  const truncate = (s) => (s.length > maxLabelChars ? `${s.slice(0, maxLabelChars - 1)}…` : s);
  // Sized to the longest label actually present (capped at the truncation
  // width), not a flat constant — a fixed-width column leaves a dead gap
  // between the card's left edge and short labels like "Casino" or a
  // single operator name.
  const longestLabel = Math.max(...items.map((it) => truncate(String(it.operator ?? "")).length), 1);
  const labelColW = Math.min(168, Math.max(40, Math.round(longestLabel * 6.3 + 16)));
  const W = measureWidth(body);
  const plotW = W - marginL - marginR - labelColW;
  const H = marginT + marginB + items.length * (rowH + gap) - gap;

  const totals = items.map((it) => it.segments.reduce((s, seg) => s + seg.value, 0));
  const max = Math.max(...totals, 1);
  const xScale = (v) => Math.max(0, (v / max) * plotW);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": chartLabel }, "viz-svg");

  items.forEach((it, i) => {
    const y = marginT + i * (rowH + gap);
    const barX = marginL + labelColW;
    const total = totals[i];

    // Left-aligned at the card's own left edge, not right-aligned against
    // the bar — a shared right-aligned column leaves a dead gap before any
    // label shorter than the longest one in the set (e.g. "Casino" next to
    // "Horse Racing Fixed Odds"); left-aligned, that same slack falls after
    // the label instead, which reads as normal column spacing, not a gap.
    const label = svgEl("text", { x: marginL, y: y + rowH / 2 + 4 }, "viz-bar-category-label");
    label.textContent = truncate(it.operator);
    if (it.dim) label.classList.add("viz-bar--dim");
    svg.appendChild(label);

    const multiSegment = it.segments.length > 1;
    let cx = barX;
    for (const seg of it.segments) {
      const w = xScale(seg.value);
      if (w <= 0) continue;
      const rectAttrs = multiSegment
        ? { x: cx, y, width: Math.max(2, w), height: rowH }
        : { x: cx, y, width: Math.max(2, w), height: rowH, rx: 4, ry: 4 };
      const rectClass = `viz-bar ${multiSegment ? "viz-bar-segment" : ""} ${seg.colorClass}${it.dim ? " viz-bar--dim" : ""}`;
      svg.appendChild(svgEl("rect", rectAttrs, rectClass));
      cx += w;
    }

    const valueLabel = svgEl("text", { x: cx + 8, y: y + rowH / 2 + 4 }, "viz-bar-label");
    valueLabel.textContent = it.note ? `${formatMetric(total, metric)}  (${it.note})` : formatMetric(total, metric);
    svg.appendChild(valueLabel);

    const hitArea = svgEl("rect", { x: marginL, y, width: labelColW + plotW, height: rowH }, "viz-hit-rect");
    svg.appendChild(hitArea);
    const tooltipRows = it.segments.length > 1
      ? it.segments.map((seg) => ({ colorClass: seg.colorClass, label: seg.label, value: formatMetric(seg.value, metric) }))
      : [{ colorClass: it.segments[0]?.colorClass, label: METRIC_LABEL[metric], value: formatMetric(total, metric) }];
    if (it.note) tooltipRows.push({ label: "% of total", value: it.note });
    const onHover = (evt) => showTooltip(evt.clientX, evt.clientY, it.operator, tooltipRows);
    hitArea.addEventListener("pointermove", onHover);
    hitArea.addEventListener("pointerdown", onHover);
    hitArea.addEventListener("pointerleave", hideTooltip);
  });

  body.appendChild(svg);

  const segmented = items[0]?.segments.length > 1;
  if (segmented && legend) {
    body.appendChild(buildLegend(legend, () => {}));
  }

  clear(tableSlot);
  const segmentKeys = segmented ? items[0].segments.map((s) => s.label) : [];
  tableSlot.appendChild(buildTable({
    caption: `${chartLabel} (${METRIC_LABEL[metric]})`,
    columns: [categoryLabel, ...segmentKeys, "Total", ...(hasNotes ? ["% of total"] : [])],
    rows: items.map((it, i) => [
      it.operator,
      ...(segmented ? it.segments.map((seg) => formatMetric(seg.value, metric)) : []),
      formatMetric(totals[i], metric),
      ...(hasNotes ? [it.note ?? ""] : []),
    ]),
  }));
}

// ---------------------------------------------------------------------------
// Diverging bar chart (growth vs. a baseline — MoM/YoY by category)
// ---------------------------------------------------------------------------

/** `items`: [{ key, value }] — `value` is a signed growth percent (12.4 for
 * +12.4%, -8.1 for -8.1%) or `null`/`undefined` when there's nothing to
 * compare against (e.g. no same-month-last-year data yet). Bars grow from a
 * center 0% line, right for growth, left for decline. This is a *state*
 * (growing vs. shrinking), not a series identity, so it's colored with the
 * same --delta-good/--delta-bad pair the KPI tiles already use for exactly
 * this meaning — not a categorical hue — and every value carries its own
 * +/- sign as the required label pairing for a state color. */
export function renderDivergingBarChart(body, tableSlot, { items, valueColumnLabel, chartLabel }) {
  clear(body);
  if (items.length === 0) {
    emptyState(body, "No data for the current filters.");
    return;
  }
  const rowH = 26, gap = 8;
  const marginL = 8, marginR = 64, marginT = 4, marginB = 4;
  const maxLabelChars = 24;
  const truncate = (s) => (s.length > maxLabelChars ? `${s.slice(0, maxLabelChars - 1)}…` : s);
  const longestLabel = Math.max(...items.map((it) => truncate(String(it.key ?? "")).length), 1);
  const labelColW = Math.min(168, Math.max(40, Math.round(longestLabel * 6.3 + 16)));
  const W = measureWidth(body);
  const barAreaX0 = marginL + labelColW;
  const barAreaW = Math.max(0, W - marginL - labelColW - marginR);
  const centerX = barAreaX0 + barAreaW / 2;
  const halfW = barAreaW / 2;
  const H = marginT + marginB + items.length * (rowH + gap) - gap;

  const maxAbs = Math.max(...items.map((it) => Math.abs(it.value ?? 0)), 1);
  const xScale = (v) => (Math.abs(v) / maxAbs) * halfW;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": chartLabel }, "viz-svg");
  svg.appendChild(svgEl("line", { x1: centerX, x2: centerX, y1: marginT, y2: H - marginB }, "viz-baseline"));

  items.forEach((it, i) => {
    const y = marginT + i * (rowH + gap);

    const label = svgEl("text", { x: marginL, y: y + rowH / 2 + 4 }, "viz-bar-category-label");
    label.textContent = truncate(String(it.key ?? ""));
    svg.appendChild(label);

    const hasValue = typeof it.value === "number" && Number.isFinite(it.value);
    const positive = hasValue && it.value >= 0;
    let valueX = centerX, anchor = "middle", valueText = "—", labelDirClass = "";
    if (hasValue) {
      const w = xScale(it.value);
      if (w > 0) {
        const rectAttrs = positive ? { x: centerX, y, width: w, height: rowH } : { x: centerX - w, y, width: w, height: rowH };
        svg.appendChild(svgEl("rect", rectAttrs, `viz-diverging-bar ${positive ? "viz-diverging-bar--pos" : "viz-diverging-bar--neg"}`));
      }
      valueX = positive ? centerX + w + 8 : centerX - w - 8;
      anchor = positive ? "start" : "end";
      valueText = `${positive ? "+" : ""}${it.value.toFixed(1)}%`;
      labelDirClass = positive ? "viz-bar-label--good" : "viz-bar-label--bad";
    }
    const valueLabel = svgEl("text", { x: valueX, y: y + rowH / 2 + 4, "text-anchor": anchor }, `viz-bar-label ${labelDirClass}`);
    valueLabel.textContent = valueText;
    svg.appendChild(valueLabel);

    const hitArea = svgEl("rect", { x: marginL, y, width: Math.max(0, W - marginL - marginR), height: rowH }, "viz-hit-rect");
    svg.appendChild(hitArea);
    const onHover = (evt) => showTooltip(evt.clientX, evt.clientY, String(it.key ?? ""), [
      { label: valueColumnLabel, value: hasValue ? valueText : "No comparable prior period" },
    ]);
    hitArea.addEventListener("pointermove", onHover);
    hitArea.addEventListener("pointerdown", onHover);
    hitArea.addEventListener("pointerleave", hideTooltip);
  });

  body.appendChild(svg);

  clear(tableSlot);
  tableSlot.appendChild(buildTable({
    caption: chartLabel,
    columns: ["Category", valueColumnLabel],
    rows: items.map((it) => [
      String(it.key ?? ""),
      typeof it.value === "number" && Number.isFinite(it.value) ? `${it.value >= 0 ? "+" : ""}${it.value.toFixed(1)}%` : "—",
    ]),
  }));
}

// ---------------------------------------------------------------------------
// Heatmap (small multiples: one per operator, Vertical x Channel)
// ---------------------------------------------------------------------------

export function renderHeatmapGrid(body, tableSlot, { panels, metric }) {
  clear(body);
  if (panels.length === 0) {
    emptyState(body, "Select one or more operators above to see their vertical × channel breakdown.");
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "chart-grid chart-grid--2col";

  const tableRows = [];

  for (const panel of panels) {
    const { operator, rows, cols, matrix } = panel;
    const sub = document.createElement("div");

    const heading = document.createElement("p");
    heading.className = "chart-card__caption";
    heading.textContent = operator;
    sub.appendChild(heading);

    if (rows.length === 0 || cols.length === 0) {
      const p = document.createElement("p");
      p.className = "chart-card__empty";
      p.textContent = "No data for the current filters.";
      sub.appendChild(p);
      wrap.appendChild(sub);
      continue;
    }

    const cellW = 96, cellH = 30, rowLabelW = 168, colHeaderH = 20;
    const W = rowLabelW + cols.length * cellW;
    const H = colHeaderH + rows.length * cellH;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${operator} breakdown` }, "viz-svg viz-svg--fixed");

    const max = Math.max(...matrix.flat().filter((v) => v !== null && v !== undefined), 1);

    cols.forEach((c, ci) => {
      const x = rowLabelW + ci * cellW + cellW / 2;
      const label = svgEl("text", { x, y: 14 }, "viz-heatmap-col-label");
      label.textContent = c;
      svg.appendChild(label);
    });

    rows.forEach((v, ri) => {
      const y = colHeaderH + ri * cellH + cellH / 2 + 4;
      const label = svgEl("text", { x: rowLabelW - 10, y }, "viz-heatmap-row-label");
      label.textContent = v;
      svg.appendChild(label);

      cols.forEach((c, ci) => {
        const value = matrix[ri][ci];
        const seqClass = value === null || value === undefined ? "seq-100" : seqClassForRatio(heatmapRatio(value, max, metric));
        const x = rowLabelW + ci * cellW;
        const y = colHeaderH + ri * cellH;
        const cell = svgEl("rect", { x, y, width: cellW, height: cellH }, `viz-cell ${seqClass}`);
        svg.appendChild(cell);

        const cellLabel = svgEl("text", { x: x + cellW / 2, y: y + cellH / 2 }, `viz-cell-label ${inkClassForSeqIndex(seqClass)}`);
        cellLabel.textContent = value === null || value === undefined ? "—" : formatMetric(value, metric);
        svg.appendChild(cellLabel);

        cell.addEventListener("pointermove", (evt) => {
          showTooltip(evt.clientX, evt.clientY, `${operator} — ${v}`, [
            { colorClass: seqClass, label: c, value: formatMetric(value, metric) },
          ]);
        });
        cell.addEventListener("pointerdown", (evt) => {
          showTooltip(evt.clientX, evt.clientY, `${operator} — ${v}`, [
            { colorClass: seqClass, label: c, value: formatMetric(value, metric) },
          ]);
        });
        cell.addEventListener("pointerleave", hideTooltip);

        tableRows.push([operator, v, c, value === null || value === undefined ? "—" : formatMetric(value, metric)]);
      });
    });

    sub.appendChild(svg);
    wrap.appendChild(sub);
  }

  body.appendChild(wrap);

  clear(tableSlot);
  tableSlot.appendChild(buildTable({
    caption: `Operator breakdown by vertical × channel (${METRIC_LABEL[metric]})`,
    columns: ["Operator", "Vertical", "Channel", METRIC_LABEL[metric]],
    rows: tableRows,
  }));
}
