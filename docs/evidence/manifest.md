# Bubblewire QA Evidence Manifest

## Claim

Bubblewire is a deployed, submission-ready unified chat aggregator for Twitch + X + Kick with source labels, demo-safe operation, a live-only production mode, server-side live adapter paths, and judge-readable evidence.

## Target

- Local app: `http://127.0.0.1:3000`
- Public app: `https://bubblewire-challenge.onrender.com`
- Public overlay: `https://bubblewire-challenge.onrender.com/overlay.html`
- Public demo video: `https://youtu.be/gvXG5qOaBTQ`
- Public health check: `https://bubblewire-challenge.onrender.com/healthz`
- Local overlay: `http://127.0.0.1:3000/overlay.html`
- Health check: `http://127.0.0.1:3000/healthz`
- Branch: `main`
- GitHub repo: `https://github.com/williamclay8/bubblewire`
- Render service: `bubblewire-challenge` (`srv-d8gsprmq1p3s73cfatig`)
- Latest commit/deploy IDs are recorded in the final Lumi closeout for each release run.
- Challenge form: `https://docs.google.com/forms/d/e/1FAIpQLSeX0D9XRdTaDq179eVNUxmN38MOXz4WSN5AaYk0LDy6us5oMg/viewform`
- Submitted: 2026-06-04 14:42 CDT; Google Forms confirmation: "Your response has been recorded."
- Date: 2026-06-04

## Verification Commands

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | Pass, 8/8 tests | `docs/evidence/logs/proof.json` |
| `npm run check` | Pass | `docs/evidence/logs/proof.json` |
| `npm run proof` | Pass | `docs/evidence/logs/proof.json` |
| `npm run proof:live` | Pass | `docs/evidence/logs/live-proof.json` |
| `render blueprints validate render.yaml --output json` | Pass | `docs/evidence/logs/render-blueprint-validation.json` |

`npm run proof` also posts a Kick `chat.message.sent`-shaped webhook payload to `/kick.webhook`, triggers a demo spike, and confirms the local status endpoint responds through `/status.json`.

`npm run proof:live` confirms `DEMO_MODE=off` reports `runtime.liveOnly: true`, rejects `/demo-spike.json`, `/demo-start.json`, and `/inject.json` with HTTP 409, and leaves the feed free of demo messages after those rejected requests.

## Browser Evidence

| Artifact | Viewport | Purpose |
| --- | --- | --- |
| `docs/evidence/screenshots/dashboard-desktop.png` | 1280 x 720 | Main dashboard, source labels, health strip, feed, controls, inspector |
| `docs/evidence/screenshots/overlay-desktop.png` | 1280 x 720 | OBS/browser-source style overlay without dashboard chrome |
| `docs/evidence/screenshots/dashboard-mobile-390.png` | 390 x 844 | Mobile layout, no horizontal overflow, controls remain usable |

Note: screenshots and video frames were re-captured locally on 2026-06-04 (post-submission) after the front-end terminal redesign and security-header hardening. Viewports unchanged. The published YouTube demo video still shows the pre-redesign UI.

## Demo Recording Plan

The uploaded demo video is `https://youtu.be/gvXG5qOaBTQ`. The local WebM source is `docs/evidence/video/bubblewire-demo.webm`, generated from live Render frames in `docs/evidence/video-frames/`.

## Live Adapter Matrix

| Source | Implemented live path | Demo-safe/live-only fallback |
| --- | --- | --- |
| Twitch | EventSub `channel.chat.message`; IRC fallback parser and connector | Demo mode emits labeled demo messages; live-only mode marks missing credentials as `missing` |
| X | X API v2 filtered stream via server-side bearer token | Demo mode emits labeled demo messages; live-only mode marks missing `X_BEARER_TOKEN` as `missing` |
| Kick | `chat.message.sent` webhook to `/webhooks/kick` or `/kick.webhook` | Demo mode emits labeled demo messages; live-only mode stays `webhook-ready` until a webhook arrives |

## Redaction And Secret Boundary

- No secret values were captured.
- `.env` and `.env.*` are ignored.
- `.env.example` lists env var names only.
- Browser screenshots show demo/local status only.
- The demo recording plan explicitly forbids showing secrets, `.env` files, tokens, or private dashboards.

## Lumi Hygiene

- Local changes: tracked in the active release run until committed
- Committed: tracked in the final Lumi closeout for the release run
- Pushed: tracked in the final Lumi closeout for the release run
- Deployed/live: tracked in the final Lumi closeout for the release run; Render service `bubblewire-challenge`
- Entry submitted: yes, Google Form confirmation recorded 2026-06-04 14:42 CDT
- Local server: used for demo-mode and live-only evidence capture, then stopped

## Live Smoke

| Public endpoint | Result |
| --- | --- |
| `https://bubblewire-challenge.onrender.com/healthz` | HTTP 200, JSON health payload |
| `https://bubblewire-challenge.onrender.com/status.json` | HTTP 200, unified status and message payload |
| `https://bubblewire-challenge.onrender.com/overlay.html` | HTTP 200, overlay HTML |
| `https://bubblewire-challenge.onrender.com/events.stream` | HTTP 200, `text/event-stream` snapshot/messages |
| `POST https://bubblewire-challenge.onrender.com/demo-spike.json` | Expected HTTP 409 when `DEMO_MODE=off` |
| `POST https://bubblewire-challenge.onrender.com/inject.json` | Expected HTTP 409 when `DEMO_MODE=off` |
| `https://bubblewire-challenge.onrender.com/export.ndjson` | HTTP 200, NDJSON export |
| `POST https://bubblewire-challenge.onrender.com/kick.webhook` | HTTP 200, Kick webhook payload accepted |

## Deployment Readiness

- `render.yaml` is present for Render Blueprint deployment.
- Render Blueprint validation passed for one service: `bubblewire`.
- `Procfile` is present for generic process hosts.
- Public hosts must bind `HOST=0.0.0.0`.
- `/healthz` returns JSON health status.
- Render service URL: `https://bubblewire-challenge.onrender.com`

## Remaining Submission Steps

None. The challenge form response was recorded on 2026-06-04 at 14:42 CDT.
