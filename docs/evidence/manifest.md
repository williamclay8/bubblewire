# Bubblewire QA Evidence Manifest

## Claim

Bubblewire is a local, submission-ready unified chat aggregator for Twitch + X + Kick with source labels, demo-safe operation, server-side live adapter paths, and judge-readable evidence.

## Target

- Local app: `http://127.0.0.1:3000`
- Overlay: `http://127.0.0.1:3000/overlay`
- Health check: `http://127.0.0.1:3000/healthz`
- Branch: `main`
- GitHub repo: `https://github.com/williamclay8/bubblewire`
- Commit: see `git log --oneline -1` for the current pushed evidence commit
- Date: 2026-06-04

## Verification Commands

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | Pass, 7/7 tests | `docs/evidence/logs/proof.json` |
| `npm run check` | Pass | `docs/evidence/logs/proof.json` |
| `npm run proof` | Pass | `docs/evidence/logs/proof.json` |
| `render blueprints validate render.yaml --output json` | Pass | `docs/evidence/logs/render-blueprint-validation.json` |

`npm run proof` also posts a Kick `chat.message.sent`-shaped webhook payload to `/webhooks/kick`, triggers a demo spike, and confirms the local status endpoint responds.

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
| Kick | `chat.message.sent` webhook to `/webhooks/kick` | Webhook-ready status plus demo feed until a webhook arrives |

## Redaction And Secret Boundary

- No secret values were captured.
- `.env` and `.env.*` are ignored.
- `.env.example` lists env var names only.
- Browser screenshots show demo/local status only.
- The demo recording plan explicitly forbids showing secrets, `.env` files, tokens, or private dashboards.

## Lumi Hygiene

- Local changes: yes
- Committed: yes
- Pushed: yes, `https://github.com/williamclay8/bubblewire`
- Deployed/live: no public deployment verified
- Local server: running at `http://127.0.0.1:3000` during this evidence capture

## Deployment Readiness

- `render.yaml` is present for Render Blueprint deployment.
- Render Blueprint validation passed for one service: `bubblewire`.
- `Procfile` is present for generic process hosts.
- Public hosts must bind `HOST=0.0.0.0`.
- `/healthz` returns JSON health status.

## Remaining Submission Steps

1. Select the Render workspace for MCP service creation, or create the service from the Render Dashboard using `render.yaml`.
2. Deploy and live-verify the public URL.
3. Record a 60-90 second demo using the script in `docs/challenge-submission.md`.
4. Submit the app URL, repository, and evidence artifacts through the challenge form.
