# Data Quality login + shared dismissals: setup

Five steps. The first four need your Google account, so I can't do them —
once you've done them, send me back the two values marked **give me this**
and I'll wire up the app.

## 1. Add two tabs to the Sheet

In the same spreadsheet the dashboard already reads from, add:

**Allowlist** — one column, header `Email`, one approved email per row
below it. This is who can see Data Quality.

**Dismissed** — three columns, headers `Key`, `DismissedAt`, `DismissedBy`.
Leave it empty otherwise; the app fills it in.

## 2. Create the OAuth Client ID

This is what lets people sign in with Google.

1. Go to [console.cloud.google.com](https://console.cloud.google.com),
   create a project if you don't already have one for this.
2. APIs & Services > OAuth consent screen. Choose "External" (or
   "Internal" if everyone signing in is in your Google Workspace org),
   fill in the required fields (app name, your email), save.
3. APIs & Services > Credentials > Create Credentials > OAuth client ID.
   Application type: **Web application**.
4. Under "Authorized JavaScript origins," add the dashboard's URL (e.g.
   `https://enimracxxvi.github.io`, no trailing slash or path).
5. Create it. **Give me this:** the Client ID it shows you (ends in
   `.apps.googleusercontent.com`). It's not a secret, it's fine to paste
   in chat.

## 3. Paste in the Apps Script

1. Open the Sheet, Extensions > Apps Script.
2. Delete whatever's in the default `Code.gs` and paste in the contents
   of `backend/quality-storage.gs` from this repo.
3. Replace `REPLACE_WITH_YOUR_OAUTH_CLIENT_ID...` at the top with the
   Client ID from step 2.
4. Save.

## 4. Deploy it as a Web App

1. Deploy > New deployment > pick type **Web app**.
2. "Execute as": **Me**. "Who has access": **Anyone**.
3. Deploy. It'll ask you to authorize the script the first time; approve
   it (it's your own script, acting on your own Sheet).
4. **Give me this:** the Web App URL it gives you (ends in `/exec`).

## 5. I take it from here

Once I have the Client ID and the Web App URL, I'll wire up:

- A "Sign in with Google" button in place of the tab switcher for
  everyone not signed in.
- The Data Quality tab (and `?tab=quality` in the URL) only render for
  emails on the Allowlist tab — checked before anything on that tab is
  even built, not just hidden with CSS.
- Dismiss / Restore write to the Dismissed tab through the Web App,
  instead of each browser's own local storage.

If you ever need to add or remove someone's access, just edit the
Allowlist tab directly. No redeploy needed.
