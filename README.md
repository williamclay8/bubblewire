# Bubblewire

Bubblewire is a submission-grade unified chat relay for the Market Bubble Vibe Code Challenge: Twitch + X + Kick in one real-time feed with source labels.

It runs with no package install, starts demo mode automatically, and upgrades to live provider adapters when server-side credentials are present.

## Run

```bash
npm test
npm run check
npm run dev
```

Open `http://localhost:3000`.

Live app: `https://bubblewire-challenge.onrender.com`.

Overlay view: `http://localhost:3000/overlay.html` locally or `https://bubblewire-challenge.onrender.com/overlay.html` live.

Demo video: `https://youtu.be/gvXG5qOaBTQ`.

Health check: `http://localhost:3000/healthz`.

## Live Provider Paths

Twitch: EventSub `channel.chat.message` is preferred. Set `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ACCESS_TOKEN`, `TWITCH_BOT_USER_ID`, and `TWITCH_BROADCASTER_USER_ID`. IRC remains available as a fallback with `TWITCH_USERNAME`, `TWITCH_OAUTH_TOKEN`, and `TWITCH_CHANNELS`.

X: Bubblewire consumes X API v2 filtered stream from the server with `X_BEARER_TOKEN`. Create stream rules in X before starting the app.

Kick: Kick sends real-time chat through webhooks. Expose this app with a public tunnel and point Kick to `KICK_WEBHOOK_PUBLIC_URL/kick.webhook`. The server also keeps `/webhooks/kick` for local/backward-compatible ingestion. The endpoint accepts `chat.message.sent` payloads and normalizes them into the shared feed.

## Demo Mode

Demo events are clearly marked as `demo`. Provider status pills do not pretend credentials exist: Twitch and X show demo/missing-credential status until live env vars are present, while Kick shows webhook-ready until the first webhook arrives.

Useful local controls:

- `Spike` fires a burst across Twitch, X, and Kick labels.
- `Pause` locks the feed and increments unread count.
- `Pin` saves judge-worthy messages in the inspector.
- `Export` downloads the normalized feed as NDJSON.
- Selecting a message shows its raw normalized payload.

## Provider Reality Notes

- Twitch EventSub is the current preferred chat path; IRC is legacy-compatible fallback.
- X filtered stream is near real-time posts, not livestream chat, and may require paid/API access.
- Kick chat ingestion is webhook-based; localhost needs ngrok, Cloudflare Tunnel, or similar.
- Provider tokens stay server-side. The browser receives only normalized events and status.

## Verification

Current local checks:

```bash
npm test
npm run check
npm run proof
```

The tests cover Twitch IRC, Twitch EventSub, X filtered stream, Kick webhooks, hub dedupe, source stats, and SSE subscriber behavior.

`npm run proof` writes a local evidence receipt to `docs/evidence/logs/proof.json`, posts a Kick webhook-shaped event, and confirms `/status.json` responds.

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
- Submitted challenge entry: June 4, 2026 at 2:42 PM CDT
