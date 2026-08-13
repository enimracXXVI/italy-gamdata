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
  return metric === "hold" ? formatPercent(value) : formatMoney(value);
}
export const METRIC_LABEL = { ggr: "GGR", turnover: "Turnover", hold: "Hold %" };

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

function niceMax(max) {
  if (max <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const residual = max / magnitude;
  let niceResidual;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  return niceResidual * magnitude;
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

/** Wires the standard chart-card header: title, caption, and a table-view
 * toggle button that swaps the chart body for its table twin. */
export function buildCardShell(card, { title, caption }) {
  clear(card);
  const header = document.createElement("div");
  header.className = "chart-card__header";
  const titles = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.className = "chart-card__title";
  h3.textContent = title;
  titles.appendChild(h3);
  if (caption) {
    const cap = document.createElement("p");
    cap.className = "chart-card__caption";
    cap.textContent = caption;
    titles.appendChild(cap);
  }
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "table-toggle";
  toggle.textContent = "View as table";
  header.append(titles, toggle);

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

  const W = 640, H = 260;
  const marginL = 56, marginR = 12, marginT = 12, marginB = 28;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  const stackedTotals = months.map((_, i) => series.reduce((acc, s) => acc + (s.values[i] || 0), 0));
  const rawMax = stacked ? Math.max(...stackedTotals) : Math.max(...series.flatMap((s) => s.values));
  const yMax = niceMax(rawMax || 1);

  const xFor = (i) => marginL + (months.length === 1 ? plotW / 2 : (i / (months.length - 1)) * plotW);
  const yFor = (v) => marginT + plotH - (v / yMax) * plotH;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Trend chart" }, "viz-svg");

  // gridlines + y labels
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const v = (yMax / ticks) * t;
    const y = yFor(v);
    svg.appendChild(svgEl("line", { x1: marginL, x2: W - marginR, y1: y, y2: y }, "viz-gridline"));
    const label = svgEl("text", { x: marginL - 8, y: y + 3 }, "viz-axis-label viz-axis-label--y");
    label.textContent = formatMetric(v, metric);
    svg.appendChild(label);
  }
  svg.appendChild(svgEl("line", { x1: marginL, x2: marginL, y1: marginT, y2: marginT + plotH }, "viz-axis-line"));
  svg.appendChild(svgEl("line", { x1: marginL, x2: W - marginR, y1: marginT + plotH, y2: marginT + plotH }, "viz-axis-line"));

  // x labels (thin out on narrow month counts)
  const maxLabels = 7;
  const step = Math.max(1, Math.ceil(months.length / maxLabels));
  months.forEach((m, i) => {
    if (i % step !== 0 && i !== months.length - 1) return;
    const label = svgEl("text", { x: xFor(i), y: H - 8 }, "viz-axis-label viz-axis-label--x");
    label.textContent = m.label.split(" ")[0].slice(0, 3) + " " + m.label.split(" ")[1].slice(2);
    svg.appendChild(label);
  });

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

export function renderBarChart(body, tableSlot, { items, metric, emphasisMap }) {
  clear(body);
  if (items.length === 0) {
    emptyState(body, "No data for the current filters.");
    return;
  }
  const rowH = 26, gap = 8;
  const marginL = 8, marginR = 64, marginT = 4, marginB = 4;
  const labelColW = 168;
  const W = 640;
  const plotW = W - marginL - marginR - labelColW;
  const H = marginT + marginB + items.length * (rowH + gap) - gap;

  const max = Math.max(...items.map((it) => it.value), 1);
  const xScale = (v) => Math.max(0, (v / max) * plotW);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Leaderboard" }, "viz-svg");
  const hasEmphasis = emphasisMap && emphasisMap.size > 0;

  const maxLabelChars = 24;
  const truncate = (s) => (s.length > maxLabelChars ? `${s.slice(0, maxLabelChars - 1)}…` : s);

  items.forEach((it, i) => {
    const y = marginT + i * (rowH + gap);
    const barX = marginL + labelColW;
    const w = xScale(it.value);

    const label = svgEl("text", { x: barX - 8, y: y + rowH / 2 + 4 }, "viz-bar-category-label viz-axis-label--y");
    label.textContent = truncate(it.operator);
    svg.appendChild(label);

    const colorClass = hasEmphasis
      ? (emphasisMap.has(it.operator) ? emphasisMap.get(it.operator) : SERIES_OTHER_CLASS)
      : "seq-500";
    const bar = svgEl("rect", {
      x: barX, y, width: Math.max(2, w), height: rowH, rx: 4, ry: 4,
    }, `viz-bar ${colorClass}`);
    svg.appendChild(bar);

    const valueLabel = svgEl("text", { x: barX + w + 8, y: y + rowH / 2 + 4 }, "viz-bar-label");
    valueLabel.textContent = formatMetric(it.value, metric);
    svg.appendChild(valueLabel);

    const hitArea = svgEl("rect", { x: marginL, y, width: labelColW + plotW, height: rowH }, "viz-hit-rect");
    svg.appendChild(hitArea);
    hitArea.addEventListener("pointermove", (evt) => {
      showTooltip(evt.clientX, evt.clientY, it.operator, [
        { colorClass, label: METRIC_LABEL[metric], value: formatMetric(it.value, metric) },
      ]);
    });
    hitArea.addEventListener("pointerdown", (evt) => {
      showTooltip(evt.clientX, evt.clientY, it.operator, [
        { colorClass, label: METRIC_LABEL[metric], value: formatMetric(it.value, metric) },
      ]);
    });
    hitArea.addEventListener("pointerleave", hideTooltip);
  });

  body.appendChild(svg);

  clear(tableSlot);
  tableSlot.appendChild(buildTable({
    caption: `Operator leaderboard (${METRIC_LABEL[metric]})`,
    columns: ["Operator", METRIC_LABEL[metric]],
    rows: items.map((it) => [it.operator, formatMetric(it.value, metric)]),
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
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${operator} breakdown` }, "viz-svg");

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
        const ratio = metric === "hold" ? (value || 0) / (max || 1) : (value || 0) / max;
        const seqClass = value === null || value === undefined ? "seq-100" : seqClassForRatio(ratio);
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
