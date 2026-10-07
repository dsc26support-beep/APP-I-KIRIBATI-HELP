# I-Kiribati Help – backend setup (Google Sheets + Apps Script)

Time needed: about 15 minutes. Cost: free. You need a Google account (turn on 2-step verification).

## 1. Create the spreadsheet

1. Go to [sheets.new](https://sheets.new) and name it **I-Kiribati Help – Data**.
2. Menu **Extensions → Apps Script**. A new script project opens, attached to this sheet.

## 2. Add the code

In the Apps Script editor:

1. Delete the example code in `Code.gs`.
2. For **each** `.gs` file in this folder, click **+ → Script**, give it the same name (without `.gs`) and paste the file's contents:
   `Code`, `Config`, `Api`, `Services`, `Search`, `SearchCore`, `Admin`, `Validation`, `Setup`.
3. **Project Settings (⚙) → Show "appsscript.json" manifest file in editor** → open `appsscript.json` and replace its contents with this folder's `appsscript.json`.
4. Click **Save** (💾).

> Tip for developers: you can instead use [clasp](https://github.com/google/clasp) to push this folder (`clasp create --type sheets`, then `clasp push`).

## 3. Create the sheets and load the starter data

1. In the toolbar choose the function **`setup`** and click **Run**. Approve the permissions (it's your own script; choose *Advanced → Go to project* if Google warns you).
   This creates the `Services`, `Reports`, `SearchLog` and `AdminLog` sheets.
2. Load the starter data. Easiest way, after the website is deployed:
   - In `Setup.gs`, edit the address in `importSeedDataFromSite()` to your site, e.g. `https://ikiribatihelp.pages.dev/data/fallback-data.json`.
   - Run **`importSeedDataFromSite`**. The `Services` sheet fills with the starter entries.

## 4. Set the admin password

1. Open `Admin.gs`, find `setAdminPassword`, replace `CHANGE-ME` with a strong password (12+ characters).
2. Run **`setAdminPassword`**.
3. **Change the text back to `CHANGE-ME` and save**, so the password is not left in the code.
   (Only a salted hash is stored, in Project Settings → Script Properties.)

## 5. Deploy as a Web App

1. **Deploy → New deployment → ⚙ Select type → Web app**.
2. Description: `v1`. **Execute as: Me**. **Who has access: Anyone**.
3. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
4. Test it: open `<URL>?action=health` in a browser – you should see `{"ok":true,...}`.
5. Put the URL in the website's `js/config.js` → `API_URL`, then commit and push.

**When you change the code later:** Deploy → **Manage deployments** → ✏️ edit → Version: **New version** → Deploy. (The URL stays the same.)

## 6. Daily privacy clean-up

**Triggers (⏰) → Add Trigger** → function `cleanupOldData`, event source **Time-driven**, **Day timer**, any hour → Save.
This deletes search logs older than 180 days and erases contact details from closed reports.

## Using the spreadsheet

- Reload the spreadsheet: a menu **I-Kiribati Help** appears with *Publish changes now* and *Check data for problems*.
- Editing a cell in `Services` automatically publishes a new data version; phones update within about an hour.
- Keep `status` = `draft` while you are still writing an entry.
- Only share the spreadsheet with people you trust – editors can change anything.

## API reference

GET (public):

| URL | Returns |
|---|---|
| `?action=data` | All published services, categories and islands (same shape as `data/fallback-data.json`) |
| `?action=search&q=clinic&island=Beru&cat=health&verified=1&limit=10` | Search results |
| `?action=health` | `{status: "ok"}` |

POST (body is JSON sent as `text/plain`): `{"action": "...", "payload": {...}}`

| action | payload |
|---|---|
| `report` | `serviceId, serviceName, type, details, contact` |
| `track` | `events: [{t, q, n, id, cat, island, lang}]` (max 25) |
| `adminLogin` | `password` → `token` |
| `adminServices`, `adminSaveService`, `adminVerifyService`, `adminReports`, `adminUpdateReport`, `adminStats`, `adminPublish`, `adminLogout` | `token` + action fields (see `Admin.gs`) |

All responses: `{"ok": true, "data": ...}` or `{"ok": false, "error": "...", "code": "..."}`.

## Limits to know (free Google account)

- Apps Script web apps handle a limited number of requests at the same time (about 30 per account). The app is built for this: phones keep their own copy of the data and only check for updates about once an hour, and the server caches the public data for 10 minutes.
- Check current quotas at https://developers.google.com/apps-script/guides/services/quotas
- If the site grows past ~1,000 services or very high traffic, export the data to `data/fallback-data.json` more often so phones rely less on the API.

## Search engine

`SearchCore.gs` is a generated copy of the website's `js/search.js`. **Don't edit it here**: edit `js/search.js`, run `npm run sync-gas`, then paste the new `SearchCore.gs` into the editor and deploy a new version.
