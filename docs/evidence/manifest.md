# Bubblewire QA Evidence Manifest

## Claim

Bubblewire is a deployed, submission-ready unified chat aggregator for Twitch + X + Kick with source labels, demo-safe operation, server-side live adapter paths, and judge-readable evidence.

## Target

- Local app: `http://127.0.0.1:3000`
- Public app: `https://bubblewire-challenge.onrender.com`
- Public overlay: `https://bubblewire-challenge.onrender.com/overlay.html`
- Public health check: `https://bubblewire-challenge.onrender.com/healthz`
- Local overlay: `http://127.0.0.1:3000/overlay.html`
- Health check: `http://127.0.0.1:3000/healthz`
- Branch: `main`
- GitHub repo: `https://github.com/williamclay8/bubblewire`
- Commit: see `git log --oneline -1` for the current pushed evidence commit
- Render service: `bubblewire-challenge` (`srv-d8gsprmq1p3s73cfatig`)
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

The recording storyboard lives at `docs/demo-video-storyboard.md`. It is ready to use after the public Render URL is live.

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

- Local changes: yes, route aliases and docs are awaiting commit during this capture
- Committed: pending this evidence refresh
- Pushed: pending this evidence refresh; previous pushed repo is `https://github.com/williamclay8/bubblewire`
- Deployed/live: initial Render deploy verified for `/` and `/healthz`; final alias deploy verification pending
- Local server: running at `http://127.0.0.1:3000` during this evidence capture

## Deployment Readiness

- `render.yaml` is present for Render Blueprint deployment.
- Render Blueprint validation passed for one service: `bubblewire`.
- `Procfile` is present for generic process hosts.
- Public hosts must bind `HOST=0.0.0.0`.
- `/healthz` returns JSON health status.
- Render service URL: `https://bubblewire-challenge.onrender.com`

## Remaining Submission Steps

1. Commit and push the public route-alias fix.
2. Wait for Render auto-deploy of the new commit.
3. Live-verify `/healthz`, `/status.json`, `/events.stream`, `/overlay.html`, `/demo-spike.json`, and `/export.ndjson`.
4. Submit the app URL, repository, and evidence artifacts through the challenge form.
