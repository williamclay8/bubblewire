import test from "node:test";
import assert from "node:assert/strict";

import {
  applySafetyRules,
  createProofPacket,
  createReplayBundle,
  createSessionSnapshot
} from "../src/core/session.js";

const snapshot = {
  messages: [
    {
      id: "twitch:3",
      source: "twitch",
      sourceLabel: "Twitch",
      author: { name: "third" },
      content: "can we clip this?",
      receivedAt: "2026-06-07T15:00:12.000Z",
      heat: 55,
      url: "https://www.twitch.tv/xqc"
    },
    {
      id: "kick:2",
      source: "kick",
      sourceLabel: "Kick",
      author: { name: "second" },
      content: "buy spam.example right now",
      receivedAt: "2026-06-07T15:00:08.000Z",
      heat: 12
    },
    {
      id: "x:1",
      source: "x",
      sourceLabel: "X",
      author: { name: "first" },
      content: "market bubble setup is live",
      receivedAt: "2026-06-07T15:00:00.000Z",
      heat: 20
    }
  ],
  stats: {
    totalMessages: 3,
    duplicatesDropped: 1,
    startedAt: "2026-06-07T14:59:00.000Z",
    sources: {
      twitch: { count: 1, lastMessageAt: "2026-06-07T15:00:12.000Z" },
      x: { count: 1, lastMessageAt: "2026-06-07T15:00:00.000Z" },
      kick: { count: 1, lastMessageAt: "2026-06-07T15:00:08.000Z" }
    }
  },
  status: {
    twitch: { state: "connected", detail: "watching 1 channel" },
    x: { state: "reconnecting", detail: "HTTP 402 Payment Required · CreditsDepleted" },
    kick: { state: "webhook-ready", detail: "waiting for webhooks" }
  },
  proof: {
    updatedAt: "2026-06-07T15:00:12.000Z",
    sources: {
      twitch: { label: "Twitch", count: 1, evidenceLevel: "live", rawType: "PRIVMSG", lastMessageAt: "2026-06-07T15:00:12.000Z" },
      x: { label: "X", count: 1, evidenceLevel: "live", rawType: "filtered-stream", lastMessageAt: "2026-06-07T15:00:00.000Z" },
      kick: { label: "Kick", count: 1, evidenceLevel: "webhook-proof", rawType: "chat.message.sent", lastMessageAt: "2026-06-07T15:00:08.000Z" }
    }
  },
  analysis: {
    moments: [{ id: "twitch:3", reason: "hot + charged", at: "2026-06-07T15:00:12.000Z" }],
    questions: [{ id: "twitch:3", text: "can we clip this?" }],
    trends: [{ term: "market", count: 2, crossPlatform: true }]
  },
  runtime: {
    demoEnabled: false,
    demoMode: "off",
    demoRunning: false,
    liveOnly: true,
    watching: 2
  }
};

const setup = {
  demo: { enabled: false },
  history: { enabled: true },
  sources: {
    twitch: { path: "irc-anon", channels: ["xqc"] },
    x: { diagnostics: { summary: "X stream HTTP 402 Payment Required · CreditsDepleted" } },
    kick: { webhookUrl: "https://bubblewire.xyz/kick.webhook" }
  }
};

test("createSessionSnapshot returns a stream-session spine with preflight and usefulness metrics", () => {
  const session = createSessionSnapshot({
    snapshot,
    setup,
    now: () => new Date("2026-06-07T15:01:00.000Z")
  });

  assert.equal(session.kind, "stream-session");
  assert.equal(session.phase, "live");
  assert.equal(session.durationSeconds, 120);
  assert.equal(session.metrics.totalMessages, 3);
  assert.equal(session.metrics.liveSources, 3);
  assert.equal(session.metrics.moments, 1);
  assert.equal(session.preflight.find((item) => item.key === "history").status, "pass");
  assert.equal(session.preflight.find((item) => item.key === "x").detail, "HTTP 402 Payment Required · CreditsDepleted");
});

test("createProofPacket creates a redacted deterministic proof bundle", () => {
  const packet = createProofPacket({
    snapshot,
    setup,
    routes: { app: "https://bubblewire.xyz", judge: "https://bubblewire.xyz/judge" },
    now: () => new Date("2026-06-07T15:01:00.000Z")
  });

  assert.equal(packet.schema, "bubblewire-proof-packet/v1");
  assert.equal(packet.routes.judge, "https://bubblewire.xyz/judge");
  assert.equal(packet.runtime.liveOnly, true);
  assert.equal(packet.sources.kick.evidenceLevel, "webhook-proof");
  assert.equal(packet.recentEventIds.length, 3);
  assert.match(packet.eventHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(packet), /TOKEN|Bearer|secret/i);
});

test("createReplayBundle captures a target moment with surrounding context", () => {
  const bundle = createReplayBundle({
    snapshot,
    momentId: "kick:2",
    windowSeconds: 10,
    now: () => new Date("2026-06-07T15:01:00.000Z")
  });

  assert.equal(bundle.kind, "replay-bundle");
  assert.equal(bundle.target.id, "kick:2");
  assert.deepEqual(bundle.context.map((message) => message.id), ["x:1", "kick:2", "twitch:3"]);
  assert.equal(bundle.summary.sources.join(","), "kick,twitch,x");
});

test("applySafetyRules hides unapproved overlay rows and redacts blocked content", () => {
  const redacted = applySafetyRules(snapshot.messages[1], {
    blockedTerms: ["spam.example"],
    redactLinks: true,
    approvedIds: ["twitch:3"],
    approvedOnly: false
  });
  const hidden = applySafetyRules(snapshot.messages[1], {
    approvedIds: ["twitch:3"],
    approvedOnly: true
  });

  assert.equal(redacted.hidden, false);
  assert.match(redacted.message.content, /\[redacted\]/);
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.reason, "not approved for broadcast");
});
