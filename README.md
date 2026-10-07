# I-KIRIBATI HELP

**Find the help you need in Kiribati.**

A fast, mobile-first, low-data Progressive Web App that helps people in Kiribati find government services, health services, jobs, transport, businesses, emergency contacts and step-by-step instructions.

> I-Kiribati Help is an **independent community information service**. It is **not** an official Government of Kiribati application.

| | |
|---|---|
| Frontend | Plain HTML, CSS and JavaScript (no framework, no build step) |
| Hosting | Cloudflare Pages (free), from this GitHub repository |
| Backend | Google Apps Script Web App (free) |
| Database | Google Sheets |
| Size | ~40 KB compressed for the whole app **including all data** |
| Offline | Works offline after the first visit |

---

## What it does

- **Simple search** – type “renew driver's licence” and get a service card with: name, category, island/location, explanation, steps, what to bring, cost, opening hours, phone, email, website, map, official source, last-verified date and a “Report outdated information” button.
  - Handles typos (“licnece”), British/American spelling (“licence/license”), synonyms (“clinic” ↔ “hospital”, “boat” ↔ “ship”) and some Kiribati words (“mwakuri”, “reirei”).
  - Filters: island, category, verified only. Filtered searches can be shared as links.
  - No results? It suggests a spelling, shows categories and invites people to suggest a service.
