# Bubblewire Challenge Submission Notes

## What It Builds

Bubblewire merges Twitch, X, and Kick activity into one reverse-chronological operator feed with platform labels, per-provider status, source filtering, priority filtering, pinned messages, raw payload inspection, demo spikes, and an OBS-friendly overlay route.

GitHub repository: `https://github.com/williamclay8/bubblewire`
Public app: `https://bubblewire-challenge.onrender.com`
Public overlay: `https://bubblewire-challenge.onrender.com/overlay.html`
Demo video: `https://youtu.be/gvXG5qOaBTQ`

## Why It Should Win

- It is honest about platform reality: X is labeled as matched posts, Kick is webhook-based, Twitch is EventSub-first with a no-secret anonymous IRC fallback for public channels.
- It is judgeable with no secrets: demo mode emits all three sources and marks them as demo.
- It is live-capable: provider credentials are server-side and adapters normalize real payloads.
- It is an operator surface, not just a list: health, dedupe, pause/unread, pinning, export, overlay, and raw provenance are all first-class.

## Demo Script

1. Open `https://bubblewire-challenge.onrender.com` and show the source status strip.
2. In the live deployment, show Twitch and X arriving automatically and Kick appearing after a webhook event. In demo mode, click `Spike`; Twitch, X, and Kick messages arrive in one feed with labels.
3. Filter to one source, search a user, enable priority-only, then pause/resume.
4. Select a message and show the normalized raw payload.
5. Pin a message and export NDJSON.
6. Open `https://bubblewire-challenge.onrender.com/overlay.html`; fire another spike and show readable source chips.

## Video Asset

Uploaded YouTube demo: `https://youtu.be/gvXG5qOaBTQ`

Local source video: `docs/evidence/video/bubblewire-demo.webm`

## Deployment Handoff

The project is deployed on Render as `bubblewire-challenge` (`srv-d8gsprmq1p3s73cfatig`). Verify:

```bash
curl -sS https://bubblewire-challenge.onrender.com/healthz
curl -sS https://bubblewire-challenge.onrender.com/status.json
```

`/events.stream`, `/demo-spike.json`, `/export.ndjson`, and `/overlay.html` are the public-safe live routes used by the browser UI.

Latest verified Render deploy: `dep-d8gvdv6k1jcs739a4lj0` for pushed commit `ddd1435`.

Live smoke passed on 2026-06-04 for `/healthz`, `/status.json`, `/events.stream`, `/demo-spike.json`, `/demo-start.json`, `/inject.json`, `/export.ndjson`, `/kick.webhook`, and `/overlay.html`.

Latest public live proof verified `twitch,x,kick` expected sources: Twitch `connected` with 243 messages, X `connected` with 12 messages, and Kick `connected` with 2 webhook proof events in `docs/evidence/logs/live-proof.json`.

Challenge form submission was recorded by Google Forms on 2026-06-04 at 14:42 CDT.

## Live Integration Matrix

| Source | Live Path | Local Demo State | Required Env Names |
| --- | --- | --- | --- |
| Twitch | EventSub `channel.chat.message`; anonymous read-only IRC fallback; authenticated IRC fallback | Demo until Twitch config exists | `TWITCH_CHANNELS`; optional `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ACCESS_TOKEN`, `TWITCH_BOT_USER_ID`, `TWITCH_BROADCASTER_USER_ID`, `TWITCH_USERNAME`, `TWITCH_OAUTH_TOKEN` |
| X | X API v2 filtered stream | Demo until bearer token exists | `X_BEARER_TOKEN` |
| Kick | `chat.message.sent` webhook to `/webhooks/kick` or `/kick.webhook` | Webhook-ready until payload arrives | `KICK_WEBHOOK_PUBLIC_URL` |

## Source Checks

- Twitch docs: EventSub subscription type `channel.chat.message` and Chat & Chatbots page identify EventSub/API as the preferred chat path.
- X docs: Filtered Stream provides near real-time posts over `GET /2/tweets/search/stream`.
- Kick docs: Events API supports webhooks including `chat.message.sent`, and localhost needs a public tunnel.

## Lumi Hygiene

Verified app-code commit `ddd1435` is pushed, Render deploy `dep-d8gvdv6k1jcs739a4lj0` is live, demo video `https://youtu.be/gvXG5qOaBTQ` is unlisted/reachable, and the Google Form entry is submitted.
