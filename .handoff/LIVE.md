# LIVE handoff – I-Kiribati Help PWA

## Goal
Build/test/release-prep lightweight PWA "I-KIRIBATI HELP" (find services in Kiribati). Stack: vanilla HTML/CSS/JS, Cloudflare Pages, Google Apps Script + Sheets backend, protected admin. Independent – never claim official govt.
User brief was truncated at section 5 ("Search must be the heart o…") – rest built on judgment; ask user for remainder.

## State (branch claude/i-kiribati-help-pwa-73ujsm, pushed)
- Commit 381e677: full app + backend + tests + docs. Commit 435f149: Android install button (js/install.js) + header padding fix.
- Tests: `npm run check` → lint, data validate, sync-gas check, 61 unit/backend, 24 e2e (Playwright) all green.
- No PR: repo was empty, this branch is the only one (no base). User must create `main` (or allow it), then open draft PR + subscribe.
- Not deployed anywhere (Cloudflare/Apps Script need user accounts).

## Next steps
1. Get rest of brief (section 5+) from user.
2. Once `main` exists: open draft PR, subscribe_pr_activity.
3. User: deploy per README + apps-script/README.md; set API_URL/SITE_URL/CONTACT_EMAIL in js/config.js.

## Decisions (why)
- Classic deferred scripts, window.IKH namespace, hash routing → no build step, works on any static host, easy for non-expert maintainer.
- js/search.js shared with backend via tools/sync-gas.mjs → apps-script/SearchCore.gs (CI checks identical).
- Inverted index + first-letter fuzzy + no fuzzy on synonyms: was 2.7s/query at 1k services, now ~10ms.
- Seed data (36 entries) all `unverified`, no invented phones/fees; only emergency 192/193/194 (source Smartraveller) – must confirm locally.
- Data version format YYYY.MM.DD-HHMMSS (string-compared client side).
- Kiribati UI strings = draft only (ki-translator skill data missing in env); review table in README.
- Install: native beforeinstallprompt on Android; instructions dialog for iOS/no-prompt; hidden when standalone/installed; "Not now" 14 days. mwakete.com reference blocked by egress proxy – user may send screenshot to match.

## Gotchas
- SW: bump CACHE_VERSION in sw.js each deploy (now ikh-v1.1.0); reload only on user "Update" (first-install controllerchange caused unwanted reload – fixed).
- Offline report queue: single-flush guard + qid (was double-sending).
- `pkill -f <pattern>` kills own shell; use `pgrep -f '[h]ttp-server'`.
- Playwright via `npm link playwright` (global 1.56.1); ESM ignores NODE_PATH.
- vm-sandbox arrays fail strict deepEqual → spread/JSON copy in tests.
- Fake beforeinstallprompt in e2e must fire once (sessionStorage) or test flakes.

## Open questions
- Remainder of brief? Custom domain? Contact email to publish? Permission to create `main`?
