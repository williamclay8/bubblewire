# Demo Video Shot List — Final Cut (90s)

Record at 1920×1080 against `https://bubblewire.xyz` in live mode, with #xqc (or any large channel) flowing. Clear `localStorage` first so the boot sequence and full command center appear. Mute nothing — let the alert beep land on camera.

| Time | Shot | Action | Say |
| --- | --- | --- | --- |
| 0:00–0:06 | Boot | Load bubblewire.xyz fresh. Boot sequence types, resolves into the live terminal. | "This is Bubblewire — one real-time feed for Twitch, X, and Kick." |
| 0:06–0:18 | The hook | Hold on the feed. Real xqc chat ripping through, signal stream pulsing above. Hover a row. | "This is real — live Twitch chat from xqc, relayed right now, no login. The receipts are one click away." |
| 0:18–0:26 | Proof | Click a message → raw payload fills the inspector. Point at status pills + '3 live' metric. | "Every message keeps its raw provenance, and every source proves its own state." |
| 0:26–0:36 | Operator moves | Type in search (marks highlight), press `2` for Twitch-only, click an author name to drill down, `Esc`. | "Search highlights, per-source filters, author drill-down — all keyboard-first." |
| 0:36–0:48 | Watchlist | Add a term you know will hit (e.g. "lol" on xqc). Flagged row + toast + beep within seconds. | "Watchlist terms flag matching rows and alert you — even in a background tab." |
| 0:48–0:56 | Spike | Hit Spike (or wait for a real burst). Tape flashes, spike chip, stream accelerates. | "When volume spikes 3× baseline, you see it before you read it." |
| 0:56–1:08 | Overlay | Open /overlay-setup.html. Drag sliders — live preview updates. Copy URL, show it in OBS over gameplay for 3s. | "The overlay drops into OBS with size, fade, alignment, and source filters." |
| 1:08–1:18 | Setup honesty | Press `s`. Drawer shows env status, the live Twitch channel list, copyable Kick webhook URL. Join a second channel live. | "Setup is honest — green means proven, and you can join any public channel at runtime." |
| 1:18–1:26 | Recap + close | Click Recap → card downloads, flash it. End on the feed flowing. | "Bubblewire: the moment, the proof, the broadcast. bubblewire.xyz." |

Recording notes:

- Use the gold theme for the main run; flash a 1s theme flip (matrix) at ~0:35 if pacing allows.
- Keep the cursor deliberate; pause ~400ms after each click so compression keeps UI text sharp.
- If X/Kick aren't live at record time, run `npm run proof` against production first so Kick shows a webhook receipt, and avoid claiming all three are streaming — "Twitch live now; X and Kick armed with receipts" is honest and still strong.
- Upload unlisted, replace the form link, and resubmit (precedent: two prior resubmissions recorded).
