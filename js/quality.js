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

/** Rows whose GGR/Turnover ratio is implausible — negative and positive
 * margins are implausible in different ways, so they get different gates
 * rather than one symmetric ±threshold. A negative margin (players came out
 * ahead) is only flagged once it's both backed by real money (Turnover over
 * €1M — small operators dip negative on ordinary variance) and a genuinely
 * big loss (-50% or worse). A positive margin only gets implausible once
 * it's above 100% (GGR bigger than Turnover), which shouldn't be possible
 * at all outside a data error. */
export function extremeMarginRows(records, { negativeMinTurnover = 1_000_000, negativeMarginThreshold = -0.5, positiveMarginThreshold = 1 } = {}) {
  const out = [];
  for (const r of records) {
    if (!r.turnover) continue;
    const margin = r.ggr / r.turnover;
    if (margin < 0) {
      if (r.turnover <= negativeMinTurnover || margin > negativeMarginThreshold) continue;
    } else if (margin > 0) {
      if (margin <= positiveMarginThreshold) continue;
    } else {
      continue;
    }
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

/** An operator/vertical/channel combo that's normally reported every month
 * but skipped one in the middle — as opposed to one that simply hasn't
 * launched yet or has permanently stopped, neither of which is an error.
 * "Present" means a nonzero-GGR row; the window checked runs from the
 * combo's own first to its own last such row, so months before launch or
 * after a genuine exit never count against it. Only combos that clear a
 * high presence bar (95% by default) are reported — a combo that's
 * routinely patchy isn't "missing" a month, it's just irregular, and
 * flagging it would bury the real gaps in noise.
 *
 * August and September 2022 are excluded from every window: ADM's own
 * reporting had a market-wide gap those two months, so hundreds of
 * otherwise-regular operators show up "missing" them for a reason that has
 * nothing to do with their own data. The most recent months get no such
 * exclusion — a gap there is exactly what this check exists to catch, a
 * sign an operator's reporting is falling behind. */
export function operatorPresenceGaps(records, { minPresenceRate = 0.95, excludedMonths = new Set(["2022-08", "2022-09"]) } = {}) {
  const allMonthKeys = [...new Set(records.map((r) => r.key))].sort();
  const monthLabels = new Map(records.map((r) => [r.key, `${r.monthName} ${r.year}`]));

  const presentByCombo = new Map();
  for (const r of records) {
    if (!r.ggr) continue;
    const k = `${r.operator}__${r.vertical}__${r.channel}`;
    if (!presentByCombo.has(k)) presentByCombo.set(k, new Set());
    presentByCombo.get(k).add(r.key);
  }

  const out = [];
  for (const [k, presentSet] of presentByCombo) {
    const [operator, vertical, channel] = k.split("__");
    const presentMonths = [...presentSet].sort();
    const first = presentMonths[0];
    const last = presentMonths[presentMonths.length - 1];
    const windowMonths = allMonthKeys.filter((m) => m >= first && m <= last && !excludedMonths.has(m));
    if (windowMonths.length < 2) continue;

    const missing = windowMonths.filter((m) => !presentSet.has(m));
    if (missing.length === 0) continue;

    const presenceRate = (windowMonths.length - missing.length) / windowMonths.length;
    if (presenceRate < minPresenceRate) continue;

    out.push({
      operator, vertical, channel,
      presenceRate,
      presentCount: windowMonths.length - missing.length,
      totalCount: windowMonths.length,
      missingMonths: missing.map((m) => monthLabels.get(m) || m),
    });
  }
  return out.sort((a, b) => b.presenceRate - a.presenceRate || a.operator.localeCompare(b.operator));
}

export function runAllChecks(records) {
  return {
    duplicates: duplicateGroups(records),
    extremeMargins: extremeMarginRows(records),
    blankTurnovers: blankTurnoverRows(records),
    groupInconsistencies: operatorGroupInconsistencies(records),
    presenceGaps: operatorPresenceGaps(records),
  };
}
