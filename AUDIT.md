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

## Follow-ups — status

- ~~Backend headers~~ Done: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, CSP (`style-src 'unsafe-inline'` retained for inline source colors), and SSE `retry: 3000` hint. Verified live; zero console errors under CSP.
- ~~Evidence screenshots~~ Done: `docs/evidence/screenshots/` (3) and `docs/evidence/video-frames/` (5) re-captured with the new UI at original dimensions, including staged spike, search, pin, and raw-payload states.
- Still yours: the YouTube demo video shows the old UI (re-record if needed), and push to deploy on Render.