- **Home page** – search, examples, 9 categories, Popular services, Recently updated, Important contacts, emergency numbers.
- **Trust** – every entry shows its source and when it was last verified; unverified entries are clearly marked.
- **Report incorrect information** – works offline (queued, sent automatically later).
- **Install app button** – an “Install app” button in the header and a “Get the I-Kiribati Help app” card on the home page. On Android it opens the phone's own install prompt; on iPhone and browsers without that prompt it shows simple step-by-step instructions. Hidden once installed; “Not now” hides the card for 14 days. Code: `js/install.js`.
- **English + Kiribati** interface (Kiribati is a first draft – see [Translation review](#translation-review)).
- **Admin page** (`/admin/`) – password-protected: handle reports, add/edit/verify services, see what people search for (including searches with no results).
- **Privacy-friendly statistics** – no cookies, no trackers, no personal data; respects “Do Not Track”.

## Design

- **No icons except the logo.** Categories are told apart by colour accents and short descriptions, and buttons use plain words (“Call 192”, “Map”, “Share”). A browser test fails if an emoji icon is added back.
- **Palette** (all tokens at the top of `css/main.css`): deep ocean `#0B2D4A` → lagoon teal `#0B6E86` / `#16B3A3`, sunrise accent `#FFD166` → coral `#FF7A59`, and one modern shade per category. All text colours meet WCAG AA contrast (4.5:1).
- **Motion:** slow “aurora” light in the hero, gentle page fade-in, hover lift on cards; all switched off when the phone asks for reduced motion.
- Automatic **dark mode**; system fonts only (nothing extra to download).
- Logo: `assets/logo.svg`. After changing it run `npm run icons` to rebuild the app icons.

## Project structure

```
index.html              The app (single page)
manifest.json           Install-to-home-screen settings
sw.js                   Service worker (offline support) – bump CACHE_VERSION on each deploy
_headers                Cloudflare Pages security headers (CSP etc.)
404.html, robots.txt, sitemap.xml
css/main.css            Styles (mobile first, dark mode, print)
css/responsive.css      Small-phone and tablet adjustments
js/config.js            ← THE ONLY FILE YOU MUST EDIT TO DEPLOY (API URL, contact email)
js/app.js               Start-up and page routing (#/search, #/service/<id>, ...)
js/api.js               Loading data, offline cache, sending reports
js/search.js            Search engine (also used by the backend)
js/ui.js                Page rendering (safe: never uses innerHTML)
js/filters.js           Island / category / verified filters
js/i18n.js              English and Kiribati text
js/analytics.js         Anonymous usage statistics
data/fallback-data.json Starter data, bundled with the app (used offline / before the API answers)
assets/                 Logo and app icons
admin/                  Admin page (login, reports, services, insights)
apps-script/            Google Apps Script backend – see apps-script/README.md
tests/                  Unit, backend and browser tests
tools/                  Data validator, icon generator, search-engine sync
```

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install          # only needed for tests and tools
npm start            # opens a local server at http://localhost:8080
```

Without an API URL the app runs fully from `data/fallback-data.json` – good for testing.

## Deploy

### 1. Website (Cloudflare Pages)

1. Push this repository to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → choose this repository.
3. Build settings: **Framework preset: None**, **Build command: (empty)**, **Build output directory: `/`**.
4. Deploy. Your site is at `https://<project>.pages.dev` (add a custom domain later if you like).
5. Update the site address in `js/config.js` (`SITE_URL`), `robots.txt` and `sitemap.xml`.

### 2. Backend (Google Sheets + Apps Script)

Follow **[apps-script/README.md](apps-script/README.md)** (about 15 minutes). At the end you get a Web App URL ending in `/exec`.

### 3. Connect them

Put the Web App URL in `js/config.js`:

```js
API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
```

Then in `sw.js` change `CACHE_VERSION` (e.g. `ikh-v1.0.1`) so phones fetch the new files, commit and push. Cloudflare redeploys automatically.

## Editing information

**Day to day: use the Google Sheet or the admin page** (`https://<your-site>/admin/`). Changes reach phones within about an hour (or click **Publish changes**). Phones that are offline keep using their saved copy.

Sheet rules (the admin page and the **I-Kiribati Help → Check data for problems** menu enforce them):

| Column | Format |
|---|---|
| `id` | lower-case, numbers and dashes, never change it once published (`drivers-licence-renewal`) |
| `status` | `published`, `draft` (hidden) or `archived` (hidden) |
| `category` | one of `government health jobs education transport business prices emergency community` |
| `islands` | comma separated, e.g. `South Tarawa, Abaiang` or `All islands` |
| `steps`, `requirements` | one per line (Alt+Enter / Ctrl+Enter in a cell) |
| `keywords` | comma separated – add the words people actually type |
| `verification` | `verified` (needs `lastVerified`), `unverified`, or `outdated` |
| `lastVerified`, `updatedAt` | `YYYY-MM-DD` |
| `popular`, `important` | `TRUE` / `FALSE` – show on the home page lists |
| `notes`, `verifiedBy` | internal, never shown publicly |

**Bundled starter data** (`data/fallback-data.json`) is what people see on their very first visit and when the API cannot be reached. After big changes, export the latest data (open `<API_URL>?action=data`, copy the `data` part) into this file, bump `meta.version` (`YYYY.MM.DD-HHMMSS`), run `npm run validate`, and deploy.

### Improving search

1. Admin page → **Insights** → “Searches with NO results”.
2. Add those words to the right service's **keywords**, or add a new service.
3. For words that mean the same thing everywhere (e.g. a Kiribati word), add them to `SYNONYM_GROUPS` in `js/search.js`, then run `npm run sync-gas` and re-deploy the Apps Script.

## Security

- All page content is inserted as text (`textContent`), links are restricted to `https://`, `tel:` and `mailto:` – data in the sheet cannot inject scripts. (Tested.)
- Strict Content-Security-Policy and security headers in `_headers`.
- Backend: input validation and length limits, spam honeypot, site-wide rate limits, spreadsheet **formula-injection** protection, generic error messages.
- Admin: password stored only as a salted, stretched SHA-256 hash in Script Properties; 4-hour session tokens; lockout after 5 wrong passwords; every change logged in the `AdminLog` sheet; token sent in the request body, never the URL.
- **Anyone with edit access to the Google Sheet is effectively an admin** – share it carefully and use 2-step verification on the Google account.

## Privacy

Collected: search words (with phone numbers/emails removed), result counts, pages viewed, app language; reports people send (contact optional, erased when the report is closed). Not collected: names, accounts, location, cookies. We do not store IP addresses (the hosting providers, Cloudflare and Google, keep their own standard logs). Search logs are deleted after 180 days by `cleanupOldData()`. See the in-app Privacy page.

## Testing

```bash
npm run check        # everything below
npm run lint         # code style / mistakes
npm run validate     # checks data/fallback-data.json
npm test             # search quality + backend (Apps Script code run against a mock Google Sheet)
npm run test:e2e     # real browser tests: search, filters, offline, reports, admin, security, 320px phones, accessibility basics
```

GitHub Actions runs all of these on every push (`.github/workflows/ci.yml`).

## Translation review

The Kiribati (`gil`) interface text in `js/i18n.js` is a **first draft and must be checked by a native speaker before launch**. Untranslated text falls back to English. Lowest-confidence items:

| Key | English | Draft Kiribati | Concern |
|---|---|---|---|
| `app.tagline` | Find the help you need in Kiribati. | Kakaea te ibuobuoki ae ko kainnanoia i Kiribati. | Natural phrasing? |
| `search.label` | What do you need help with? | Tera te ibuobuoki ae ko kainnanoia? | Natural phrasing? |
| `search.placeholder` | e.g. renew my licence | n aron: kaboua au laisenti | “kaboua” = renew? loanword “laisenti” |
| `card.report` | Report outdated information | Ribootinna te rongorongo ae aki eti | Loanword “ribooti”; “aki eti” = incorrect? |
| `home.categories` | Browse by category | Kakaea n te kanoa | “kanoa” for category? |
| `home.contacts` | Important contacts | Nambwa aika kakawaki | “Nambwa” = numbers, not contacts |
| `card.steps` | Steps | Anuana | Weak – needs a better word |
| `skip` | Skip to main content | Nako nanon te iteraniba | “iteraniba” = page? |
| category names | Health, Jobs, Transport… | Marurung, Mwakuri, Mwananga, Bitineti, Boo | “Emergency” and “Community” left in English on purpose |

## Launch checklist

Before telling the public about the app:

- [ ] **Verify the starter data.** All 36 starter entries are marked *Unverified*. Phone the offices, confirm details, fill in phones/emails/fees/hours, then mark them verified. Driver licensing, passports and civil registration offices especially need confirming.
- [ ] **Confirm emergency numbers 192 / 193 / 194** locally (they are also hard-coded in `js/ui.js`, `js/i18n.js`, `index.html` and `404.html`).
- [ ] Native-speaker review of the Kiribati text (table above).
- [ ] Set `API_URL`, `CONTACT_EMAIL` and `SITE_URL` in `js/config.js`; update `robots.txt` and `sitemap.xml` with the real domain.
- [ ] Set the admin password (`setAdminPassword()`), add the daily `cleanupOldData` trigger.
- [ ] Check with a lawyer or advisor whether the name and wording could be mistaken for an official government service.
- [ ] Test on a real low-end Android phone on a slow mobile connection, and install it with the **Install app** button. (Android only offers its install prompt on the live `https://` site, not on `localhost` previews in all browsers.)
- [ ] Bump `CACHE_VERSION` in `sw.js` on every deploy.

## Licence

Code: MIT (see `LICENSE`). Service information is public information collected by the community, provided as-is.
