# Bubblewire Challenge Submission Notes

## What It Builds

Bubblewire is a live social command center that merges Twitch chat, YouTube live comments, X filtered-stream posts, Kick webhook events, and X Live broadcast replies into one source-labeled operator feed. It combines per-provider status, source filtering, priority filtering, pinned messages, watchlists, raw payload inspection, Streamer Mode, replay/proof surfaces, and OBS-friendly overlay routes.

GitHub repository: `https://github.com/williamclay8/bubblewire`
Public app: `https://bubblewire.xyz`
Public overlay: `https://bubblewire.xyz/overlay.html`
Fallback Render URL: `https://bubblewire-challenge.onrender.com`
Demo video: `https://youtu.be/I9C0VDrWddA`
Hosted MP4 mirror: `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`

## Why It Should Win

- It solves the real live-social problem: the important signal is split across platforms, but operators need one place to watch, filter, prove, and broadcast it.
- It is honest about platform reality: Twitch is EventSub/IRC, X is filtered-stream posts, X Live replies ride an X conversation rule, and Kick is webhook-based.
- It is judgeable with no secrets: demo mode is labeled locally, production rejects synthetic demo routes, and provider credentials stay server-side.
- It is live-capable and proof-backed: adapter paths normalize real payloads, expose evidence levels, and preserve raw provenance.
- It is an operator surface, not just a list: source filters, search, author drill-down, pause/unread, pinning, watchlists, recaps, Streamer Mode, overlay configuration, and raw provenance are first-class.

## Demo Script

Full resubmission script: `docs/submission-video-script-2026-06-10.md`

1. Open `https://bubblewire.xyz?judge=1` and frame Bubblewire as one command center for Twitch, X, Kick, and X Live.
2. Show source-labeled feed rows, source filters, and proof metrics. If X credits are still depleted, describe X as a configured filtered-stream path that reports its blocked state honestly.
3. Select a row and show normalized raw payload provenance.
4. Search, filter by source, click an author, pause, pin, and add a watchlist term.
5. Show heat/volume/intelligence surfaces: moments, trends, questions, and per-source signal.
6. Open `/streamer.html` for the second-screen operator view.
7. Open `/overlay-setup.html` and show max messages, fade, scale, alignment, and source filters in the transparent preview.
8. Close on the feed/overlay: "Bubblewire captures the moment, the proof, and the broadcast in one customizable aggregator."

## Video Asset

Current public YouTube demo: `https://youtu.be/I9C0VDrWddA`

Historical final-cut demo: `https://youtu.be/hLerxCevS2w`

Hosted MP4 mirror: `https://bubblewire.xyz/assets/bubblewire-final-cut-2026-06-05.mp4`

Local final-cut source: `docs/evidence/video/bubblewire-final-cut-2026-06-05.mp4`

The refreshed final cut was recorded from `https://bubblewire.xyz` on 2026-06-05 at 1920 x 1080. It shows the live source-labeled feed, raw provenance inspector, search/source filtering, author drill-down, watchlist alerts, volume/theme controls, honest setup state, OBS overlay configurator, and recap close.

Next resubmission draft manifest: `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.manifest.json`. The new narrated cut has been uploaded publicly to YouTube at `https://youtu.be/kwUZgMBtK48`.

Deployed MP4 mirror: `https://bubblewire.xyz/assets/bubblewire-submission-voiceover-2026-06-10.mp4`.

Final Market Bubble cut: `https://youtu.be/I9C0VDrWddA`. Local source: `docs/evidence/video/bubblewire-market-bubble-final-2026-06-11.mp4`, rendered at 1920 x 1080, H.264/AAC, 74.11s duration, with caption sidecars. It was captured from `https://bubblewire.xyz` during the Market Bubble stream and shows Twitch `@fazebanks`, YouTube `@notthreadguy`, X filtered-stream posts, X Live rule `1yKAPPvoZmqxb`, Streamer Mode, and OBS overlay surfaces without setup secrets.

## Deployment Handoff

The project is deployed on Render as `bubblewire-challenge` (`srv-d8gsprmq1p3s73cfatig`). Verify:

```bash
curl -sS https://bubblewire.xyz/healthz
curl -sS https://bubblewire.xyz/status.json
```

`/events.stream`, `/demo-spike.json`, `/export.ndjson`, and `/overlay.html` are the public-safe live routes used by the browser UI.

