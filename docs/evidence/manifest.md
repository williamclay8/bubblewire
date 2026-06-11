# Bubblewire QA Evidence Manifest

## Claim

Bubblewire is a deployed, submission-ready unified chat aggregator for Twitch + YouTube + X + Kick + X Live with source labels, demo-safe operation, a live-only production mode, server-side live adapter paths, and judge-readable evidence.

## Target

- Local app: `http://127.0.0.1:3000`
- Public app: `https://bubblewire.xyz`
- Public overlay: `https://bubblewire.xyz/overlay.html`
- Fallback Render URL: `https://bubblewire-challenge.onrender.com`
- Public demo video: `https://youtu.be/I9C0VDrWddA`
- Final Market Bubble local video: `docs/evidence/video/bubblewire-market-bubble-final-2026-06-11.mp4`
- Historical final-cut YouTube demo: `https://youtu.be/hLerxCevS2w`
- Hosted MP4 mirror: `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`
- Next resubmission script: `docs/submission-video-script-2026-06-10.md`
- Next narrated draft manifest: `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.manifest.json`
- Next narrated local draft: `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.mp4`
- Public MP4 mirror: `https://bubblewire.xyz/assets/bubblewire-submission-voiceover-2026-06-10.mp4`
- Public health check: `https://bubblewire.xyz/healthz`
- Local overlay: `http://127.0.0.1:3000/overlay.html`
- Health check: `http://127.0.0.1:3000/healthz`
- Branch: `main`
- GitHub repo: `https://github.com/williamclay8/bubblewire`
- Render service: `bubblewire-challenge` (`srv-d8gsprmq1p3s73cfatig`)
- Historical verified app-code commit/deploy at YouTube resubmission time: `fef9b96` / `dep-d8hemdjrjlhs7384o2kg` (Render status `live`, 2026-06-05).
- Challenge form: `https://docs.google.com/forms/d/e/1FAIpQLSeX0D9XRdTaDq179eVNUxmN38MOXz4WSN5AaYk0LDy6us5oMg/viewform`
- Initial submission: 2026-06-04 14:42 CDT; Google Forms confirmation: "Your response has been recorded."
- Custom-domain resubmission: recorded 2026-06-04 18:17 CDT with demo video `https://youtu.be/MGEKOfs4yn0`, live app `https://bubblewire.xyz`, and pushed commit `49145a8`.
- YouTube final-cut resubmission: recorded 2026-06-06 09:46 CDT with demo video `https://youtu.be/hLerxCevS2w`, live app `https://bubblewire.xyz`, and pushed commit `fef9b96`.
- Refreshed public-video resubmission: recorded 2026-06-09 20:37 CDT with demo video `https://youtu.be/kwUZgMBtK48`, X handle `@williamclay`, GitHub repo `https://github.com/williamclay8/bubblewire`, and live app note `https://bubblewire.xyz`.
- Final Market Bubble submission: recorded 2026-06-11 17:18 CDT with demo video `https://youtu.be/I9C0VDrWddA`, X handle `@williamclay`, GitHub repo `https://github.com/williamclay8/bubblewire`, live app note `https://bubblewire.xyz`, and Google Forms confirmation "Your response has been recorded."
- Date: 2026-06-11

## Verification Commands

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | Pass, 94/94 tests on 2026-06-11 | Terminal verification during final Market Bubble run |
| `npm run check` | Pass on 2026-06-11 | Terminal verification during final Market Bubble run |
| `npm run proof` | Pass on 2026-06-09 against `http://127.0.0.1:3100` | `docs/evidence/logs/proof.json` |
| `npm run proof:live` | Pass on 2026-06-09 against `https://bubblewire.xyz` with `twitch,x,kick` expected | `docs/evidence/logs/live-proof.json` |
| `render blueprints validate render.yaml --output json` | Pass | `docs/evidence/logs/render-blueprint-validation.json` |

`npm run proof` also posts a Kick `chat.message.sent`-shaped webhook payload to `/kick.webhook`, triggers a demo spike, and confirms the local status endpoint responds through `/status.json`.

`npm run proof:live` confirms `DEMO_MODE=off` reports `runtime.liveOnly: true`, rejects `/demo-spike.json`, `/demo-start.json`, and `/inject.json` with HTTP 409, proves `/events.stream`, `/export.ndjson`, and `/overlay.html`, posts one Kick webhook-shaped event, and verifies expected live sources when `BUBBLEWIRE_EXPECT_SOURCES` is set.

## Browser Evidence

| Artifact | Viewport | Purpose |
| --- | --- | --- |
| `docs/evidence/screenshots/dashboard-desktop.png` | 1280 x 720 | Main dashboard, source labels, health strip, feed, controls, inspector |
| `docs/evidence/screenshots/overlay-desktop.png` | 1280 x 720 | OBS/browser-source style overlay without dashboard chrome |
| `docs/evidence/screenshots/dashboard-mobile-390.png` | 390 x 844 | Mobile layout, no horizontal overflow, controls remain usable |
| `docs/evidence/screenshots/setup-x-rules.png` | 1280 x 720 | Setup drawer showing sanitized X filtered-stream rule visibility |

Note: screenshots and video frames were re-captured on 2026-06-05 after adding the live proof receipt, judge-mode mobile feed-first layout, Kick evidence-level labels, and X rule visibility.

## Demo Recording Plan

