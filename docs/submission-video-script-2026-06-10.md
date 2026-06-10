# Bubblewire Resubmission Video Script

Target: 85-95 seconds

Audience: Market Bubble Vibe Code Challenge judges

Core promise: Bubblewire turns fragmented live social signal into one proof-backed command center that each operator can shape into the aggregator they want.

## Narrative Spine

Bubblewire is not just a chat feed. It is a live social command center for the places market culture actually happens: Twitch chat, X filtered-stream posts, Kick webhook events, and X Live broadcast replies. It keeps each source labeled, proves where messages came from, and gives the operator controls to filter, search, pin, watch, export, recap, and broadcast the exact signal they care about.

## 90-Second Shot Script

| Time | Visual | Voiceover |
| --- | --- | --- |
| 0:00-0:08 | Open Bubblewire dashboard on the full command center. | "This is Bubblewire: a live social command center for the places market culture actually happens." |
| 0:08-0:19 | Hold on source-labeled feed rows and proof metrics. | "Instead of four tabs and four kinds of chaos, Bubblewire brings Twitch, X, Kick, and X Live into one labeled stream." |
| 0:19-0:29 | Select a row and show the raw payload/proof panel. | "The label is not cosmetic. Every item keeps its source, author, timestamp, mode, raw payload, and proof state." |
| 0:29-0:38 | Use source filters and search. | "Now it becomes an operator surface. Filter by platform, search the room, and keep the whole audience in context." |
| 0:38-0:45 | Author drill-down. | "Click any author to isolate their signal, then clear back to the full cross-platform flow." |
| 0:45-0:54 | Watchlist and alerts. | "Watchlist terms flag matching rows, raise toasts, and help moderators catch the moments that matter." |
| 0:54-1:03 | Heat, volume, mood/trends, themeable UI. | "The app reads the room too: volume spikes, heat, mood, trends, and questions surface before they scroll away." |
| 1:03-1:13 | Setup drawer and source stack. | "Bubblewire is honest about provider reality: X is filtered posts, Kick is webhook events, and credentials stay server-side." |
| 1:13-1:24 | Overlay setup with live preview controls. | "Then you make it yours: choose sources, themes, watchlists, overlay size, fade, alignment, and filters." |
| 1:24-1:32 | End on dashboard, streamer mode, overlay, and recap close. | "Bubblewire captures the moment, the proof, and the broadcast in one customizable aggregator." |

## Full Voiceover

This is Bubblewire: a live social command center for the places market culture actually happens.

Instead of four tabs and four kinds of chaos, Bubblewire brings Twitch, X, Kick, and X Live into one labeled stream.

The label is not cosmetic. Every item keeps its source, author, timestamp, mode, raw payload, and proof state.

Now it becomes an operator surface. Filter by platform, search the room, and keep the whole audience in context.

Click any author to isolate their signal, then clear back to the full cross-platform flow.

Watchlist terms flag matching rows, raise toasts, and help moderators catch the moments that matter.

The app reads the room too: volume spikes, heat, mood, trends, and questions surface before they scroll away.

Bubblewire is honest about provider reality: X is filtered posts, Kick is webhook events, and credentials stay server-side.

Then you make it yours: choose sources, themes, watchlists, overlay size, fade, alignment, and filters.

Bubblewire captures the moment, the proof, and the broadcast in one customizable aggregator.

## On-Screen Caption Beats

1. Four platforms. One proof-backed feed.
2. Twitch, X, Kick, and X Live in one operator view.
3. The source label is not cosmetic.
4. Search, filter, drill down, pause, pin, export.
5. Watchlists and heat surface moments before they scroll away.
6. Provider reality, not demo theater.
7. Build the aggregator you actually want.
8. Bubblewire: the moment, the proof, the broadcast.

## Producer Notes

- Lead with the aggregator story, not implementation.
- Show cross-platform source buttons early: Twitch, X, Kick, X Live.
- If X API credits are still depleted during capture, do not say X is live at that moment. Say Bubblewire supports X filtered-stream posts and shows provider status honestly.
- Do not call X "live chat"; it is filtered-stream posts. X Live replies ride the shared X filtered stream through a conversation rule.
- Do not call Kick an anonymous stream; it is official `chat.message.sent` webhooks.
- Keep credentials and billing pages out of frame.
- If the external form requires a URL, upload the final MP4 first, then replace the demo link in the form copy.

## Resubmission Form Copy

### Short Description

Bubblewire is a live social command center for streamers and market operators. It brings Twitch chat, X filtered-stream posts, Kick webhook events, and X Live broadcast replies into one source-labeled feed with proof receipts, raw payload provenance, search/filter/pin/watchlist workflows, Streamer Mode, and OBS-ready overlays. Operators can shape it into the aggregator they want: choose sources, rules, themes, watchlists, overlay behavior, and proof views while credentials stay server-side.

### What To Try First

1. Open `https://bubblewire.xyz?judge=1`.
2. Watch the source-labeled feed and provider proof strip.
3. Search, filter by source, click an author, pin a row, and inspect raw provenance.
4. Add a watchlist term and watch matching rows surface.
5. Open `/streamer.html` for the second-screen view.
6. Open `/overlay-setup.html` or `/overlay.html` for OBS/browser-source output.

### Why It Wins

Bubblewire solves the real problem of live social attention: the important signal is scattered across platforms, each with different APIs, limits, and proof surfaces. Bubblewire does not flatten that reality away. It normalizes the feed, preserves source identity, exposes proof, and gives operators interactive controls to build the exact cross-platform command center they need.

## Submission Checklist

- Rendered local narrated draft: `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.mp4`.
- Intended deployed MP4 URL after push/deploy: `https://bubblewire.xyz/assets/bubblewire-submission-voiceover-2026-06-10.mp4`.
- Caption sidecars: `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.srt` and `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.vtt`.
- Render recipe: `docs/evidence/video/bubblewire-submission-voiceover-2026-06-10.manifest.json`.
- Review the MP4, SRT, VTT, and representative frames for secrets.
- Upload the approved final video to the chosen public host.
- Replace the demo video URL in `docs/submission-form-answer.md`, `docs/challenge-submission.md`, `docs/evidence/manifest.md`, and the form.
- Rerun `npm test`, `npm run check`, and browser/live proof commands before claiming updated test or live status.
- If X credits are restored, rerun live proof with `BUBBLEWIRE_EXPECT_SOURCES=twitch,x,kick`; otherwise keep X claims framed as supported/armed, not currently flowing.
- Submit the form only after the new video URL is public and the live app status matches the claims.
