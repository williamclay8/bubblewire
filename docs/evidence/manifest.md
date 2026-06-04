# Bubblewire QA Evidence Manifest

## Claim

Bubblewire is a deployed, submission-ready unified chat aggregator for Twitch + X + Kick with source labels, demo-safe operation, server-side live adapter paths, and judge-readable evidence.

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
- Verified app-code commit: `b7e84d1` (`fix live render routes`)
- Render service: `bubblewire-challenge` (`srv-d8gsprmq1p3s73cfatig`)
- Render deploy: `dep-d8gstqernols73b3fmbg`
- Challenge form: `https://docs.google.com/forms/d/e/1FAIpQLSeX0D9XRdTaDq179eVNUxmN38MOXz4WSN5AaYk0LDy6us5oMg/viewform`
- Submitted: 2026-06-04 14:42 CDT; Google Forms confirmation: "Your response has been recorded."
- Date: 2026-06-04

## Verification Commands

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | Pass, 7/7 tests | `docs/evidence/logs/proof.json` |
| `npm run check` | Pass | `docs/evidence/logs/proof.json` |
| `npm run proof` | Pass | `docs/evidence/logs/proof.json` |
| `render blueprints validate render.yaml --output json` | Pass | `docs/evidence/logs/render-blueprint-validation.json` |

`npm run proof` also posts a Kick `chat.message.sent`-shaped webhook payload to `/kick.webhook`, triggers a demo spike, and confirms the local status endpoint responds through `/status.json`.

## Browser Evidence

| Artifact | Viewport | Purpose |
| --- | --- | --- |
| `docs/evidence/screenshots/dashboard-desktop.png` | 1280 x 720 | Main dashboard, source labels, health strip, feed, controls, inspector |
| `docs/evidence/screenshots/overlay-desktop.png` | 1280 x 720 | OBS/browser-source style overlay without dashboard chrome |
| `docs/evidence/screenshots/dashboard-mobile-390.png` | 390 x 844 | Mobile layout, no horizontal overflow, controls remain usable |

## Demo Recording Plan

The uploaded demo video is `https://youtu.be/gvXG5qOaBTQ`. The local WebM source is `docs/evidence/video/bubblewire-demo.webm`, generated from live Render frames in `docs/evidence/video-frames/`.

## Live Adapter Matrix

| Source | Implemented live path | Demo-safe fallback |
| --- | --- | --- |
| Twitch | EventSub `channel.chat.message`; IRC fallback parser and connector | Clearly labeled demo feed when Twitch env vars are absent |
| X | X API v2 filtered stream via server-side bearer token | Clearly labeled demo feed when `X_BEARER_TOKEN` is absent |
| Kick | `chat.message.sent` webhook to `/webhooks/kick` or `/kick.webhook` | Webhook-ready status plus demo feed until a webhook arrives |

## Redaction And Secret Boundary

- No secret values were captured.
- `.env` and `.env.*` are ignored.
- `.env.example` lists env var names only.
- Browser screenshots show demo/local status only.
- The demo recording plan explicitly forbids showing secrets, `.env` files, tokens, or private dashboards.

## Lumi Hygiene

- Local changes: no after this evidence receipt is committed
- Committed: yes, verified app-code commit `b7e84d1`
- Pushed: yes, `origin/main`
- Deployed/live: yes, Render service `bubblewire-challenge`, deploy `dep-d8gstqernols73b3fmbg`
- Entry submitted: yes, Google Form confirmation recorded 2026-06-04 14:42 CDT
- Local server: running at `http://127.0.0.1:3000` during local evidence capture

## Live Smoke

| Public endpoint | Result |
| --- | --- |
| `https://bubblewire-challenge.onrender.com/healthz` | HTTP 200, JSON health payload |
| `https://bubblewire-challenge.onrender.com/status.json` | HTTP 200, unified status and message payload |
| `https://bubblewire-challenge.onrender.com/overlay.html` | HTTP 200, overlay HTML |
| `https://bubblewire-challenge.onrender.com/events.stream` | HTTP 200, `text/event-stream` snapshot/messages |
| `POST https://bubblewire-challenge.onrender.com/demo-spike.json` | HTTP 200, demo spike accepted |
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
