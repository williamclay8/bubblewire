import { createInjectedMessage } from "../core/messages.js";

const DEMO_AUTHORS = {
  twitch: ["BubbleOps", "chartlurker", "floorBidder", "candleBoss"],
  x: ["MarketBubble", "Ansem", "riskdesk", "liquiditywatch"],
  kick: ["kickwhale", "greenCandle", "mintedagain", "sidebet"]
};

const DEMO_LINES = [
  ["twitch", "marketbubble", "HYPE just different"],
  ["x", "challenge-watch", "Ansem is cooking again"],
  ["kick", "marketbubble", "thanks for the polymarket picks"],
  ["twitch", "marketbubble", "chat moving faster than the candles"],
  ["x", "creator-signal", "one feed for Twitch X and Kick is the actual unlock"],
  ["kick", "marketbubble", "green room saw that entry first"],
  ["twitch", "marketbubble", "mods need this during every stream"],
  ["x", "market-watch", "source labels make the receipts clean"],
  ["kick", "marketbubble", "clip this UI before it ships"]
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
      detail: "POST Kick chat.message.sent events to /kick.webhook"
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
