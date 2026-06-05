import assert from "node:assert/strict";
import test from "node:test";

import { resolveXRulesFromEnv, summarizeXRules } from "../src/connectors/x.js";

test("resolveXRulesFromEnv parses local X rule snapshots for setup visibility", () => {
  const snapshot = resolveXRulesFromEnv({
    X_STREAM_RULES: "challenge: from:MarketBubble bubblewire; markets: polymarket OR kalshi"
  });

  assert.equal(snapshot.status, "configured");
  assert.equal(snapshot.count, 2);
  assert.deepEqual(snapshot.rules, [
    { id: "", tag: "challenge", value: "from:MarketBubble bubblewire" },
    { id: "", tag: "markets", value: "polymarket OR kalshi" }
  ]);
});

test("summarizeXRules sanitizes X API rule payloads", () => {
  const snapshot = summarizeXRules(
    {
      data: [
        { id: "178", tag: "challenge-watch", value: "from:MarketBubble (bubblewire OR vibe)" },
        { id: "179", tag: "", value: "kick twitch x" }
      ]
    },
    { checkedAt: "2026-06-04T19:00:00.000Z" }
  );

  assert.deepEqual(snapshot, {
    status: "fetched",
    count: 2,
    checkedAt: "2026-06-04T19:00:00.000Z",
    rules: [
      { id: "178", tag: "challenge-watch", value: "from:MarketBubble (bubblewire OR vibe)" },
      { id: "179", tag: "rule-2", value: "kick twitch x" }
    ]
  });
});
