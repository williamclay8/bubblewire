# Bubblewire Audit — June 4, 2026

Full project review with a front-end overhaul. Backend left untouched (it's solid); `public/` was redesigned in a trading-terminal style.

## Verdict

Backend: clean, zero-dependency, well-tested (7/7 passing). Frontend: functional but had real bugs, wasteful rendering, and a generic look — now rewritten.

## Backend findings (no changes made)

- `src/server.js`: correct SSE handling with heartbeat + cleanup, path-traversal protection on static serving, JSON body size cap. Good.
- `src/core/hub.js`: dedupe by id, bounded buffer (250), per-source stats. `clone()` via JSON round-trip on every broadcast is O(buffer) but fine at this scale.
- `src/core/messages.js`: thorough normalization, control-char stripping, content length caps, stable hashing. Good.
- Suggestions (optional):
  - Add `X-Content-Type-Options: nosniff` and a CSP header. Note: app.js uses inline `style=` attributes for source colors, so CSP would need `style-attr 'unsafe-inline'` or a refactor to data-attributes.
  - SSE response could include a `retry:` hint for reconnect tuning.
  - `/export.ndjson` and `/demo-spike.json` are unauthenticated; fine for a demo, worth gating if it ever holds real provider data.

## Frontend bugs found (fixed in rewrite)

1. **Pause didn't pause.** `render()` ran unconditionally on every SSE message, so the feed kept scrolling while "paused" — only the unread counter changed. README claimed otherwise. Now paused mode buffers messages (state only), shows `Resume (n)`, and rebuilds on resume.
2. **Full-feed re-render per message.** Every message (one per ~1.3s) wiped all ~80 rows via `innerHTML` and re-attached ~160 listeners. Killed text selection, animations, and scroll stability. Now: single-node prepend with capped list, one delegated click listener, in-place class toggles for select/pin.
3. **Radar staleness + blur.** Canvas only redrew on message arrival and ignored devicePixelRatio. Now redrawn on a 1s tick, DPR-aware, stacked by source with a grid.
4. **Pins lost on reload.** In-memory Map only. Now persisted to localStorage (capped at 24).
5. **`Intl.DateTimeFormat` constructed per message per render.** Now a cached formatter.
6. **Mobile horizontal overflow** (~27px) from topbar intrinsic width. Fixed with `min-width: 0` and compact mobile chrome.

## Accessibility

- Removed `aria-live="polite"` from the feed list — announcing every message (~1/sec) is screen-reader spam.
- Added `aria-pressed` to all toggles (filters, pause), visible `:focus-visible` outlines, proper label/input associations, and a keyboard-accessible custom switch.
- `prefers-reduced-motion` respected (kept).
- Muted-text contrast on dark background is ~7:1 (AA pass).

## Redesign summary (`public/index.html`, `styles.css`, `app.js`)

- Trading-terminal aesthetic: monospace chrome, hairline borders, sharp corners, dark + gold, graph-paper background. Source colors (Twitch purple / X white / Kick green) carried through tags, left borders, tape, and radar.
- New: stats tape (captured/visible/dedupe/unread + per-source counts), UTC clock, SSE link-state indicator (LIVE/RETRY via EventSource open/error), uptime counter, heat shown as a 4-segment meter, verified-author check, `#channel` formatting, demo-mode tag only when not live.
- Keyboard shortcuts: `/` focus search, `p` pause, `Esc` clear.
- Overlay view restyled: color-coded left bars, translucent chips, slide-in entry — still OBS-transparent.
- No new dependencies; still vanilla, still `npm run check` clean.

## Verification performed

- `npm test` 7/7, `npm run check` clean.
- Served locally; screenshotted at 1440×900, 390×844, and overlay at 1280×720 in headless Chromium. Zero console errors. `document.scrollWidth === innerWidth` on mobile.

## Polish pass v2 (same day)

A second, deeper UI/UX pass on top of the redesign:

- **Typography**: IBM Plex Mono (4 weights) + Inter variable, self-hosted in `public/assets/fonts/` (~88 KB total) — no external requests, CSP stays `'self'`, works offline, system-font fallbacks intact.
- **App-shell feed**: the feed is now its own scroll container (page chrome never scrolls on desktop). New messages prepend with scroll-position compensation — reading mid-feed is never yanked — and a gold "▲ N new" jump pill appears instead.
- **Action feedback**: toast system (bottom-right, mono, tone-coded) for spike, export, pin/unpin, pause/resume, priority toggle, copy, and SSE link loss/recovery.
- **Search**: debounced, with `<mark>` highlighting of matches; summary line shows active query/filter context; empty state adapts ("no matches — [esc] to clear").
- **Data-mapped emphasis**: heat color ramp (gold → amber ≥50 → red ≥75 with glow), filter buttons show live per-source counts, tape gained a msgs/min rate, per-source sparklines in the source stack, radar got axis labels + peak readout.
- **Content enrichment**: $cashtags (gold), @mentions (source-colored), URLs shown protocol-stripped and truncated.
- **Craft details**: author colors contrast-clamped for legibility (dark Twitch handle colors lifted), paused banner with buffered count, boot-time panel stagger, film-grain noise texture, counter tick-flash on change, keyboard 1–4 source filters, copy-raw button, handle/channel ellipsis truncation.

Verified again: 7/7 tests, fonts confirmed loading via `document.fonts.check`, zero console errors (CSP clean), no mobile overflow, all interaction states screenshot-tested (search marks, jump pill, paused banner, toasts, enriched content).

## Capability pass v3 (same day)

From polish to product — every roadmap item implemented:

- **History**: zero-dependency NDJSON append log (`src/core/history.js`, 5 MB rotation, write-queue, dedupe) + `/history.json?before=&limit=` pagination + "Load older" in the feed. Survives restarts. `HISTORY=off` to disable. 3 new unit tests.
- **Setup panel**: `s` opens a drawer showing per-source credential status from `/setup.json` (env-var *names and booleans only* — values never leave the server), active Twitch path, copyable Kick webhook URL, and runtime info (DEMO_MODE, HISTORY, ADMIN_TOKEN lock).
- **Runtime Twitch channels**: join/leave IRC channels from the setup panel without redeploying (`POST /api/twitch/channels`, validated, capped at 20, persisted to `data/twitch-channels.json`, connector restarts in place). Anonymous read-only IRC means this works with zero credentials. Optional `ADMIN_TOKEN` gate.
- **Mod tools**: keyword/$ticker watchlist (flagged rows + throttled toasts + optional WebAudio beep, localStorage), click-author-to-filter, consecutive-spam collapse with ×N badges (live-path and rebuild-path both).
- **Overlay configurator**: `/overlay-setup.html` with sliders/toggles, debounced live preview over a transparency checkerboard, copy-URL. Overlay honors `max`, `fade` (timed fade-out), `scale`, `align=bottom` (chat-style append), `sources`.
- **PWA**: manifest + generated icons (incl. maskable) + service worker (network-first documents, stale-while-revalidate statics, never caches streams/APIs).
- **UI smoke tests**: `npm run test:ui` boots the server and runs 12 browser checks (fonts, pause freeze, search marks, watchlist, drawer, history, overlay params, configurator, PWA, console errors). Gracefully skips when playwright-core/Chromium is absent, so `npm test` stays zero-dependency.

## Delight & retention pass v4

- **Visual**: signal-stream particle canvas (DPR-aware, rAF, reduced-motion exempt), spike detection (10s rate ≥ 3× 2-min baseline → tape flash + chip + faster stream), skippable boot sequence (once per session), four theme variants on CSS variables, avatar/initial chips with CSP widened to `img-src https:`, compact density mode, counter tweening, rate-driven live-meter speed.
- **Sticky**: first-visit channel hero wired to runtime IRC join, `(N)` title + alert-favicon on background tabs, opt-in watchlist Notifications, URL view state + Share button, presence count broadcast over SSE (`watching` in runtime snapshot + live `presence` events), canvas session-recap PNG download, persisted filter/priority/theme/density.
- Tests: live-mode runtime expectation updated for `watching`; smoke suite extended to 18 checks (caught a real TDZ bug — `stream` const used before declaration — during this pass). 19/19 unit, 18/18 smoke, zero console errors.

## Challenge proof tranche v5 — June 5, 2026

- **Live proof receipts**: hub snapshots now include `proof.sources`; SSE message payloads broadcast proof updates; the dashboard displays per-source proof level, count, last message time, and raw event type.
- **Judge mode/mobile**: `?judge=1` skips boot and mobile CSS orders the feed before controls and inspector.
- **Kick evidence semantics**: Kick webhook messages carry `evidenceLevel` (`webhook-proof` by default, `signed` when signature verification is required and passes) and row-level evidence chips.
- **X rule visibility**: the X connector exposes sanitized filtered-stream rule snapshots from the X rules API or `X_STREAM_RULES`; `/setup.json` and the drawer render tag/value rows without exposing bearer tokens.
- **Receipts refreshed**: 28/28 unit tests, `npm run check`, `npm run proof`, and `npm run proof:live` passed; screenshots, video frames, and `docs/evidence/video/bubblewire-demo.webm` were regenerated.

## Follow-ups — status

- ~~Backend headers~~ Done: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, CSP (`style-src 'unsafe-inline'` retained for inline source colors), and SSE `retry: 3000` hint. Verified live; zero console errors under CSP.
- ~~Evidence screenshots~~ Done: `docs/evidence/screenshots/` (3) and `docs/evidence/video-frames/` (5) re-captured with the new UI at original dimensions, including staged spike, search, pin, and raw-payload states.
- Still yours: the YouTube demo video shows the old UI (re-record if needed), and push to deploy on Render.
