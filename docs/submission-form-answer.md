# Bubblewire Submission Form Copy

## Project Name

Bubblewire

## Repository

https://github.com/williamclay8/bubblewire

## Live App

https://bubblewire.xyz

Fallback Render URL: `https://bubblewire-challenge.onrender.com`

Verified Render deploy: see `docs/evidence/manifest.md` and final Lumi closeout for the latest live release.

## Submitted X Handle

@williamclay

## Demo Video

https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4

## Overlay

https://bubblewire.xyz/overlay.html

## Short Description

Bubblewire is a unified real-time operator feed for Twitch + X + Kick. It merges all three sources into one fast dashboard with unmistakable source labels, per-provider health, demo-safe events, raw payload provenance, and an OBS/browser-source overlay.

## What To Try First

1. Open the app.
2. Watch the live feed populate from Twitch and X, with Kick marked connected after webhook proof.
3. Filter by source, pause the feed, pin a message, and select a message to inspect its normalized payload.
4. Open `/overlay.html` to see the stream-ready view.
5. Demo routes remain disabled on the public live app; local/demo-mode proof is recorded in the evidence manifest.

## Why It Wins

- It is not just a scrolling mock feed; it is a streamer command surface.
- It is honest about provider reality: Twitch is EventSub-first, X is filtered-stream posts, and Kick is webhook-based.
- It is judgeable with no secrets because demo mode is clearly labeled.
- It has live-capable server-side adapter paths and keeps credentials out of the browser.
- It includes proof artifacts: tests, local smoke proof, desktop screenshot, mobile screenshot, overlay screenshot, and an evidence manifest.

## Live Adapter Notes

Twitch uses EventSub `channel.chat.message` when `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ACCESS_TOKEN`, `TWITCH_BOT_USER_ID`, and `TWITCH_BROADCASTER_USER_ID` are present. For no-secret live monitoring, `TWITCH_CHANNELS` alone enables anonymous read-only IRC for public Twitch channels; authenticated IRC remains available with `TWITCH_USERNAME` and `TWITCH_OAUTH_TOKEN`.

X uses API v2 filtered stream from the server with `X_BEARER_TOKEN`.

Kick accepts official Events API `chat.message.sent` webhooks at `/webhooks/kick` and `/kick.webhook`; a public tunnel or deployed URL is required for real Kick chat. Bubblewire can also register the official Kick event subscription at startup when `KICK_AUTO_SUBSCRIBE=1`, `KICK_ACCESS_TOKEN`, and `KICK_BROADCASTER_USER_ID` are set, and can require Kick signature verification with `KICK_REQUIRE_SIGNATURE=1`.

## Proof Checklist

- `npm test`: 41/41 passing
- `npm run check`: passing
- `npm run proof`: passing
- Live smoke on `https://bubblewire.xyz`: `/healthz`, `/status.json`, `/events.stream`, `/demo-spike.json`, `/demo-start.json`, `/inject.json`, `/export.ndjson`, `/kick.webhook`, and `/overlay.html` passing
- Public live proof on `https://bubblewire.xyz`: `twitch,x,kick` expected sources passed; Twitch and X connected automatically, Kick connected after webhook proof
- Final-cut demo: hosted on the live app at `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`
- Challenge form: ready for final-cut resubmission with the live app and hosted MP4.
- Evidence manifest: `docs/evidence/manifest.md`
- Screenshots: `docs/evidence/screenshots/`
- Demo storyboard: `docs/demo-video-storyboard.md`

## Suggested Demo Video Script

“Here is Bubblewire live on bubblewire.xyz, a unified feed for Twitch, X, and Kick. The source strip shows Twitch and X connected automatically, and Kick connected from an official webhook proof event. Every message carries a source label plus normalized metadata. I’ll filter by source, search the feed, pin the Kick proof, and inspect the raw normalized payload. Now here is the overlay route, designed for OBS or a browser source. The public app is live-only, and demo routes are disabled.”
