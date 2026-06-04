# Bubblewire QA Evidence Manifest

## Claim

Bubblewire is a deployed, submission-ready unified chat aggregator for Twitch + X + Kick with source labels, demo-safe operation, a live-only production mode, server-side live adapter paths, and judge-readable evidence.

## Target

- Local app: `http://127.0.0.1:3000`
- Public app: `https://bubblewire.xyz`
- Public overlay: `https://bubblewire.xyz/overlay.html`
- Fallback Render URL: `https://bubblewire-challenge.onrender.com`
- Public demo video: `https://youtu.be/MGEKOfs4yn0`
- Public health check: `https://bubblewire.xyz/healthz`
- Local overlay: `http://127.0.0.1:3000/overlay.html`
- Health check: `http://127.0.0.1:3000/healthz`
- Branch: `main`
- GitHub repo: `https://github.com/williamclay8/bubblewire`
- Render service: `bubblewire-challenge` (`srv-d8gsprmq1p3s73cfatig`)
- Latest commit/deploy IDs are recorded in the final Lumi closeout for each release run.
- Challenge form: `https://docs.google.com/forms/d/e/1FAIpQLSeX0D9XRdTaDq179eVNUxmN38MOXz4WSN5AaYk0LDy6us5oMg/viewform`
- Initial submission: 2026-06-04 14:42 CDT; Google Forms confirmation: "Your response has been recorded."
- Custom-domain resubmission: recorded 2026-06-04 18:17 CDT with demo video `https://youtu.be/MGEKOfs4yn0`, live app `https://bubblewire.xyz`, and pushed commit `49145a8`.
- Date: 2026-06-04

## Verification Commands

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | Pass, 16/16 tests | `docs/evidence/logs/proof.json` |
| `npm run check` | Pass | `docs/evidence/logs/proof.json` |
| `npm run proof` | Pass | `docs/evidence/logs/proof.json` |
| `npm run proof:live` | Pass | `docs/evidence/logs/live-proof.json` |
| `render blueprints validate render.yaml --output json` | Pass | `docs/evidence/logs/render-blueprint-validation.json` |

`npm run proof` also posts a Kick `chat.message.sent`-shaped webhook payload to `/kick.webhook`, triggers a demo spike, and confirms the local status endpoint responds through `/status.json`.

`npm run proof:live` confirms `DEMO_MODE=off` reports `runtime.liveOnly: true`, rejects `/demo-spike.json`, `/demo-start.json`, and `/inject.json` with HTTP 409, proves `/events.stream`, `/export.ndjson`, and `/overlay.html`, posts one Kick webhook-shaped event, and verifies expected live sources when `BUBBLEWIRE_EXPECT_SOURCES` is set.

## Browser Evidence

| Artifact | Viewport | Purpose |
| --- | --- | --- |
| `docs/evidence/screenshots/dashboard-desktop.png` | 1280 x 720 | Main dashboard, source labels, health strip, feed, controls, inspector |
| `docs/evidence/screenshots/overlay-desktop.png` | 1280 x 720 | OBS/browser-source style overlay without dashboard chrome |
| `docs/evidence/screenshots/dashboard-mobile-390.png` | 390 x 844 | Mobile layout, no horizontal overflow, controls remain usable |

Note: screenshots and video frames were re-captured on 2026-06-04 after the front-end terminal redesign, security-header hardening, and custom-domain launch. The refreshed YouTube demo uses `https://bubblewire.xyz`, live-only production mode, source filters, pinned/raw provenance, and the overlay route.

## Demo Recording Plan

The uploaded demo video is `https://youtu.be/MGEKOfs4yn0`. The local WebM source is `docs/evidence/video/bubblewire-demo.webm`, generated from `https://bubblewire.xyz` frames in `docs/evidence/video-frames/`. Public overlay proof content is redacted in the browser-rendered frame to avoid exposing arbitrary live chat text; no secrets or private dashboards are captured.

## Live Adapter Matrix

| Source | Implemented live path | Demo-safe/live-only fallback |
| --- | --- | --- |
| Twitch | EventSub `channel.chat.message`; anonymous read-only IRC fallback for public channels; authenticated IRC fallback | Demo mode emits labeled demo messages; live-only mode marks missing `TWITCH_CHANNELS` as `missing` |
| X | X API v2 filtered stream via server-side bearer token | Demo mode emits labeled demo messages; live-only mode marks missing `X_BEARER_TOKEN` as `missing` |
| Kick | Official Events API `chat.message.sent` webhook to `/webhooks/kick` or `/kick.webhook`; optional startup subscription with `KICK_AUTO_SUBSCRIBE=1`; optional signature verification with `KICK_REQUIRE_SIGNATURE=1` | Demo mode emits labeled demo messages; live-only mode stays `webhook-ready` until a webhook arrives |

Official Kick source check: current Kick docs list `chat.message.sent` as an Events API webhook payload, document event subscriptions at `POST https://api.kick.com/public/v1/events/subscriptions` with `events:subscribe`, and document the Chat API as send/delete chat rather than read-side chat streaming. No official anonymous/public read-only Kick chat stream was found in the current docs.

## Redaction And Secret Boundary

- No secret values were captured.
- `.env` and `.env.*` are ignored.
- `.env.example` lists env var names only.
- Browser screenshots avoid secrets and private dashboards.
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
| `https://bubblewire.xyz/healthz` | HTTP 200, JSON health payload |
| `https://bubblewire.xyz/status.json` | HTTP 200, unified status and message payload |
| `https://bubblewire.xyz/overlay.html` | HTTP 200, overlay HTML |
| `https://bubblewire.xyz/events.stream` | HTTP 200, `text/event-stream` snapshot/messages |
| `POST https://bubblewire.xyz/demo-spike.json` | Expected HTTP 409 when `DEMO_MODE=off` |
| `POST https://bubblewire.xyz/inject.json` | Expected HTTP 409 when `DEMO_MODE=off` |
| `https://bubblewire.xyz/export.ndjson` | HTTP 200, NDJSON export |
| `POST https://bubblewire.xyz/kick.webhook` | HTTP 200, Kick webhook payload accepted |

Latest public live proof: `docs/evidence/logs/live-proof.json`, generated 2026-06-04T22:53:10.306Z against `https://bubblewire.xyz`, passed with expected sources `twitch,x,kick`.

Latest live source evidence from that proof:

| Source | Status | Count |
| --- | --- | --- |
| Twitch | `connected`, `watching 3 channels anonymously` | 1046 |
| X | `connected`, `filtered stream online` | 42 |
| Kick | `connected`, `last webhook accepted` | 2 |

## Deployment Readiness

- `render.yaml` is present for Render Blueprint deployment.
- Render Blueprint validation passed for one service: `bubblewire`.
- `Procfile` is present for generic process hosts.
- Public hosts must bind `HOST=0.0.0.0`.
- `/healthz` returns JSON health status.
- Primary service URL: `https://bubblewire.xyz`
- Render fallback URL: `https://bubblewire-challenge.onrender.com`
- Official Kick subscription requires owner-provided `KICK_ACCESS_TOKEN` with `events:subscribe`, `KICK_BROADCASTER_USER_ID`, and a webhook URL configured in the Kick developer app.

## Submission Closeout

No remaining form steps. The custom-domain resubmission was recorded by Google Forms on 2026-06-04 at 18:17 CDT.
