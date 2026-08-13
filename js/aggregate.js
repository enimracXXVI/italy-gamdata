// js/aggregate.js — pure functions that turn (records, filter state) into
// the shapes each chart/tile needs. No DOM here.

// verticals/channels are initialized to the FULL set of known values (see
// app.js), so an empty Set here is a deliberate "nothing selected" rather
// than a magic "no filter" — the two multi-selects stay honest about what's
// on screen.
export function filterRecords(records, state) {
  const { dateFrom, dateTo, verticals, channels } = state;
  return records.filter((r) => {
    if (dateFrom && r.key < dateFrom) return false;
    if (dateTo && r.key > dateTo) return false;
    if (!verticals.has(r.vertical)) return false;
    if (!channels.has(r.channel)) return false;
    return true;
  });
}

export function sum(records, metric) {
  let total = 0;
  let hasTurnover = false;
  for (const r of records) {
    if (metric === "hold") continue;
    const v = r[metric];
    if (typeof v === "number") total += v;
  }
  if (metric === "hold") {
    let ggr = 0, turnover = 0;
    for (const r of records) {
      ggr += r.ggr || 0;
      if (typeof r.turnover === "number") { turnover += r.turnover; hasTurnover = true; }
    }
    return hasTurnover && turnover !== 0 ? ggr / turnover : null;
  }
  return total;
}

/** Totals per month, split by `groupField`, restricted to keys in `topKeys`
 * (everything else folds into "Other"). Returns { months, series } where
 * series = [{ key, values: [numbers aligned to months] }]. */
export function monthlySeries(records, months, groupField, metric, topKeys) {
  const buckets = new Map(); // groupKey -> Map(monthKey -> value)
  const topSet = topKeys ? new Set(topKeys) : null;

  for (const r of records) {
    let bucketKey = r[groupField];
    if (topSet && !topSet.has(bucketKey)) bucketKey = "Other";
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Map());
    const monthMap = buckets.get(bucketKey);
    if (metric === "hold") {
      const acc = monthMap.get(r.key) || { ggr: 0, turnover: 0 };
      acc.ggr += r.ggr || 0;
      if (typeof r.turnover === "number") acc.turnover += r.turnover;
      monthMap.set(r.key, acc);
    } else {
      const v = typeof r[metric] === "number" ? r[metric] : 0;
      monthMap.set(r.key, (monthMap.get(r.key) || 0) + v);
    }
  }

  const series = [...buckets.entries()].map(([key, monthMap]) => ({
    key,
    values: months.map((m) => {
      const v = monthMap.get(m.key);
      if (v === undefined) return 0;
      if (metric === "hold") return v.turnover ? v.ggr / v.turnover : 0;
      return v;
    }),
  }));

  return { months, series };
}

/** Top N group keys by total metric across the given records (used to decide
 * the "Other" fold for group-share / leaderboard charts). */
