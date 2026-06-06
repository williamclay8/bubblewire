import { createInjectedMessage } from "../core/messages.js";

const DEMO_AUTHORS = {
  twitch: ["BubbleOps", "chartlurker", "floorBidder", "candleBoss"],
  x: ["MarketBubble", "Ansem", "riskdesk", "liquiditywatch"],
  kick: ["kickwhale", "greenCandle", "mintedagain", "sidebet"]
};

// Varied enough — positive, negative, questions, repeated trend terms ($HYPE,
// polymarket) across all three sources — that the intelligence layer (mood,
// moments, trends, questions) has real signal to surface in demo mode.
const DEMO_LINES = [
  ["twitch", "marketbubble", "HYPE just different, this run is insane PogChamp"],
  ["x", "challenge-watch", "Ansem is cooking again, $HYPE looking cracked"],
  ["kick", "marketbubble", "thanks for the polymarket picks, absolute W"],
  ["twitch", "marketbubble", "chat moving faster than the candles LETSGO"],
  ["x", "creator-signal", "one feed for Twitch X and Kick is the actual unlock"],
  ["kick", "marketbubble", "wait how do I add my own channel?"],
  ["twitch", "marketbubble", "this entry is so clean, mods need this every stream"],
  ["x", "market-watch", "source labels make the receipts clean, love it"],
  ["kick", "marketbubble", "is the polymarket line still live or did it move?"],
  ["twitch", "marketbubble", "nah that last call was trash, total L ngl"],
  ["x", "market-watch", "$HYPE dumping now, this is painful copium"],
  ["kick", "marketbubble", "why is everyone selling $HYPE so fast"],
  ["twitch", "marketbubble", "GG that was clutch, clip it before it ships"],
  ["x", "creator-signal", "polymarket odds flipped, Ansem called it first"],
  ["kick", "marketbubble", "green room saw that entry first, goated"],
  ["twitch", "marketbubble", "what channel should we raid after this?"],
  ["x", "challenge-watch", "the X filtered stream catching every $HYPE mention is wild"],
  ["kick", "marketbubble", "this UI is actually beautiful, respect"]
];

export function createDemoConnector(hub, options = {}) {
  let timer = null;
  let index = 0;
  const intervalMs = options.intervalMs || 1300;

  function start() {
    if (timer) return;
    hub.setSourceStatus("twitch", {
      state: "demo",
      detail: "demo feed active; set Twitch EventSub env vars for live chat"
    });
    hub.setSourceStatus("x", {
      state: "demo",
      detail: "demo feed active; set X_BEARER_TOKEN for filtered stream"
    });
    hub.setSourceStatus("kick", {
      state: "webhook-ready",
      detail: "waiting for chat.message.sent webhooks"
    });
    timer = setInterval(pushNext, intervalMs);
    pushSpike(5);
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function pushNext() {
    const [source, channel, content] = DEMO_LINES[index % DEMO_LINES.length];
    const authors = DEMO_AUTHORS[source];
    const author = authors[index % authors.length];
    index += 1;
    hub.addMessage(
      createInjectedMessage({
        source,
        channel,
        author,
        content
      })
    );
  }

  function pushSpike(count = 12) {
    for (let i = 0; i < count; i += 1) {
      setTimeout(pushNext, i * 120);
    }
  }

  return {
    start,
    stop,
    pushSpike,
    isRunning: () => Boolean(timer)
  };
}
