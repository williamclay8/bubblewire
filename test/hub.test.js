import test from "node:test";
import assert from "node:assert/strict";

import { createFeedHub } from "../src/core/hub.js";

test("createFeedHub stores each message once and updates source stats", () => {
  const hub = createFeedHub({ maxMessages: 3 });
  const twitchMessage = {
    id: "twitch:1",
    source: "twitch",
    sourceLabel: "Twitch",
    content: "first",
    receivedAt: "2026-06-04T17:00:00.000Z"
  };

  assert.equal(hub.addMessage(twitchMessage), true);
  assert.equal(hub.addMessage(twitchMessage), false);
  assert.equal(hub.addMessage({ ...twitchMessage, id: "x:1", source: "x", sourceLabel: "X" }), true);
  assert.equal(hub.addMessage({ ...twitchMessage, id: "kick:1", source: "kick", sourceLabel: "Kick" }), true);
  assert.equal(hub.addMessage({ ...twitchMessage, id: "kick:2", source: "kick", sourceLabel: "Kick" }), true);

  const snapshot = hub.snapshot();

  assert.equal(snapshot.messages.length, 3);
  assert.deepEqual(
    snapshot.messages.map((message) => message.id),
    ["kick:2", "kick:1", "x:1"]
  );
  assert.equal(snapshot.stats.totalMessages, 4);
  assert.equal(snapshot.stats.sources.twitch.count, 1);
  assert.equal(snapshot.stats.sources.x.count, 1);
  assert.equal(snapshot.stats.sources.kick.count, 2);
});

test("createFeedHub broadcasts messages and status updates to subscribers", () => {
  const hub = createFeedHub();
  const events = [];
  const unsubscribe = hub.subscribe((event) => events.push(event));

  hub.setSourceStatus("x", {
    state: "connected",
    detail: "stream online"
  });
  hub.addMessage({
    id: "x:2",
    source: "x",
    sourceLabel: "X",
    content: "live post",
    receivedAt: "2026-06-04T17:01:00.000Z"
  });
  unsubscribe();
  hub.addMessage({
    id: "x:3",
    source: "x",
    sourceLabel: "X",
    content: "after unsubscribe",
    receivedAt: "2026-06-04T17:02:00.000Z"
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].type, "status");
  assert.equal(events[0].status.x.state, "connected");
  assert.equal(events[1].type, "message");
  assert.equal(events[1].message.id, "x:2");
});
