// js/quality.js — pure functions that scan the whole (unfiltered) dataset
// for the kinds of copy/paste and typo mistakes a hand-maintained monthly
// sheet accumulates. No DOM here; app.js renders whatever these return.

/** Every (month, operator, vertical, channel) combination that appears more
 * than once, with every occurrence's GGR/Turnover so they can be compared
 * side by side — a plain count doesn't tell you whether it's an identical
 * copy/paste or two conflicting numbers for the same period. */
export function duplicateGroups(records) {
  const groups = new Map();
  for (const r of records) {
    const k = `${r.key}__${r.operator}__${r.vertical}__${r.channel}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      monthKey: g[0].key,
      monthLabel: `${g[0].monthName} ${g[0].year}`,
      operator: g[0].operator,
      vertical: g[0].vertical,
      channel: g[0].channel,
      occurrences: g.map((r) => ({ ggr: r.ggr, turnover: r.turnover })),
      identical: new Set(g.map((r) => `${r.ggr}|${r.turnover}`)).size === 1,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.operator.localeCompare(b.operator));
}

/** Rows whose GGR/Turnover ratio is implausible AND whose GGR is large
 * enough to matter — a tiny operator with €10 turnover swinging to a wild
 * ratio is just small-number noise, not a data error worth chasing. */
export function extremeMarginRows(records, { marginThreshold = 0.5, minAbsGGR = 5000 } = {}) {
  const out = [];
  for (const r of records) {
    if (!r.turnover) continue;
    const margin = r.ggr / r.turnover;
    if (Math.abs(margin) < marginThreshold) continue;
    if (Math.abs(r.ggr) < minAbsGGR) continue;
    out.push({
      monthLabel: `${r.monthName} ${r.year}`, monthKey: r.key,
      operator: r.operator, vertical: r.vertical, channel: r.channel,
      ggr: r.ggr, turnover: r.turnover, margin,
    });
  }
  return out.sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin));
}

/** Rows with real GGR but no Turnover on record at all — not necessarily
 * wrong (some operators/verticals genuinely don't report turnover for a
 * channel), but worth a look since it silently breaks any margin math for
 * that row. */
export function blankTurnoverRows(records) {
  return records
    .filter((r) => !r.turnover && r.ggr)
    .map((r) => ({
      monthLabel: `${r.monthName} ${r.year}`, monthKey: r.key,
      operator: r.operator, vertical: r.vertical, channel: r.channel, ggr: r.ggr,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.operator.localeCompare(b.operator));
}

/** Operators whose "Operator Group" column spells the same group two
 * different ways across months (or, more rarely, has genuinely changed
 * owners) — either way it splits one group's totals across two rows in
 * every group-based view. */
export function operatorGroupInconsistencies(records) {
  const map = new Map();
  for (const r of records) {
    if (!map.has(r.operator)) map.set(r.operator, new Map());
    const groups = map.get(r.operator);
    if (!groups.has(r.operatorGroup)) groups.set(r.operatorGroup, { count: 0, firstSeen: r.key });
    const entry = groups.get(r.operatorGroup);
    entry.count += 1;
    if (r.key < entry.firstSeen) entry.firstSeen = r.key;
  }
  const out = [];
  for (const [operator, groups] of map) {
    if (groups.size < 2) continue;
    out.push({
      operator,
      variants: [...groups.entries()]
        .map(([name, v]) => ({ name, count: v.count, firstSeen: v.firstSeen }))
        .sort((a, b) => a.firstSeen.localeCompare(b.firstSeen)),
    });
  }
  return out.sort((a, b) => a.operator.localeCompare(b.operator));
}

export function runAllChecks(records) {
  return {
    duplicates: duplicateGroups(records),
    extremeMargins: extremeMarginRows(records),
    blankTurnovers: blankTurnoverRows(records),
    groupInconsistencies: operatorGroupInconsistencies(records),
  };
}
