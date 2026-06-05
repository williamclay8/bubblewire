# Bubblewire Challenge Submission Notes

## What It Builds

Bubblewire merges Twitch, X, and Kick activity into one reverse-chronological operator feed with platform labels, per-provider status, source filtering, priority filtering, pinned messages, raw payload inspection, demo spikes, and an OBS-friendly overlay route.

GitHub repository: `https://github.com/williamclay8/bubblewire`
Public app: `https://bubblewire.xyz`
Public overlay: `https://bubblewire.xyz/overlay.html`
Fallback Render URL: `https://bubblewire-challenge.onrender.com`
Demo video: `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`

## Why It Should Win

- It is honest about platform reality: X is labeled as matched posts, Kick is webhook-based, Twitch is EventSub-first with a no-secret anonymous IRC fallback for public channels.
- It is judgeable with no secrets: demo mode emits all three sources and marks them as demo.
- It is live-capable: provider credentials are server-side and adapters normalize real payloads.
- It is an operator surface, not just a list: health, dedupe, pause/unread, pinning, export, overlay, and raw provenance are all first-class.

## Demo Script

1. Open `https://bubblewire.xyz` and show the source status strip.
2. In the live deployment, show Twitch and X arriving automatically and Kick appearing after a webhook event. In demo mode, click `Spike`; Twitch, X, and Kick messages arrive in one feed with labels.
3. Filter to one source, search a user, enable priority-only, then pause/resume.
4. Select a message and show the normalized raw payload.
5. Pin a message and export NDJSON.
6. Open `https://bubblewire.xyz/overlay.html` and show readable source chips in the OBS/browser-source view.

## Video Asset

Final-cut hosted demo: `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`

Local final-cut source: `docs/evidence/video/bubblewire-final-cut-2026-06-05.mp4`

The refreshed final cut was recorded from `https://bubblewire.xyz` on 2026-06-05 at 1920 x 1080. It shows the live source-labeled feed, raw provenance inspector, search/source filtering, author drill-down, watchlist alerts, volume/theme controls, honest setup state, OBS overlay configurator, and recap close.

## Deployment Handoff

The project is deployed on Render as `bubblewire-challenge` (`srv-d8gsprmq1p3s73cfatig`). Verify:

```bash
curl -sS https://bubblewire.xyz/healthz
curl -sS https://bubblewire.xyz/status.json
```

`/events.stream`, `/demo-spike.json`, `/export.ndjson`, and `/overlay.html` are the public-safe live routes used by the browser UI.

Latest verified Render deploy: `dep-d8gvqge8bjmc73cumgd0` for pushed commit `9f4f8e8`.

Live smoke passed on 2026-06-04 for `https://bubblewire.xyz` routes: `/healthz`, `/status.json`, `/events.stream`, `/demo-spike.json`, `/demo-start.json`, `/inject.json`, `/export.ndjson`, `/kick.webhook`, and `/overlay.html`.

Latest public live proof verified `twitch,x,kick` expected sources: Twitch `connected` with 1046 messages, X `connected` with 42 messages, and Kick `connected` with 2 webhook proof events in `docs/evidence/logs/live-proof.json`.

Initial challenge form submission was recorded by Google Forms on 2026-06-04 at 14:42 CDT. Custom-domain resubmission was recorded by Google Forms on 2026-06-04 at 18:17 CDT with demo video `https://youtu.be/MGEKOfs4yn0`, live app `https://bubblewire.xyz`, and pushed commit `49145a8`. Final-cut resubmission uses hosted demo video `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`.

## Live Integration Matrix

| Source | Live Path | Local Demo State | Required Env Names |
| --- | --- | --- | --- |
| Twitch | EventSub `channel.chat.message`; anonymous read-only IRC fallback; authenticated IRC fallback | Demo until Twitch config exists | `TWITCH_CHANNELS`; optional `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ACCESS_TOKEN`, `TWITCH_BOT_USER_ID`, `TWITCH_BROADCASTER_USER_ID`, `TWITCH_USERNAME`, `TWITCH_OAUTH_TOKEN` |
| X | X API v2 filtered stream | Demo until bearer token exists | `X_BEARER_TOKEN` |
| Kick | Official Events API `chat.message.sent` webhook to `/webhooks/kick` or `/kick.webhook`; optional startup subscription; optional signature verification | Webhook-ready until payload arrives | `KICK_WEBHOOK_PUBLIC_URL`; optional `KICK_AUTO_SUBSCRIBE`, `KICK_ACCESS_TOKEN`, `KICK_BROADCASTER_USER_ID`, `KICK_REQUIRE_SIGNATURE` |

## Source Checks

- Twitch docs: EventSub subscription type `channel.chat.message` and Chat & Chatbots page identify EventSub/API as the preferred chat path.
- X docs: Filtered Stream provides near real-time posts over `GET /2/tweets/search/stream`.
- Kick docs: Events API supports webhooks including `chat.message.sent`; subscribing requires `events:subscribe`, and localhost needs a public tunnel.

## Lumi Hygiene

Verified app-code commit `d6814ce` is pushed, `https://bubblewire.xyz` is verified on Render and Cloudflare, and the final-cut demo asset is prepared for live deployment at `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`.
