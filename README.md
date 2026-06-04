# Bubblewire

Bubblewire is a submission-grade unified chat relay for the Market Bubble Vibe Code Challenge: Twitch + X + Kick in one real-time feed with source labels.

It runs with no package install, starts demo mode automatically, and upgrades to live provider adapters when server-side credentials or public channel config are present.

## Run

```bash
npm test
npm run check
npm run dev
```

Open `http://localhost:3000`.

Live app: `https://bubblewire.xyz`.

Overlay view: `http://localhost:3000/overlay.html` locally or `https://bubblewire.xyz/overlay.html` live.

Fallback Render URL: `https://bubblewire-challenge.onrender.com`.

Demo video: `https://youtu.be/MGEKOfs4yn0`.

Health check: `http://localhost:3000/healthz`.

## Live Provider Paths

Twitch: EventSub `channel.chat.message` is preferred. Set `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ACCESS_TOKEN`, `TWITCH_BOT_USER_ID`, and `TWITCH_BROADCASTER_USER_ID`. IRC remains available as a fallback: set only `TWITCH_CHANNELS` for anonymous read-only public chat, or add `TWITCH_USERNAME` and `TWITCH_OAUTH_TOKEN` for authenticated IRC.

X: Bubblewire consumes X API v2 filtered stream from the server with `X_BEARER_TOKEN`. Create stream rules in X before starting the app.

Kick: Kick's official read-side chat path is the Events API. It delivers `chat.message.sent` events by webhook. Expose this app with a public tunnel or deployed URL and point Kick to `/kick.webhook`; `/webhooks/kick` is kept for local/backward-compatible ingestion. The endpoint accepts `chat.message.sent` payloads and normalizes them into the shared feed.

To let Bubblewire register the official Kick event subscription at startup, set `KICK_AUTO_SUBSCRIBE=1`, `KICK_ACCESS_TOKEN`, and `KICK_BROADCASTER_USER_ID` with a token that has `events:subscribe`. To reject unsigned webhook calls, set `KICK_REQUIRE_SIGNATURE=1`; unsigned local proof events should keep this off.

Set `DEMO_MODE=off` on Render for a true live-only public feed. When disabled, Bubblewire stops generating demo messages, disables the `Spike` control, and marks missing provider credentials as `missing` instead of pretending they are live.

## Demo Mode

Demo events are clearly marked as `demo`. Provider status pills do not pretend credentials exist: Twitch and X show demo/missing-credential status until live config is present, while Kick shows webhook-ready until the first webhook arrives.

Use `DEMO_MODE=on` locally or for judge-safe demos. Use `DEMO_MODE=off` for production/live-only monitoring.

Useful local controls:

- `Spike` fires a burst across Twitch, X, and Kick labels.
- `Pause` locks the feed and increments unread count.
- `Pin` saves judge-worthy messages in the inspector (persisted across reloads).
- `Export` downloads the normalized feed as NDJSON.
- Selecting a message shows its raw normalized payload.
- Keyboard: `/` focuses search, `p` toggles pause, `Esc` clears search.

## Provider Reality Notes

- Twitch EventSub is the current preferred chat path; anonymous read-only IRC is the no-secret live fallback for public channels.
- X filtered stream is near real-time posts, not livestream chat, and may require paid/API access.
- Kick chat ingestion is official webhook-based `chat.message.sent`; localhost needs ngrok, Cloudflare Tunnel, or similar. No official anonymous/public read-only Kick chat stream was found in current Kick docs.
- Provider tokens stay server-side. The browser receives only normalized events and status.

## Verification

Current local checks:

```bash
npm test
npm run check
npm run proof
npm run proof:live # with DEMO_MODE=off server running
```

The tests cover Twitch IRC, Twitch EventSub, X filtered stream, Kick webhooks, Kick event subscription config, optional Kick signature verification, hub dedupe, source stats, and SSE subscriber behavior.

`npm run proof` writes a local evidence receipt to `docs/evidence/logs/proof.json`, posts a Kick webhook-shaped event, and confirms `/status.json` responds.

`npm run proof:live` writes `docs/evidence/logs/live-proof.json` and confirms `DEMO_MODE=off` rejects synthetic demo/inject routes without creating demo messages. Set `BUBBLEWIRE_EXPECT_SOURCES=twitch,x,kick` against the deployed app to prove all three live source paths are present with source-labeled messages.

## Deployment

The repo includes `render.yaml` and `Procfile`.

For Render Blueprint deploys, `render.yaml` sets `HOST=0.0.0.0`, `NODE_VERSION=22`, `npm start`, and `/healthz` as the health check. Keep provider credentials in Render environment variables only.

If deploying elsewhere, set:

```bash
HOST=0.0.0.0
PORT=<provider port>
npm start
```

## Submission Packet

- Evidence manifest: `docs/evidence/manifest.md`
- Submission form copy: `docs/submission-form-answer.md`
- Demo notes: `docs/challenge-submission.md`
- Initial challenge entry: June 4, 2026 at 2:42 PM CDT
- Custom-domain resubmission: pending
