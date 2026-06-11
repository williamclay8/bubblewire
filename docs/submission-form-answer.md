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

https://youtu.be/I9C0VDrWddA

Final Market Bubble YouTube upload: `https://youtu.be/I9C0VDrWddA`

Final local video: `docs/evidence/video/bubblewire-market-bubble-final-2026-06-11.mp4`

Final local captions: `docs/evidence/video/bubblewire-market-bubble-final-2026-06-11.srt` and `docs/evidence/video/bubblewire-market-bubble-final-2026-06-11.vtt`

Hosted MP4 mirror: `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`

Previous public YouTube upload: `https://youtu.be/kwUZgMBtK48`.

Resubmission script and local narrated draft manifest: `docs/submission-video-script-2026-06-10.md` and `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.manifest.json`. The public MP4 mirror is `https://bubblewire.xyz/assets/bubblewire-submission-voiceover-2026-06-10.mp4`.

## Latest Resubmission Receipt

Google Forms recorded the final Market Bubble submission on 2026-06-11 at 17:18 CDT with:

- X handle: `@williamclay`
- Demo video: `https://youtu.be/I9C0VDrWddA`
- GitHub repo: `https://github.com/williamclay8/bubblewire`
- Live app note: `https://bubblewire.xyz`
- Google Forms confirmation: "Your response has been recorded."

## Overlay

https://bubblewire.xyz/overlay.html

## Short Description

Bubblewire is a live social command center for streamers and market operators. It brings Twitch chat, YouTube live comments, X filtered-stream posts, Kick webhook events, and X Live broadcast replies into one source-labeled feed with proof receipts, raw payload provenance, search/filter/pin/watchlist workflows, Streamer Mode, and OBS-ready overlays. Operators can shape it into the aggregator they want: choose sources, rules, themes, watchlists, overlay behavior, and proof views while credentials stay server-side.

## What To Try First

1. Open `https://bubblewire.xyz?judge=1`.
2. Watch the source-labeled feed and provider proof strip.
3. Search, filter by source, click an author, pin a row, and inspect raw provenance.
4. Add a watchlist term and watch matching rows surface.
5. Open `/streamer.html` for the second-screen view.
6. Open `/overlay-setup.html` or `/overlay.html` for OBS/browser-source output.

## Why It Wins

- It is not just a scrolling feed; it is a customizable command surface for fragmented live social signal.
- It puts Twitch, YouTube, X, Kick, and X Live into one operator view without erasing each platform's source identity.
- It is honest about provider reality: Twitch is EventSub/IRC, X is filtered-stream posts, X Live replies ride an X conversation rule, and Kick is webhook-based.
- It gives judges and operators proof, not vibes: per-source status, evidence levels, raw payload inspection, proof packets, live-only route behavior, and server-side credentials.
- It is interactive enough to become the aggregator each operator wants: source filters, search, author drill-down, pause, pins, watchlists, themes, deep links, recaps, Streamer Mode, and configurable OBS overlays.

## Live Adapter Notes

Twitch uses EventSub `channel.chat.message` when `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ACCESS_TOKEN`, `TWITCH_BOT_USER_ID`, and `TWITCH_BROADCASTER_USER_ID` are present. For no-secret live monitoring, `TWITCH_CHANNELS` alone enables anonymous read-only IRC for public Twitch channels; authenticated IRC remains available with `TWITCH_USERNAME` and `TWITCH_OAUTH_TOKEN`.

X uses API v2 filtered stream from the server with `X_BEARER_TOKEN`; X Live broadcast replies use a `conversation_id:<post id>` rule on that same shared stream. If X API credits are depleted, Bubblewire reports the blocked provider state honestly instead of pretending posts are flowing.

Kick accepts official Events API `chat.message.sent` webhooks at `/webhooks/kick` and `/kick.webhook`; a public tunnel or deployed URL is required for real Kick chat. Bubblewire can also register the official Kick event subscription at startup when `KICK_AUTO_SUBSCRIBE=1`, `KICK_ACCESS_TOKEN`, and `KICK_BROADCASTER_USER_ID` are set, and can require Kick signature verification with `KICK_REQUIRE_SIGNATURE=1`.

## Proof Checklist

- `npm test`: current active-branch suite passed locally with 94/94 tests on 2026-06-11.
- `npm run check`: passing
- `npm run proof`: passing
- Live smoke on `https://bubblewire.xyz`: `/healthz`, `/status.json`, `/events.stream`, `/export.ndjson`, `/kick.webhook`, and `/overlay.html` should return expected public-safe responses; `/demo-spike.json`, `/demo-start.json`, and `/inject.json` should reject in live-only production.
- Public live proof on `https://bubblewire.xyz`: passed on 2026-06-09 with expected sources `twitch,x,kick`; live X status was `connected` with the `marketbubble-live` filtered-stream rule.
- YouTube demo: uploaded unlisted at `https://youtu.be/I9C0VDrWddA`
- Hosted MP4 mirror: `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`
- Challenge form: final Market Bubble submission recorded by Google Forms on 2026-06-11 at 17:18 CDT.
- Evidence manifest: `docs/evidence/manifest.md`
- Screenshots: `docs/evidence/screenshots/`
- Demo storyboard: `docs/demo-video-storyboard.md`

## Suggested Demo Video Script

“This is Bubblewire: a live social command center for the places market culture actually happens. Instead of five tabs and five kinds of chaos, Bubblewire brings Twitch, YouTube, X, Kick, and X Live into one labeled stream. The label is not cosmetic: every item keeps its source, author, timestamp, mode, raw payload, and proof state. I can filter by platform, search the room, drill into an author, pin the signal, and add watchlist alerts. Streamer Mode turns the feed into a glanceable second screen, and the overlay configurator gives me an OBS-ready URL with source filters, scale, fade, and alignment. Bubblewire captures the moment, the proof, and the broadcast in one customizable aggregator.”
