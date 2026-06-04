# Bubblewire Challenge Submission Notes

## What It Builds

Bubblewire merges Twitch, X, and Kick activity into one reverse-chronological operator feed with platform labels, per-provider status, source filtering, priority filtering, pinned messages, raw payload inspection, demo spikes, and an OBS-friendly overlay route.

## Why It Should Win

- It is honest about platform reality: X is labeled as matched posts, Kick is webhook-based, Twitch is EventSub-first.
- It is judgeable with no secrets: demo mode emits all three sources and marks them as demo.
- It is live-capable: provider credentials are server-side and adapters normalize real payloads.
- It is an operator surface, not just a list: health, dedupe, pause/unread, pinning, export, overlay, and raw provenance are all first-class.

## Demo Script

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000` and show the source status strip.
3. Click `Spike`; Twitch, X, and Kick messages arrive in one feed with labels.
4. Filter to one source, search a user, enable priority-only, then pause/resume.
5. Select a message and show the normalized raw payload.
6. Pin a message and export NDJSON.
7. Open `http://localhost:3000/overlay`; fire another spike and show readable source chips.

## Deployment Handoff

The project is ready for a Render Blueprint deploy through `render.yaml`. After deployment, verify:

```bash
curl -sS https://<live-url>/healthz
curl -sS https://<live-url>/api/status
```

Then update this file and `docs/evidence/manifest.md` with the live URL.

## Live Integration Matrix

| Source | Live Path | Local Demo State | Required Env Names |
| --- | --- | --- | --- |
| Twitch | EventSub `channel.chat.message`; IRC fallback | Demo until Twitch vars exist | `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ACCESS_TOKEN`, `TWITCH_BOT_USER_ID`, `TWITCH_BROADCASTER_USER_ID` |
| X | X API v2 filtered stream | Demo until bearer token exists | `X_BEARER_TOKEN` |
| Kick | `chat.message.sent` webhook to `/webhooks/kick` | Webhook-ready until payload arrives | `KICK_WEBHOOK_PUBLIC_URL` |

## Source Checks

- Twitch docs: EventSub subscription type `channel.chat.message` and Chat & Chatbots page identify EventSub/API as the preferred chat path.
- X docs: Filtered Stream provides near real-time posts over `GET /2/tweets/search/stream`.
- Kick docs: Events API supports webhooks including `chat.message.sent`, and localhost needs a public tunnel.

## Lumi Hygiene

As of this file, work is local only unless a later commit/push/deploy receipt says otherwise.