The final-cut demo video is uploaded to YouTube as `https://youtu.be/hLerxCevS2w`, with hosted MP4 mirror `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`. The local source is `docs/evidence/video/bubblewire-final-cut-2026-06-05.mp4`, rendered at 1920 x 1080, 30fps, H.264/AAC, with 79.97s duration. Source frames live in `docs/evidence/video-frames/final-cut/`, with `contact-sheet.png`, `shot-manifest.json`, and `docs/evidence/video/bubblewire-final-cut-preview.png` for QA review. Public proof content avoids secrets and private dashboards.

The next resubmission script is `docs/submission-video-script-2026-06-10.md`. Its local narrated-video recipe is `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.manifest.json`. The first local narrated draft rendered to `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.mp4` with caption sidecars at `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.srt` and `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.vtt`. The narrated cut was uploaded publicly to YouTube as `https://youtu.be/kwUZgMBtK48`. Google Forms recorded the refreshed public-video resubmission on 2026-06-09 at 20:37 CDT. A deployable MP4 copy lives under `public/assets/` and is reachable at `https://bubblewire.xyz/assets/bubblewire-submission-voiceover-2026-06-10.mp4`.

The final Market Bubble cut is uploaded unlisted to YouTube as `https://youtu.be/I9C0VDrWddA`. The local source is `docs/evidence/video/bubblewire-market-bubble-final-2026-06-11.mp4`, rendered at 1920 x 1080, H.264/AAC, with 74.11s duration and caption sidecars. Capture artifacts live under `docs/evidence/video/market-bubble-final-2026-06-11/`, including `dashboard-live-proof.png`, `youtube-filter.png`, `streamer-mode.png`, `overlay-setup.png`, `overlay-live.png`, and review frames. The redaction boundary explicitly avoided setup drawer secrets, environment values, token state, and credential identifiers.

## 2026-06-05 Tranche Receipts

| Receipt | Evidence |
| --- | --- |
| Live proof receipt | `/status.json` includes `proof.sources`; dashboard displays per-source proof levels and raw event type |
| Kick evidence labels | Kick webhook rows and receipt show `WEBHOOK-PROOF`; signed webhook mode can show `SIGNED` |
| X rule visibility | `/setup.json` includes sanitized `sources.x.rules`; setup drawer displays rule tag/value rows |
| Judge/mobile mode | `?judge=1` skips the boot interstitial and mobile CSS orders feed, controls, then inspector |

## Live Adapter Matrix

| Source | Implemented live path | Demo-safe/live-only fallback |
| --- | --- | --- |
| Twitch | EventSub `channel.chat.message`; anonymous read-only IRC fallback for public channels; authenticated IRC fallback | Demo mode emits labeled demo messages; live-only mode marks missing `TWITCH_CHANNELS` as `missing` |
| YouTube | Live comments/chat polling for configured channel/video handles | Live-only mode marks missing API key/quota or inactive chat honestly |
| X + X Live | X API v2 filtered stream via server-side bearer token; X Live replies via a `conversation_id:<post id>` rule on the shared stream | Demo mode emits labeled demo messages; live-only mode marks missing or blocked X access honestly |
| Kick | Official Events API `chat.message.sent` webhook to `/webhooks/kick` or `/kick.webhook`; optional startup subscription with `KICK_AUTO_SUBSCRIBE=1`; optional signature verification with `KICK_REQUIRE_SIGNATURE=1` | Demo mode emits labeled demo messages; live-only mode stays `webhook-ready` until a webhook arrives |

Official Kick source check: current Kick docs list `chat.message.sent` as an Events API webhook payload, document event subscriptions at `POST https://api.kick.com/public/v1/events/subscriptions` with `events:subscribe`, and document the Chat API as send/delete chat rather than read-side chat streaming. No official anonymous/public read-only Kick chat stream was found in the current docs.

## Redaction And Secret Boundary

- No secret values were captured.
- `.env` and `.env.*` are ignored.
- `.env.example` lists env var names only.
- Browser screenshots avoid secrets and private dashboards.
- The demo recording plan explicitly forbids showing secrets, `.env` files, tokens, or private dashboards.

## Lumi Hygiene

- Local changes: final video packet assets are tracked in the active release run until committed
- Committed: tracked in the final Lumi closeout for the release run
- Pushed: tracked in the final Lumi closeout for the release run
- Deployed/live: app release commit `6d03d94` is pushed to `main`, Render deploy `dep-d8livo6k1jcs73al2acg` is live, and `https://bubblewire.xyz` health check passes
- Entry submitted: yes, latest Google Form confirmation recorded 2026-06-11 17:18 CDT with YouTube demo `https://youtu.be/I9C0VDrWddA`
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

Current public live proof: `docs/evidence/logs/live-proof.json`, generated 2026-06-10T01:41:16.168Z against `https://bubblewire.xyz`, passed with expected sources `twitch,x,kick`. X was connected with the `marketbubble-live` filtered-stream rule. If X API credits become depleted again, claim X as configured/blocked rather than currently flowing.

Latest live source evidence from that proof:

| Source | Status | Count |
| --- | --- | --- |
| Twitch | `connected`, anonymous IRC watch on 3 channels | see `docs/evidence/logs/live-proof.json` |
| X | `connected`, `marketbubble-live` filtered-stream rule | see `docs/evidence/logs/live-proof.json` |
| Kick | `connected`, `webhook-proof` `chat.message.sent` proof | see `docs/evidence/logs/live-proof.json` |

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

Historical form steps are complete for prior submissions. The final Market Bubble submission was recorded by Google Forms on 2026-06-11 at 17:18 CDT. App release commit `6d03d94` is pushed to `main`; Render deploy `dep-d8livo6k1jcs73al2acg` is live; the final YouTube submission is `https://youtu.be/I9C0VDrWddA`.
