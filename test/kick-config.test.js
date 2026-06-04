import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";

import {
  createKickSubscriptionPayload,
  resolveKickConfig,
  shouldRequireKickSignature,
  verifyKickWebhookSignature
} from "../src/connectors/kick.js";

test("resolveKickConfig stays webhook-only unless auto subscribe is enabled", () => {
  assert.deepEqual(resolveKickConfig({}), { autoSubscribe: false });
});

test("resolveKickConfig requires official Kick subscription credentials when enabled", () => {
  assert.deepEqual(resolveKickConfig({ KICK_AUTO_SUBSCRIBE: "1" }), {
    autoSubscribe: true,
    error: "missing KICK_ACCESS_TOKEN for events subscription"
  });

  assert.deepEqual(resolveKickConfig({
    KICK_AUTO_SUBSCRIBE: "1",
    KICK_ACCESS_TOKEN: "token"
  }), {
    autoSubscribe: true,
    error: "missing KICK_BROADCASTER_USER_ID for events subscription"
  });
});

test("createKickSubscriptionPayload targets chat.message.sent webhooks", () => {
  assert.deepEqual(createKickSubscriptionPayload("123"), {
    broadcaster_user_id: 123,
    events: [
      {
        name: "chat.message.sent",
        version: 1
      }
    ],
    method: "webhook"
  });
});

test("shouldRequireKickSignature is opt-in", () => {
  assert.equal(shouldRequireKickSignature({}), false);
  assert.equal(shouldRequireKickSignature({ KICK_REQUIRE_SIGNATURE: "true" }), true);
});

test("verifyKickWebhookSignature verifies Kick signed payload format", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rawBody = JSON.stringify({ message_id: "message-1", content: "hello" });
  const messageId = "01JTEST";
  const timestamp = "2026-06-04T22:20:04.198Z";
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${messageId}.${timestamp}.${rawBody}`),
    privateKey
  ).toString("base64");

  const result = verifyKickWebhookSignature({
    headers: {
      "Kick-Event-Message-Id": messageId,
      "Kick-Event-Message-Timestamp": timestamp,
      "Kick-Event-Signature": signature
    },
    rawBody,
    publicKey
  });

  assert.deepEqual(result, { ok: true });
});

test("verifyKickWebhookSignature rejects missing or invalid signatures", () => {
  assert.deepEqual(verifyKickWebhookSignature({ rawBody: "{}" }), {
    ok: false,
    reason: "missing Kick signature headers"
  });
});