export function topKeysByTotal(records, groupField, metric, n) {
  const totals = new Map();
  for (const r of records) {
    const k = r[groupField];
    const v = metric === "hold" ? (r.ggr || 0) : (typeof r[metric] === "number" ? r[metric] : 0);
    totals.set(k, (totals.get(k) || 0) + v);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

/** Leaderboard: total metric per operator across the filtered records,
 * sorted descending. */
export function leaderboard(records, metric, limit) {
  const totals = new Map();
  for (const r of records) {
    const acc = totals.get(r.operator) || { ggr: 0, turnover: 0 };
    acc.ggr += r.ggr || 0;
    if (typeof r.turnover === "number") acc.turnover += r.turnover;
    totals.set(r.operator, acc);
  }
  return [...totals.entries()]
    .map(([operator, acc]) => ({
      operator,
      value: metric === "hold" ? (acc.turnover ? acc.ggr / acc.turnover : 0) : acc[metric],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Trend per selected operator (sum across whatever verticals/channels are
 * currently filtered in), aligned to `months`. */
export function operatorTrend(records, months, operators, metric) {
  return operators.map((operator) => {
    const monthMap = new Map();
    for (const r of records) {
      if (r.operator !== operator) continue;
      if (metric === "hold") {
        const acc = monthMap.get(r.key) || { ggr: 0, turnover: 0 };
        acc.ggr += r.ggr || 0;
        if (typeof r.turnover === "number") acc.turnover += r.turnover;
        monthMap.set(r.key, acc);
      } else {
        const v = typeof r[metric] === "number" ? r[metric] : 0;
        monthMap.set(r.key, (monthMap.get(r.key) || 0) + v);
      }
    }
    return {
      key: operator,
      values: months.map((m) => {
        const v = monthMap.get(m.key);
        if (v === undefined) return 0;
        if (metric === "hold") return v.turnover ? v.ggr / v.turnover : 0;
        return v;
      }),
    };
  });
}

/** Vertical x Channel matrix for a single operator, summed over the filtered
 * date range. Returns { rows, cols, matrix } (matrix[row][col]). Used to
 * build one small-multiple panel per operator in the compare set. */
export function compareMatrix(records, operator, verticalOrder, channelOrder, metric) {
  const sub = records.filter((r) => r.operator === operator);
  const rows = verticalOrder.filter((v) => sub.some((r) => r.vertical === v));
  const cols = channelOrder.filter((c) => sub.some((r) => r.channel === c));

  const matrix = rows.map((v) =>
    cols.map((c) => {
      const cell = sub.filter((r) => r.vertical === v && r.channel === c);
      if (metric === "hold") return sum(cell, "hold");
      return sum(cell, metric);
    })
  );
  return { rows, cols, matrix };
}

/** Vertical x Channel matrix of one operator's % share of GGR within that
 * exact slice — e.g. "DAZNBET's share of Sportsbetting/Online GGR". `records`
 * should already be date/vertical/channel-filtered but NOT operator-filtered,
 * so the denominator is the whole market for that cell. Cells with no market
 * volume at all come back null (rendered as "—"), not a divide-by-zero 0. */
export function shareMatrix(records, operator, verticalOrder, channelOrder) {
  const rows = verticalOrder.filter((v) => records.some((r) => r.vertical === v));
  const cols = channelOrder.filter((c) => records.some((r) => r.channel === c));
  const matrix = rows.map((v) =>
    cols.map((c) => {
      const cell = records.filter((r) => r.vertical === v && r.channel === c);
      const marketTotal = sum(cell, "ggr");
      if (!marketTotal) return null;
      const opTotal = sum(cell.filter((r) => r.operator === operator), "ggr");
      return (opTotal / marketTotal) * 100;
    })
  );
  return { rows, cols, matrix };
}

/** Elementwise a/b*100, month by month — turns two absolute series (an
 * operator's totals and the whole market's totals) into a % share trend. */
export function shareSeries(values, totals) {
  return values.map((v, i) => (totals[i] ? (v / totals[i]) * 100 : null));
}

/** Normalizes a set of stacked series so every month sums to 100 — turns an
 * absolute stacked-area chart into a 100%-stacked composition/share view. */
export function normalizeStackToShare(series, months) {
  return series.map((s) => ({
    ...s,
    values: months.map((_, i) => {
      const monthTotal = series.reduce((acc, ss) => acc + (ss.values[i] || 0), 0);
      return monthTotal ? (s.values[i] / monthTotal) * 100 : 0;
    }),
  }));
}

/** Rebases a value series to 100 at its first non-zero point, so an operator
 * and the overall market can be compared on the same axis regardless of
 * their actual size — "is this operator growing faster than the market?" */
export function indexSeries(values) {
  const baseIdx = values.findIndex((v) => typeof v === "number" && v !== 0);
  if (baseIdx === -1) return values.map(() => null);
  const base = values[baseIdx];
  return values.map((v) => (typeof v === "number" ? (v / base) * 100 : null));
}

export function totalsByMonth(records, months, metric) {
  return months.map((m) => sum(records.filter((r) => r.key === m.key), metric));
}

export function monthOverMonthDelta(months, series) {
  // series: [{key, values}]; returns latest value + delta vs previous month, summed across series.
  if (months.length === 0) return { latest: 0, prev: 0, deltaPct: null };
  const latestIdx = months.length - 1;
  const prevIdx = months.length - 2;
  let latest = 0, prev = 0;
  for (const s of series) {
    latest += s.values[latestIdx] || 0;
    if (prevIdx >= 0) prev += s.values[prevIdx] || 0;
  }
  const deltaPct = prevIdx >= 0 && prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : null;
  return { latest, prev, deltaPct };
}
