import { normalizeXStreamEvent } from "../core/messages.js";

const X_STREAM_URL = "https://api.x.com/2/tweets/search/stream";

export function startXConnector(hub, env = process.env) {
  const bearerToken = env.X_BEARER_TOKEN;
  if (!bearerToken) {
    hub.setSourceStatus("x", {
      state: "missing",
      detail: "missing X_BEARER_TOKEN for filtered stream"
    });
    return { stop() {} };
  }

  let stopped = false;
  let controller = null;
  let reconnectMs = 1000;

  async function connect() {
    if (stopped) return;
    controller = new AbortController();
    hub.setSourceStatus("x", {
      state: "connecting",
      detail: "opening filtered stream"
    });

    const url = new URL(X_STREAM_URL);
    url.searchParams.set("tweet.fields", "author_id,created_at,public_metrics");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "name,username,verified,profile_image_url");

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${bearerToken}`
        }
      });

      if (!response.ok || !response.body) {
        throw new Error(`X stream returned HTTP ${response.status}`);
      }

      reconnectMs = 1000;
      hub.setSourceStatus("x", {
        state: "connected",
        detail: "filtered stream online"
      });

      await readJsonLines(response.body, (payload) => {
        const message = normalizeXStreamEvent(payload);
        if (message) hub.addMessage(message);
      });
    } catch (error) {
      if (stopped || error.name === "AbortError") return;
      hub.setSourceStatus("x", {
        state: "error",
        detail: error.message
      });
    }

    if (!stopped) {
      hub.setSourceStatus("x", {
        state: "reconnecting",
        detail: `retrying in ${Math.round(reconnectMs / 1000)}s`
      });
      setTimeout(connect, reconnectMs);
      reconnectMs = Math.min(reconnectMs * 1.8, 45000);
    }
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (controller) controller.abort();
      hub.setSourceStatus("x", {
        state: "stopped",
        detail: "connector stopped"
      });
    }
  };
}

async function readJsonLines(stream, onPayload) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onPayload(JSON.parse(trimmed));
    }
  }
}
