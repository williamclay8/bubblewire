import { verify } from "node:crypto";

const KICK_EVENTS_URL = "https://api.kick.com/public/v1/events/subscriptions";
const KICK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

export function startKickConnector(hub, env = process.env) {
  const config = resolveKickConfig(env);

  if (!config.autoSubscribe) {
    hub.setSourceStatus("kick", {
      state: "webhook-ready",
      detail: "waiting for chat.message.sent webhooks"
    });
    return { stop() {} };
  }

  if (config.error) {
    hub.setSourceStatus("kick", {
      state: "missing",
      detail: config.error
    });
    return { stop() {} };
  }

  let stopped = false;
  subscribe();

  return {
    stop() {
      stopped = true;
      hub.setSourceStatus("kick", {
        state: "stopped",
        detail: "connector stopped"
      });
    }
  };

  async function subscribe() {
    hub.setSourceStatus("kick", {
      state: "connecting",
      detail: "subscribing to chat.message.sent"
    });

    try {
      const response = await fetch(KICK_EVENTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(createKickSubscriptionPayload(config.broadcasterUserId))
      });

      if (stopped) return;
      if (!response.ok) {
        hub.setSourceStatus("kick", {
          state: "error",
          detail: `event subscription failed with HTTP ${response.status}`
        });
        return;
      }

      hub.setSourceStatus("kick", {
        state: "webhook-ready",
        detail: "subscribed to chat.message.sent; waiting for webhook"
      });
    } catch (error) {
      if (stopped) return;
      hub.setSourceStatus("kick", {
        state: "error",
        detail: error.message
      });
    }
  }
}

export function resolveKickConfig(env = process.env) {
  const autoSubscribe = isEnabled(env.KICK_AUTO_SUBSCRIBE);
  if (!autoSubscribe) return { autoSubscribe: false };

  const accessToken = env.KICK_ACCESS_TOKEN?.trim();
  const broadcasterUserId = env.KICK_BROADCASTER_USER_ID?.trim();

  if (!accessToken) {
    return { autoSubscribe, error: "missing KICK_ACCESS_TOKEN for events subscription" };
  }

  if (!broadcasterUserId) {
    return { autoSubscribe, error: "missing KICK_BROADCASTER_USER_ID for events subscription" };
  }

  return {
    autoSubscribe,
    accessToken,
    broadcasterUserId
  };
}

export function createKickSubscriptionPayload(broadcasterUserId) {
  return {
    broadcaster_user_id: Number(broadcasterUserId),
    events: [
      {
        name: "chat.message.sent",
        version: 1
      }
    ],
    method: "webhook"
  };
}

export function shouldRequireKickSignature(env = process.env) {
  return isEnabled(env.KICK_REQUIRE_SIGNATURE);
}

export function verifyKickWebhookSignature({ headers = {}, rawBody = "", publicKey = KICK_PUBLIC_KEY }) {
  const normalizedHeaders = normalizeHeaders(headers);
  const messageId = normalizedHeaders["kick-event-message-id"];
  const timestamp = normalizedHeaders["kick-event-message-timestamp"];
  const signature = normalizedHeaders["kick-event-signature"];

  if (!messageId || !timestamp || !signature) {
    return { ok: false, reason: "missing Kick signature headers" };
  }

  try {
    const signedPayload = `${messageId}.${timestamp}.${rawBody}`;
    const ok = verify(
      "RSA-SHA256",
      Buffer.from(signedPayload),
      publicKey,
      Buffer.from(signature, "base64")
    );
    return ok ? { ok: true } : { ok: false, reason: "invalid Kick signature" };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(",") : String(value)
    ])
  );
}

function isEnabled(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}
