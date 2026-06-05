import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveXRulesFromEnv,
  startXConnector,
  summarizeXRules,
  summarizeXStreamFailure
} from "../src/connectors/x.js";

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

test("summarizeXStreamFailure captures X problem details without leaking tokens", async () => {
  const response = new Response(
    JSON.stringify({
      title: "TooManyConnections",
      type: "https://api.x.com/2/problems/streaming-connection",
      detail: "Authorization: Bearer SECRET_TOKEN is already connected"
    }),
    {
      status: 429,
      statusText: "Too Many Requests",
      headers: {
        "x-rate-limit-limit": "50",
        "x-rate-limit-remaining": "0",
        "x-rate-limit-reset": "1780630000"
      }
    }
  );

  const diagnostic = await summarizeXStreamFailure(response, {
    bearerToken: "SECRET_TOKEN",
    phase: "stream"
  });
  const serialized = JSON.stringify(diagnostic);

  assert.equal(diagnostic.httpStatus, 429);
  assert.equal(diagnostic.statusText, "Too Many Requests");
  assert.equal(diagnostic.problemTitle, "TooManyConnections");
  assert.equal(diagnostic.problemType, "https://api.x.com/2/problems/streaming-connection");
  assert.equal(diagnostic.rateLimit.remaining, "0");
  assert.match(diagnostic.summary, /X stream HTTP 429/);
  assert.match(diagnostic.summary, /TooManyConnections/);
  assert.doesNotMatch(serialized, /SECRET_TOKEN/);
  assert.doesNotMatch(serialized, /Authorization: Bearer/i);
});

test("startXConnector reports redacted stream diagnostics in status and logs", async (t) => {
  const statuses = [];
  const logs = [];
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith("/rules")) {
      return new Response(JSON.stringify({ data: [{ id: "1", tag: "live", value: "Bubblewire" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({
        title: "TooManyConnections",
        type: "https://api.x.com/2/problems/streaming-connection",
        detail: "Bearer SECRET_TOKEN already owns a stream"
      }),
      {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "x-rate-limit-remaining": "0" }
      }
    );
  };
  console.warn = (...args) => logs.push(args.map((arg) => String(arg)).join(" "));

  const connector = startXConnector(
    {
      setSourceStatus(source, status) {
        statuses.push({ source, status });
      },
      addMessage() {}
    },
    { X_BEARER_TOKEN: "SECRET_TOKEN" }
  );

  t.after(() => {
    connector.stop();
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  await waitFor(() => statuses.some((entry) => entry.status.state === "reconnecting"));
  const errorStatus = statuses.find((entry) => entry.status.state === "error")?.status;
  const reconnectingStatus = statuses.find((entry) => entry.status.state === "reconnecting")?.status;
  const serialized = JSON.stringify({ statuses, logs });

  assert.equal(errorStatus?.diagnostics?.httpStatus, 429);
  assert.equal(errorStatus?.diagnostics?.problemTitle, "TooManyConnections");
  assert.match(errorStatus.detail, /X stream HTTP 429/);
  assert.match(reconnectingStatus.detail, /last X stream HTTP 429/);
  assert.equal(reconnectingStatus.diagnostics.httpStatus, 429);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /bubblewire:x/);
  assert.match(logs[0], /TooManyConnections/);
  assert.doesNotMatch(serialized, /SECRET_TOKEN/);
  assert.doesNotMatch(serialized, /Bearer SECRET_TOKEN/);
});

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition was not met");
}
