---
name: bubblewire
description: Use when working on Bubblewire, the unified real-time chat relay for Twitch + X + Kick. Handles architecture, testing, evidence generation, provider integration, and frontend maintenance.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [chat, relay, twitch, x, kick, sse, realtime, demo-mode]
    related_skills: [single-file-webapp-editing, systematic-debugging, test-driven-development]
---

# Bubblewire

Bubblewire is a zero-dependency Node.js unified chat relay that normalizes messages from Twitch, X, and Kick into a single real-time feed with source labels. It was built for the Market Bubble Vibe Code Challenge.

## When to Use

- Adding or debugging a provider adapter (Twitch EventSub/IRC, X filtered stream, Kick webhooks)
- Running or extending the test + evidence suite
- Working on the trading-terminal frontend (`public/`)
- Regenerating submission evidence or proof receipts
- Understanding the SSE hub, message normalization, or demo mode behavior

**Don't use for:**
- General web development unrelated to multi-source chat relays
- Projects that require persistent storage or user accounts

## Project Structure

```
Bubblewire/
|-- src/
|   |-- server.js          # Node HTTP + SSE hub, static serving, healthz
|   |-- core/
|   |   |-- hub.js         # Message deduplication, bounded buffer, broadcasting
|   |   `-- messages.js    # Normalization, hashing, content safety
|   `-- connectors/        # Twitch, X, Kick adapters (when live)
|-- public/                # Vanilla trading-terminal frontend (index.html, app.js, styles.css)
|-- test/                  # 19 tests covering history, providers, live-only mode, and SSE behavior
|-- docs/evidence/         # Screenshots, logs, manifests, submission materials
|-- scripts/               # Evidence regeneration and utility scripts
|-- package.json
|-- render.yaml
`-- SKILL.md
```

## Key Commands

```bash
npm test                 # Run the test suite
npm run check            # Type/lint check (currently clean)
npm run dev              # Start with DEMO_MODE=on
npm run proof            # Generate local evidence receipt
npm run proof:live       # Verify live-only behavior (requires DEMO_MODE=off)
```

Health check: `http://localhost:3000/healthz`

Overlay view: `http://localhost:3000/overlay.html`

## Provider Notes

- **Twitch**: EventSub (`channel.chat.message`) preferred. IRC fallback available.
- **X**: Filtered stream (posts, not live chat). Requires `X_BEARER_TOKEN` and stream rules.
- **Kick**: Official webhook (`chat.message.sent`). Needs public URL + optional signature verification.

Demo mode is controlled by `DEMO_MODE=on|off`. When off, missing credentials are marked honestly instead of generating synthetic data.

## Evidence & Verification

The project has a strong proof system:

- `npm run proof` writes `docs/evidence/logs/proof.json`
- `npm run proof:live` writes `docs/evidence/logs/live-proof.json` and confirms no demo routes are active
- Use `BUBBLEWIRE_EXPECT_SOURCES=twitch,x,kick` against a deployed instance to verify all three sources appear with correct labels.

Always run `npm test && npm run check` before committing evidence changes.

## Frontend Architecture

The UI is a self-contained vanilla trading terminal:
- Single delegated click listener
- Prepend with scroll compensation (no jump when reading mid-feed)
- LocalStorage-backed pins (capped)
- Source-colored radar + sparklines
- Toast system for all actions
- Fully CSP-compliant (with `style-src 'unsafe-inline'` for source colors)

When editing `public/app.js` or `styles.css`, prefer in-place DOM updates over full re-renders.

## Common Pitfalls

1. **Forgetting `DEMO_MODE=off`** on production deploys - the app will keep generating synthetic messages.
2. **Running tests with live credentials present** - some tests expect demo behavior.
3. **Editing the feed rendering without scroll compensation** - new messages will yank the user's reading position.
4. **Assuming X delivers live chat** - it delivers filtered posts. Document this clearly for users.

## Verification Checklist

- [ ] `npm test` passes (currently 19/19)
- [ ] `npm run check` is clean
- [ ] `npm run proof` completes without errors
- [ ] No console errors in browser at 1440×900 and 390×844
- [ ] Overlay view remains OBS-transparent
- [ ] All three sources appear with correct labels when live credentials are configured
