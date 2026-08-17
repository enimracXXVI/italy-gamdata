// Apps Script backend for shared Data Quality state, bound to the same
// Google Sheet the dashboard already reads from. Handles two things:
//  1. Who's allowed to see the Data Quality tab (the "Allowlist" sheet tab).
//  2. Which findings are marked "not an issue," shared across every
//     browser and every user (the "Dismissed" sheet tab), replacing the
//     old per-browser localStorage version.
//
// Setup: paste this into Extensions > Apps Script on the Sheet, fill in
// CLIENT_ID once you have it (see SETUP.md), then Deploy > New deployment
// > Web app, "Execute as: Me", "Who has access: Anyone". Copy the
// resulting URL into js/app.js.

const ALLOWLIST_SHEET = "allowlist"; // one column: email
const DISMISSED_SHEET = "dismissed"; // three columns: key, dismissedAt, dismissedBy
const CLIENT_ID = "1083340803022-d7t4cj6hnglmrdm2pjthlid8phu74p3e.apps.googleusercontent.com";

function doGet(e) {
  const action = e.parameter.action;
  if (action === "dismissed") {
    return jsonResponse({ keys: readDismissed() });
  }
  if (action === "check") {
    const email = verifyToken(e.parameter.idToken);
    return jsonResponse({ authorized: !!email && isAllowed(email), email: email || null });
  }
  return jsonResponse({ error: "unknown action" });
}

// Apps Script Web Apps don't answer CORS preflight requests, so the
// frontend sends the body as plain text (avoiding the preflight a
// Content-Type: application/json would trigger) and we parse it here.
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const email = verifyToken(body.idToken);
  if (!email || !isAllowed(email)) {
    return jsonResponse({ error: "not authorized" });
  }
  if (body.action === "dismiss") {
    addDismissed(body.key, email);
  } else if (body.action === "restore") {
    removeDismissed(body.key);
  }
  return jsonResponse({ keys: readDismissed() });
}

// No built-in "verify a Google ID token" call in Apps Script, so this
// hits Google's own tokeninfo endpoint and checks the two things that
// matter: the token was minted for *this* app (aud) and hasn't expired.
function verifyToken(idToken) {
  if (!idToken) return null;
  try {
    const resp = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return null;
    const data = JSON.parse(resp.getContentText());
    if (data.aud !== CLIENT_ID) return null;
    if (Number(data.exp) < Math.floor(Date.now() / 1000)) return null;
    return data.email || null;
  } catch (err) {
    return null;
  }
}

function isAllowed(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ALLOWLIST_SHEET);
  const values = sheet.getDataRange().getValues();
  return values.slice(1).some((row) => String(row[0]).trim().toLowerCase() === email.toLowerCase());
}

function readDismissed() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DISMISSED_SHEET);
  const values = sheet.getDataRange().getValues();
  return values.slice(1).map((row) => String(row[0])).filter(Boolean);
}

function addDismissed(key, email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DISMISSED_SHEET);
  const values = sheet.getDataRange().getValues();
  const exists = values.slice(1).some((row) => row[0] === key);
  if (!exists) sheet.appendRow([key, new Date().toISOString(), email]);
}

function removeDismissed(key) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DISMISSED_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === key) sheet.deleteRow(i + 1);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
