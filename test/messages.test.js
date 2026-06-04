import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeKickWebhook,
  normalizeTwitchEventSubNotification,
  normalizeTwitchLine,
  normalizeXStreamEvent,
  parseIrcTags
} from "../src/core/messages.js";

test("parseIrcTags decodes Twitch IRC tag escapes", () => {
  const tags = parseIrcTags("@display-name=Market\\sBubble;color=#19ff6b;badges=vip/1");

  assert.deepEqual(tags, {
    "display-name": "Market Bubble",
    color: "#19ff6b",
    badges: "vip/1"
  });
});

test("normalizeTwitchLine maps a PRIVMSG into the unified message contract", () => {
  const line =
    "@badge-info=;badges=broadcaster/1;color=#9146FF;display-name=BubbleOps;emotes=;id=f80a19d6-e35a-4273-82d0-cd87f614e767;room-id=713936733;tmi-sent-ts=1642696567751;user-id=42 :bubbleops!bubbleops@bubbleops.tmi.twitch.tv PRIVMSG #marketbubble :HYPE just different";

  const message = normalizeTwitchLine(line);

  assert.equal(message.id, "twitch:f80a19d6-e35a-4273-82d0-cd87f614e767");
  assert.equal(message.source, "twitch");
  assert.equal(message.sourceLabel, "Twitch");
  assert.equal(message.author.name, "BubbleOps");
  assert.equal(message.author.handle, "bubbleops");
  assert.equal(message.channel, "marketbubble");
  assert.equal(message.content, "HYPE just different");
  assert.equal(message.url, "https://www.twitch.tv/marketbubble");
  assert.equal(message.receivedAt, "2022-01-20T16:36:07.751Z");
  assert.deepEqual(message.badges, ["broadcaster/1"]);
});

test("normalizeTwitchEventSubNotification maps channel.chat.message notifications", () => {
  const payload = {
    subscription: {
      type: "channel.chat.message"
    },
    event: {
      broadcaster_user_login: "marketbubble",
      chatter_user_id: "4145994",
      chatter_user_login: "viewer32",
      chatter_user_name: "Viewer32",
      color: "#9146FF",
      message_id: "cc106a89-1814-919d-454c-f4f2f970aae7",
      message: {
        text: "EventSub chat is live"
      },
      badges: [{ set_id: "vip", id: "1" }],
      message_type: "text"
    }
  };

  const message = normalizeTwitchEventSubNotification(payload);

  assert.equal(message.id, "twitch:cc106a89-1814-919d-454c-f4f2f970aae7");
  assert.equal(message.source, "twitch");
  assert.equal(message.rawType, "channel.chat.message");
  assert.equal(message.author.name, "Viewer32");
  assert.equal(message.author.handle, "viewer32");
  assert.equal(message.channel, "marketbubble");
  assert.equal(message.content, "EventSub chat is live");
  assert.deepEqual(message.badges, ["vip/1"]);
});

test("normalizeKickWebhook maps chat.message.sent webhook payloads", () => {
  const payload = {
    message_id: "unique_message_id_123",
    broadcaster: {
      username: "marketbubble",
      channel_slug: "marketbubble"
    },
    sender: {
      username: "kickwhale",
      channel_slug: "kickwhale",
      is_verified: true,
      profile_picture: "https://example.com/avatar.png",
      identity: {
        username_color: "#53FC18",
        badges: [{ text: "Subscriber", type: "subscriber", count: 3 }]
      }
    },
    content: "thanks for the polymarket picks",
    created_at: "2025-01-14T16:08:06Z"
  };

  const message = normalizeKickWebhook(payload, { "kick-event-type": "chat.message.sent" });

  assert.equal(message.id, "kick:unique_message_id_123");
  assert.equal(message.source, "kick");
  assert.equal(message.sourceLabel, "Kick");
  assert.equal(message.author.name, "kickwhale");
  assert.equal(message.author.verified, true);
  assert.equal(message.channel, "marketbubble");
  assert.equal(message.content, "thanks for the polymarket picks");
  assert.equal(message.receivedAt, "2025-01-14T16:08:06.000Z");
  assert.deepEqual(message.badges, ["Subscriber x3"]);
});

test("normalizeXStreamEvent maps filtered stream payloads with user expansions and rule labels", () => {
  const payload = {
    data: {
      id: "1346889436626259968",
      text: "Ansem is cooking again",
      author_id: "2244994945",
      created_at: "2026-06-04T17:51:25Z",
      public_metrics: {
        like_count: 8,
        reply_count: 2,
        repost_count: 1
      }
    },
    includes: {
      users: [
        {
          id: "2244994945",
          username: "MarketBubble",
          name: "Market Bubble",
          verified: true
        }
      ]
    },
    matching_rules: [{ id: "rule-1", tag: "challenge-watch" }]
  };

  const message = normalizeXStreamEvent(payload);

  assert.equal(message.id, "x:1346889436626259968");
  assert.equal(message.source, "x");
  assert.equal(message.sourceLabel, "X");
  assert.equal(message.author.name, "Market Bubble");
  assert.equal(message.author.handle, "MarketBubble");
  assert.equal(message.author.verified, true);
  assert.equal(message.channel, "challenge-watch");
  assert.equal(message.url, "https://x.com/MarketBubble/status/1346889436626259968");
  assert.deepEqual(message.metrics, { likes: 8, replies: 2, reposts: 1 });
});
