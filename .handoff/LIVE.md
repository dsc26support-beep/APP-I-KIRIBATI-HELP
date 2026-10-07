# LIVE handoff – I-Kiribati Help PWA

## Goal
Build/test/release-prep lightweight PWA "I-KIRIBATI HELP" (find services in Kiribati). Vanilla HTML/CSS/JS, Cloudflare Pages, Apps Script + Sheets backend, protected admin. Independent – never claim official govt.
User brief truncated at section 5 ("Search must be the heart o…") – rest built on judgment.

## State (branch claude/i-kiribati-help-pwa-73ujsm, pushed, head 6613abf)
- 381e677 full app; 435f149 Android install button (js/install.js); 6613abf modern theme + new logo, all emoji icons removed.
- `npm run check` green: lint, data validate, sync-gas, 61 unit/backend, 25 e2e.
- No PR: no base branch exists (repo was empty). Not deployed.
- Last turn: user asked "What next?" – gave prioritized list; awaiting reply.

## Next steps (only on user instruction)
1. User deploys (README Deploy + apps-script/README.md) and sends API_URL (/exec), site URL, public contact email → set js/config.js, robots.txt, sitemap.xml, absolute og:image URL.
2. Get rest of brief (section 5+) and build gaps.
3. On "create main": create main, open draft PR, subscribe_pr_activity.
4. Optional: bulk-add services from user lists; real-phone perf pass.

## Decisions (why)
- Classic deferred scripts + window.IKH + hash routing: no build step, any static host, non-expert maintainer.
- js/search.js shared with backend via tools/sync-gas.mjs → SearchCore.gs (CI checks identical).
- Inverted index + first-letter fuzzy, no fuzzy on synonyms: 2.7s → ~10ms at 1k services.
- Seed data all `unverified`, no invented contacts; only 192/193/194 (Smartraveller) – confirm locally.
- Kiribati strings draft only (ki-translator data missing in env).
- Install: native beforeinstallprompt on Android, instructions dialog iOS/no-prompt; mwakete.com blocked by egress proxy.
- User wanted no generic icons: only logo images remain (e2e guard test); category identity via colour tokens (--cat-*) + descriptions.
- Theme tokens in css/main.css: ocean #0B2D4A → lagoon #0B6E86/#16B3A3, sunrise #FFD166→#FF7A59; text colours tuned to WCAG AA 4.5:1; avoided color-mix() for older Android.

## Gotchas
- Bump CACHE_VERSION in sw.js each deploy (now ikh-v1.2.0); data meta.version YYYY.MM.DD-HHMMSS (now 2026.10.07-120000).
- Logo change → `npm run icons` (Playwright renders PNGs).
- `pkill -f` kills own shell; use `pgrep -f '[h]ttp-server'`.
- Playwright via `npm link playwright`; ESM ignores NODE_PATH.
- Fake beforeinstallprompt in e2e must fire once (sessionStorage).

## Open questions
- Rest of brief? Domain/site URL? Public contact email? Permission to create `main`?
