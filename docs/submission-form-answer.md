# Bubblewire Submission Form Copy

## Project Name

Bubblewire

## Repository

https://github.com/williamclay8/bubblewire

## Live App

https://bubblewire-challenge.onrender.com

Verified Render deploy: `dep-d8gvp099rddc73eqmap0`

## Submitted X Handle

@williamclay

## Demo Video

https://youtu.be/gvXG5qOaBTQ

## Overlay

https://bubblewire-challenge.onrender.com/overlay.html

## Short Description

Bubblewire is a unified real-time operator feed for Twitch + X + Kick. It merges all three sources into one fast dashboard with unmistakable source labels, per-provider health, demo-safe events, raw payload provenance, and an OBS/browser-source overlay.

## What To Try First

1. Open the app.
2. Click `Spike` to fire Twitch, X, and Kick demo events.
3. Filter by source, pause the feed, pin a message, and select a message to inspect its normalized payload.
4. Open `/overlay.html` to see the stream-ready view.

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

- `npm test`: 16/16 passing
- `npm run check`: passing
- `npm run proof`: passing
- Live smoke: `/healthz`, `/status.json`, `/events.stream`, `/demo-spike.json`, `/demo-start.json`, `/inject.json`, `/export.ndjson`, `/kick.webhook`, and `/overlay.html` passing
- Public live proof: `twitch,x,kick` expected sources passed; Twitch and X connected automatically, Kick connected after webhook proof
- YouTube demo: uploaded and unlisted at `https://youtu.be/gvXG5qOaBTQ`
- Challenge form: submitted; Google Forms confirmation said "Your response has been recorded."
- Evidence manifest: `docs/evidence/manifest.md`
- Screenshots: `docs/evidence/screenshots/`
- Demo storyboard: `docs/demo-video-storyboard.md`

## Suggested Demo Video Script

“Here is Bubblewire, a unified feed for Twitch, X, and Kick. The source strip shows provider state, and every message carries a source label plus normalized metadata. I’ll click Spike to simulate all three platforms, filter to Twitch, pin a message, and inspect the raw normalized payload. Now here is the overlay route, designed for OBS or a browser source. The app is demo-safe without secrets, but the server has live adapter paths for Twitch EventSub, X filtered stream, and official Kick Events API webhooks.”