Historical verified app-code Render deploy at YouTube resubmission time: `dep-d8hemdjrjlhs7384o2kg` for pushed commit `fef9b96`.

Current verified app-code Render deploy for the final Market Bubble submission: `dep-d8livo6k1jcs73al2acg` for pushed commit `6d03d94` (Render status `live`, 2026-06-11).

Live smoke passed on 2026-06-04 for `https://bubblewire.xyz` routes: `/healthz`, `/status.json`, `/events.stream`, `/demo-spike.json`, `/demo-start.json`, `/inject.json`, `/export.ndjson`, `/kick.webhook`, and `/overlay.html`.

Current public live proof passed on 2026-06-09 against `https://bubblewire.xyz` with expected sources `twitch,x,kick`: Twitch was `connected`, X was `connected` with the `marketbubble-live` filtered-stream rule, and Kick accepted a live webhook-shaped proof event. If X credits become depleted again, keep X claims framed as configured/blocked rather than currently flowing.

Initial challenge form submission was recorded by Google Forms on 2026-06-04 at 14:42 CDT. Custom-domain resubmission was recorded by Google Forms on 2026-06-04 at 18:17 CDT with demo video `https://youtu.be/MGEKOfs4yn0`, live app `https://bubblewire.xyz`, and pushed commit `49145a8`. Final-cut hosted-MP4 resubmission was recorded on 2026-06-05. YouTube final-cut resubmission was recorded by Google Forms on 2026-06-06 at 09:46 CDT with demo video `https://youtu.be/hLerxCevS2w`. Refreshed public-video resubmission was recorded by Google Forms on 2026-06-09 at 20:37 CDT with demo video `https://youtu.be/kwUZgMBtK48`, X handle `@williamclay`, GitHub repo `https://github.com/williamclay8/bubblewire`, and live app note `https://bubblewire.xyz`. Final Market Bubble submission was recorded by Google Forms on 2026-06-11 at 17:18 CDT with demo video `https://youtu.be/I9C0VDrWddA`, X handle `@williamclay`, GitHub repo `https://github.com/williamclay8/bubblewire`, and live app note `https://bubblewire.xyz`.

## Live Integration Matrix

| Source | Live Path | Local Demo State | Required Env Names |
| --- | --- | --- | --- |
| Twitch | EventSub `channel.chat.message`; anonymous read-only IRC fallback; authenticated IRC fallback | Demo until Twitch config exists | `TWITCH_CHANNELS`; optional `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ACCESS_TOKEN`, `TWITCH_BOT_USER_ID`, `TWITCH_BROADCASTER_USER_ID`, `TWITCH_USERNAME`, `TWITCH_OAUTH_TOKEN` |
| YouTube | Live chat polling for configured channel/video handles | Waiting until the target live chat is active and API key/quota is available | `YOUTUBE_API_KEY`; optional `YOUTUBE_CHANNEL_HANDLE`, `YOUTUBE_LIVE_VIDEO_ID`, `YOUTUBE_LIVE_CHAT_ID` |
| X | X API v2 filtered stream for posts; X Live replies via `conversation_id:<post id>` on the shared stream | Demo until bearer token exists | `X_BEARER_TOKEN`; optional `X_LIVE_BROADCAST_ID` |
| Kick | Official Events API `chat.message.sent` webhook to `/webhooks/kick` or `/kick.webhook`; optional startup subscription; optional signature verification | Webhook-ready until payload arrives | `KICK_WEBHOOK_PUBLIC_URL`; optional `KICK_AUTO_SUBSCRIBE`, `KICK_ACCESS_TOKEN`, `KICK_BROADCASTER_USER_ID`, `KICK_REQUIRE_SIGNATURE` |

## Source Checks

- Twitch docs: EventSub subscription type `channel.chat.message` and Chat & Chatbots page identify EventSub/API as the preferred chat path.
- X docs: Filtered Stream provides near real-time posts over `GET /2/tweets/search/stream`.
- Kick docs: Events API supports webhooks including `chat.message.sent`; subscribing requires `events:subscribe`, and localhost needs a public tunnel.

## Lumi Hygiene

Current app release commit `6d03d94` is pushed to `main`, Render deploy `dep-d8livo6k1jcs73al2acg` is live, `https://bubblewire.xyz` is verified, and the final YouTube submission is published unlisted at `https://youtu.be/I9C0VDrWddA`. Google Forms recorded the final Market Bubble submission on 2026-06-11 at 17:18 CDT. The final video assets are still local until this packet commit is pushed.
