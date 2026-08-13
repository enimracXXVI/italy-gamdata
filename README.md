# Italy Gaming Market Dashboard

A static, client-side dashboard over the Italian ADM gaming-market Google
Sheet. No backend, no database, no build step — the page fetches the sheet's
published CSV on every load and does all filtering/aggregation in the
browser, so editing the sheet is the entire workflow for adding new months.

- `index.html` — page structure
- `css/styles.css` — all styling (class-based, no inline styles)
- `css/STYLE_GUIDE.md` — every class and color, documented, so future style
  changes can be requested precisely
- `js/data.js` — CSV fetch + parsing + the sheet's expected column shape
- `js/aggregate.js` — pure functions that turn raw rows into chart-ready data
- `js/charts.js` — hand-rolled SVG chart rendering (line/area, bar, heatmap)
- `js/components.js` — filter bar controls (multi-select, date range, toggle)
- `js/quality.js` — scans the whole sheet for data-entry mistakes (duplicate
  rows, implausible margins, missing turnover, inconsistent group naming);
  feeds both the warning banner and the "Data Quality" tab
- `js/app.js` — wires it all together, including the Dashboard ↔ Data
  Quality tab switch

## What you need to do

**1. Share the Google Sheet publicly (view-only).**
The dashboard fetches the sheet anonymously, so it needs to be viewable
without login:
`File → Share → General access → "Anyone with the link" → Viewer`.
It does *not* need to be publicly editable — just viewable. Nobody sees an
edit link, only the numbers.

**2. Enable GitHub Pages on this repo.**
`Settings → Pages → Source: Deploy from a branch → Branch: main /(root)`.
Once that's on, every push to `main` redeploys automatically — including
just letting a scheduled rebuild pick up new sheet rows, though you don't
even need a redeploy for new data (see below).

**3. Keep adding rows to the sheet exactly as before.**
The dashboard re-fetches the CSV fresh on every page load, so once it's
live, adding a new month's rows to the sheet is the entire update — no
redeploy needed for data changes. A redeploy is only needed if the
**code** changes (which I'll handle and push).

The sheet's header row must keep these exact column names (order doesn't
matter): `Year, Month Name, Month Number, Operator, Operator Group,
Vertical, Channel, GGR, Turnover`. If a column gets renamed, the dashboard
will show a clear error banner naming the missing column rather than
failing silently.

## Config

`js/data.js` has two constants at the top — `SHEET_ID` and `SHEET_GID` —
pointing at your sheet and its tab (currently the `gid=0` tab, matching the
URL you gave me). If you ever move the data to a different tab or a new
sheet entirely, update those two lines.

## If something looks wrong

- **Blank page / error banner about fetching the sheet** → almost always the
  sharing setting in step 1 above.
- **Error naming a missing column** → the header row in the sheet was
  renamed or reordered in a way that dropped an expected name.
- **A number looks off** → check the row in the sheet; the dashboard doesn't
  transform GGR/Turnover beyond summing what's there.

## Requesting style changes

Everything visual is a class — see `css/STYLE_GUIDE.md` for the full map of
class → purpose → location, and the color token table. Point at a class or
describe what's near the thing you want changed and I can make the edit
precisely.
