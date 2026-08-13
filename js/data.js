// js/data.js — fetch + parse the Google Sheet, normalize into flat records.

// Update these two if the sheet ID or tab (gid) ever changes.
// The sheet must be shared as "Anyone with the link – Viewer" for this
// anonymous CSV export to work (see README.md).
export const SHEET_ID = "1XLaGBNU9vNCm0RjCG3GxaVY3It6y5qpfmPGJutTGTQA";
export const SHEET_GID = "0";
export const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

const EXPECTED_HEADERS = [
  "Year", "Month Name", "Month Number", "Operator", "Operator Group",
  "Vertical", "Channel", "GGR", "Turnover",
];

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// The fixed, known vertical domain — order here is the categorical color order.
export const VERTICAL_ORDER = [
  "Casino",
  "Sportsbetting",
  "Horse Racing Fixed Odds",
  "Horse Racing Tote",
  "Poker Cash",
  "Poker Tournament",
];

export const CHANNEL_ORDER = ["Online", "Retail"];

/** RFC4180-ish CSV parser: handles quoted fields, embedded commas, embedded
 * quotes ("") and newlines inside quotes — all present in operator names
 * in this sheet (e.g. "IPPODROMO DI CESENA, BOLOGNA ARCOVEGGIO, ..."). */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function toNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function monthKey(year, monthNumber) {
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

/** Turns raw CSV rows (including header) into an array of clean record
 * objects, and validates the header shape so a reshuffled sheet fails loud. */
export function normalize(rows) {
  if (rows.length === 0) {
    throw new Error("The sheet came back empty.");
  }
  const header = rows[0].map((h) => h.trim());
  const missing = EXPECTED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `Sheet header is missing column(s): ${missing.join(", ")}. ` +
      `Expected: ${EXPECTED_HEADERS.join(", ")}.`
    );
  }
  const idx = Object.fromEntries(EXPECTED_HEADERS.map((h) => [h, header.indexOf(h)]));

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => c.trim() === "")) continue;

    const year = toNumber(cells[idx["Year"]]);
    const monthNumber = toNumber(cells[idx["Month Number"]]);
    const monthName = (cells[idx["Month Name"]] || "").trim();
    const operator = (cells[idx["Operator"]] || "").trim();
    const operatorGroup = (cells[idx["Operator Group"]] || "").trim();
    const vertical = (cells[idx["Vertical"]] || "").trim();
    const channel = (cells[idx["Channel"]] || "").trim();
    const ggr = toNumber(cells[idx["GGR"]]);
    const turnover = toNumber(cells[idx["Turnover"]]);

    if (!year || !monthNumber || !operator) continue;

    records.push({
      year,
      monthNumber,
      monthName: monthName || MONTH_ORDER[monthNumber - 1] || "",
      operator,
      operatorGroup: operatorGroup || operator,
      vertical,
      channel,
      ggr: ggr ?? 0,
      turnover: turnover ?? null,
      hold: turnover ? ggr / turnover : null,
      key: monthKey(year, monthNumber),
    });
  }
  return records;
}

export async function loadRecords() {
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Could not fetch the sheet (HTTP ${res.status}). ` +
      `Make sure the Google Sheet is shared as "Anyone with the link – Viewer".`
    );
  }
  const text = await res.text();
  if (/^\s*<!DOCTYPE html/i.test(text)) {
    throw new Error(
      "Got an HTML login page instead of CSV — the sheet isn't publicly viewable yet."
    );
  }
  const rows = parseCSV(text);
  return normalize(rows);
}

/** Sorted list of distinct { key, label } month buckets present in the data. */
export function distinctMonths(records) {
  const map = new Map();
  for (const r of records) {
    if (!map.has(r.key)) {
      map.set(r.key, { key: r.key, label: `${r.monthName} ${r.year}`, year: r.year, monthNumber: r.monthNumber });
    }
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function distinctOperators(records) {
  const map = new Map();
  for (const r of records) {
    if (!map.has(r.operator)) {
      map.set(r.operator, { operator: r.operator, group: r.operatorGroup });
    }
  }
  return [...map.values()].sort((a, b) => a.operator.localeCompare(b.operator));
}

export function distinctGroups(records) {
  return [...new Set(records.map((r) => r.operatorGroup))].sort((a, b) => a.localeCompare(b));
}

export function distinctVerticals(records) {
  const present = new Set(records.map((r) => r.vertical));
  const ordered = VERTICAL_ORDER.filter((v) => present.has(v));
  const extra = [...present].filter((v) => !VERTICAL_ORDER.includes(v)).sort();
  return [...ordered, ...extra];
}
