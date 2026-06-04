import tls from "node:tls";

import { normalizeTwitchEventSubNotification, normalizeTwitchLine } from "../core/messages.js";

export function startTwitchConnector(hub, env = process.env) {
  if (hasEventSubConfig(env)) return startTwitchEventSubConnector(hub, env);
  return startTwitchIrcConnector(hub, env);
}

function startTwitchEventSubConnector(hub, env) {
  if (typeof WebSocket === "undefined") {
    hub.setSourceStatus("twitch", {
      state: "error",
      detail: "Node WebSocket unavailable; use Node 22+ or IRC fallback env"
    });
    return { stop() {} };
  }

  const clientId = env.TWITCH_CLIENT_ID;
  const token = env.TWITCH_BOT_USER_ACCESS_TOKEN;
  const broadcasterUserId = env.TWITCH_BROADCASTER_USER_ID;
  const botUserId = env.TWITCH_BOT_USER_ID;
  let socket = null;
  let stopped = false;
  let reconnectMs = 1000;

  function connect(url = "wss://eventsub.wss.twitch.tv/ws") {
    if (stopped) return;
    hub.setSourceStatus("twitch", {
      state: "connecting",
      detail: "opening EventSub WebSocket"
    });

    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      reconnectMs = 1000;
    });

    socket.addEventListener("message", async (event) => {
      const payload = JSON.parse(event.data);
      const type = payload.metadata?.message_type;

      if (type === "session_welcome") {
        await subscribeToChat(payload.payload.session.id);
        return;
      }

      if (type === "session_keepalive") {
        hub.setSourceStatus("twitch", {
          state: "connected",
          detail: "EventSub keepalive received"
        });
        return;
      }

      if (type === "session_reconnect") {
        const reconnectUrl = payload.payload.session.reconnect_url;
        hub.setSourceStatus("twitch", {
          state: "reconnecting",
          detail: "Twitch requested reconnect"
        });
        socket.close();
        connect(reconnectUrl);
        return;
      }

      if (type === "notification") {
        const message = normalizeTwitchEventSubNotification(payload.payload);
        if (message) hub.addMessage(message);
        return;
      }

      if (type === "revocation") {
        hub.setSourceStatus("twitch", {
          state: "error",
          detail: "EventSub subscription revoked"
        });
      }
    });

    socket.addEventListener("error", () => {
      hub.setSourceStatus("twitch", {
        state: "error",
        detail: "EventSub WebSocket error"
      });
    });

    socket.addEventListener("close", () => {
      if (stopped) return;
      hub.setSourceStatus("twitch", {
        state: "reconnecting",
        detail: `retrying EventSub in ${Math.round(reconnectMs / 1000)}s`
      });
      setTimeout(connect, reconnectMs);
      reconnectMs = Math.min(reconnectMs * 1.7, 30000);
    });
  }

  async function subscribeToChat(sessionId) {
    const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: broadcasterUserId,
          user_id: botUserId
        },
        transport: {
          method: "websocket",
          session_id: sessionId
        }
      })
    });

    if (!response.ok) {
      hub.setSourceStatus("twitch", {
        state: "error",
        detail: `EventSub subscribe failed with HTTP ${response.status}`
      });
      return;
    }

    hub.setSourceStatus("twitch", {
      state: "connected",
      detail: "EventSub channel.chat.message subscription enabled"
    });
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (socket) socket.close();
      hub.setSourceStatus("twitch", {
        state: "stopped",
        detail: "connector stopped"
      });
    }
  };
}

function startTwitchIrcConnector(hub, env) {
  const config = resolveTwitchIrcConfig(env);

  if (!config) {
    hub.setSourceStatus("twitch", {
      state: "missing",
      detail: "missing TWITCH_CHANNELS"
    });
    return { stop() {} };
  }

  if (config.error) {
    hub.setSourceStatus("twitch", {
      state: "missing",
      detail: config.error
    });
    return { stop() {} };
  }

  let socket = null;
  let stopped = false;
  let reconnectMs = 1000;
  let buffer = "";

  function connect() {
    if (stopped) return;
    hub.setSourceStatus("twitch", {
      state: "connecting",
      detail: `joining ${config.channels.join(", ")}${config.mode === "anonymous" ? " anonymously" : ""}`
    });

    socket = tls.connect(
      {
        host: "irc.chat.twitch.tv",
        port: 6697,
        servername: "irc.chat.twitch.tv"
      },
      () => {
        reconnectMs = 1000;
        socket.write(`PASS ${ircPassword(config)}\r\n`);
        socket.write(`NICK ${config.username.toLowerCase()}\r\n`);
        socket.write("CAP REQ :twitch.tv/tags twitch.tv/commands\r\n");
        socket.write(`JOIN ${config.channels.map((channel) => `#${channel}`).join(",")}\r\n`);
        hub.setSourceStatus("twitch", {
          state: "connected",
          detail: `watching ${config.channels.length} channel${config.channels.length === 1 ? "" : "s"}${config.mode === "anonymous" ? " anonymously" : ""}`
        });
      }
    );

    socket.setEncoding("utf8");
    socket.on("data", onData);
    socket.on("error", (error) => {
      hub.setSourceStatus("twitch", {
        state: "error",
        detail: error.message
      });
    });
    socket.on("close", () => {
      if (stopped) return;
      hub.setSourceStatus("twitch", {
        state: "reconnecting",
        detail: `retrying in ${Math.round(reconnectMs / 1000)}s`
      });
      setTimeout(connect, reconnectMs);
      reconnectMs = Math.min(reconnectMs * 1.7, 30000);
    });
  }

  function onData(chunk) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("PING")) {
        socket.write("PONG :tmi.twitch.tv\r\n");
        continue;
      }
      if (line.includes(" RECONNECT")) {
        socket.end();
        continue;
      }
      const message = normalizeTwitchLine(line);
      if (message) hub.addMessage(message);
    }
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (socket) socket.destroy();
      hub.setSourceStatus("twitch", {
        state: "stopped",
        detail: "connector stopped"
      });
    }
  };
}

export function resolveTwitchIrcConfig(env = process.env) {
  const channels = parseList(env.TWITCH_CHANNELS);
  if (channels.length === 0) return null;

  const username = env.TWITCH_USERNAME?.trim();
  const token = env.TWITCH_OAUTH_TOKEN?.trim();

  if (username && token) {
    return {
      mode: "authenticated",
      username,
      token,
      channels
    };
  }

  if (username || token) {
    return {
      error: "missing TWITCH_USERNAME or TWITCH_OAUTH_TOKEN for authenticated IRC"
    };
  }

  return {
    mode: "anonymous",
    username: `justinfan${Math.floor(Math.random() * 90000 + 10000)}`,
    token: "SCHMOOPIIE",
    channels
  };
}

function ircPassword(config) {
  if (config.mode === "anonymous") return config.token;
  return `oauth:${config.token.replace(/^oauth:/, "")}`;
}

function hasEventSubConfig(env) {
  return Boolean(
    env.TWITCH_CLIENT_ID &&
      env.TWITCH_BOT_USER_ACCESS_TOKEN &&
      env.TWITCH_BOT_USER_ID &&
      env.TWITCH_BROADCASTER_USER_ID
  );
}

function parseList(value = "") {
  return value
    .split(",")
    .map((channel) => channel.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean);
}
