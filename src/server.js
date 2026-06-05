import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { createDemoConnector } from "./connectors/demo.js";
import { resolveKickConfig, shouldRequireKickSignature, startKickConnector, verifyKickWebhookSignature } from "./connectors/kick.js";
import { startTwitchConnector } from "./connectors/twitch.js";
import { resolveXRulesFromEnv, startXConnector } from "./connectors/x.js";
import { createHistoryLog } from "./core/history.js";
import { createFeedHub } from "./core/hub.js";
import { createInjectedMessage, normalizeKickWebhook } from "./core/messages.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = normalize(join(__dirname, ".."));
const publicDir = join(rootDir, "public");
const dataDir = join(rootDir, "data");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const demoEnabled = isDemoModeEnabled(process.env.DEMO_MODE);
const adminToken = (process.env.ADMIN_TOKEN || "").trim();
const hub = createFeedHub();
const demo = createDemoConnector(hub);
const connectors = [];

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'"
};

let sseClients = 0;

const history = createHistoryLog({
  filePath: process.env.HISTORY_FILE || join(dataDir, "feed.ndjson"),
  enabled: isHistoryEnabled(process.env.HISTORY)
});
hub.subscribe((event) => {
  if (event.type === "message") history.append(event.message);
});

const twitchChannelsFile = join(dataDir, "twitch-channels.json");
let runtimeTwitchChannels = await loadRuntimeTwitchChannels();
let twitchConnector = startTwitchConnector(hub, twitchEnv());
let xConnector = startXConnector(hub);

connectors.push(xConnector);
if (demoEnabled) {
  demo.start();
} else {
  connectors.push(startKickConnector(hub));
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = getPathname(request);

    if (request.method === "GET" && matches(pathname, "/events", "/events.stream")) {
      return handleEvents(response);
    }

    if (request.method === "GET" && matches(pathname, "/api/status", "/status.json")) {
      return sendJson(response, appSnapshot());
    }

    if (request.method === "GET" && pathname === "/healthz") {
      return sendJson(response, {
        ok: true,
        service: "bubblewire",
        uptimeSeconds: Math.round(process.uptime()),
        checkedAt: new Date().toISOString()
      });
    }

    if (request.method === "GET" && matches(pathname, "/api/messages", "/messages.json")) {
      return sendJson(response, { messages: hub.snapshot().messages });
    }

    if (request.method === "GET" && matches(pathname, "/api/history", "/history.json")) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const page = await history.query({
        before: url.searchParams.get("before") || undefined,
        limit: url.searchParams.get("limit") || undefined
      });
      return sendJson(response, { ...page, historyEnabled: history.enabled });
    }

    if (request.method === "GET" && matches(pathname, "/api/setup", "/setup.json")) {
      return sendJson(response, setupSnapshot(request));
    }

    if (request.method === "GET" && pathname === "/api/twitch/channels") {
      return sendJson(response, twitchChannelsSnapshot());
    }

    if (request.method === "POST" && pathname === "/api/twitch/channels") {
      if (!isAdminAuthorized(request)) {
        return sendJson(response, { ok: false, error: "admin token required" }, 401);
      }
      if (twitchPath() === "eventsub") {
        return sendJson(response, {
          ok: false,
          error: "EventSub mode subscribes by broadcaster id; channel list applies to IRC mode only"
        }, 409);
      }
      const payload = await readJsonBody(request);
      const action = payload.action === "remove" ? "remove" : "add";
      const channel = String(payload.channel || "").trim().toLowerCase().replace(/^#/, "");
      if (!/^[a-z0-9_]{1,25}$/.test(channel)) {
        return sendJson(response, { ok: false, error: "invalid channel name" }, 400);
      }

      const next = new Set(runtimeTwitchChannels);
      if (action === "add") next.add(channel);
      else next.delete(channel);
      if (next.size > 20) {
        return sendJson(response, { ok: false, error: "channel list capped at 20" }, 400);
      }

      runtimeTwitchChannels = [...next];
      await persistRuntimeTwitchChannels();
      restartTwitchConnector();
      return sendJson(response, { ok: true, ...twitchChannelsSnapshot() });
    }

    if (request.method === "GET" && matches(pathname, "/api/export.ndjson", "/export.ndjson")) {
      const ndjson = hub
        .snapshot()
        .messages.slice()
        .reverse()
        .map((message) => JSON.stringify(message))
        .join("\n");
      response.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": "attachment; filename=bubblewire-feed.ndjson",
        ...securityHeaders
      });
      return response.end(`${ndjson}\n`);
    }

    if (request.method === "POST" && matches(pathname, "/webhooks/kick", "/kick.webhook")) {
      const rawBody = await readRawBody(request);
      let evidenceLevel = "webhook-proof";
      let signatureStatus = "not-required";
      if (shouldRequireKickSignature()) {
        const signature = verifyKickWebhookSignature({ headers: request.headers, rawBody });
        if (!signature.ok) return sendJson(response, { ok: false, error: signature.reason }, 401);
        evidenceLevel = "signed";
        signatureStatus = "verified";
      }
      const payload = parseJsonBody(rawBody);
      const message = normalizeKickWebhook(payload, request.headers, { evidenceLevel, signatureStatus });
      if (!message) return sendJson(response, { ok: false, error: "unsupported Kick event" }, 400);
      hub.addMessage(message);
      hub.setSourceStatus("kick", {
        state: "connected",
        detail: "last webhook accepted"
      });
      return sendJson(response, { ok: true, id: message.id });
    }

    if (request.method === "POST" && matches(pathname, "/api/inject", "/inject.json")) {
      if (!demoEnabled) {
        return sendJson(response, {
          ok: false,
          error: "synthetic feed injection disabled by DEMO_MODE=off"
        }, 409);
      }
      const payload = await readJsonBody(request);
      const message = createInjectedMessage(payload);
      hub.addMessage(message);
      return sendJson(response, { ok: true, message });
    }

    if (request.method === "POST" && matches(pathname, "/api/demo/start", "/demo-start.json")) {
      if (!demoEnabled) {
        return sendJson(response, {
          ok: false,
          error: "demo disabled by DEMO_MODE=off",
          running: false
        }, 409);
      }
      demo.start();
      return sendJson(response, { ok: true, running: demo.isRunning() });
    }

    if (request.method === "POST" && matches(pathname, "/api/demo/stop", "/demo-stop.json")) {
      demo.stop();
      return sendJson(response, { ok: true, running: demo.isRunning() });
    }

    if (request.method === "POST" && matches(pathname, "/api/demo/spike", "/demo-spike.json")) {
      if (!demoEnabled) {
        return sendJson(response, {
          ok: false,
          error: "demo disabled by DEMO_MODE=off"
        }, 409);
      }
      demo.pushSpike(18);
      return sendJson(response, { ok: true });
    }

    return serveStatic(request, response);
  } catch (error) {
    return sendJson(response, { ok: false, error: error.message }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`Bubblewire listening at http://${host}:${port}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function handleEvents(response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...securityHeaders
  });
  response.write("retry: 3000\n\n");
  sseClients += 1;
  sendSse(response, "snapshot", appSnapshot());
  hub.publish({ type: "presence", watching: sseClients });

  const unsubscribe = hub.subscribe((event) => {
    sendSse(response, event.type, event);
  });

  const heartbeat = setInterval(() => {
    sendSse(response, "heartbeat", { now: new Date().toISOString() });
  }, 15000);

  response.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    sseClients = Math.max(0, sseClients - 1);
    hub.publish({ type: "presence", watching: sseClients });
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = matches(url.pathname, "/", "/overlay", "/overlay.html") ? "/index.html" : url.pathname;
  const filePath = normalize(join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403, securityHeaders);
    return response.end("Forbidden");
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeType(filePath),
      ...securityHeaders
    });
    response.end(file);
  } catch {
    response.writeHead(404, securityHeaders);
    response.end("Not found");
  }
}

function appSnapshot() {
  return {
    ...hub.snapshot(),
    runtime: {
      demoEnabled,
      demoMode: demoEnabled ? "on" : "off",
      demoRunning: demo.isRunning(),
      liveOnly: !demoEnabled,
      watching: sseClients
    }
  };
}

function isDemoModeEnabled(value = "on") {
  const normalized = String(value || "on").trim().toLowerCase();
  return !["0", "false", "live", "no", "off"].includes(normalized);
}

function isHistoryEnabled(value = "on") {
  const normalized = String(value || "on").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(normalized);
}

function isAdminAuthorized(request) {
  if (!adminToken) return true;
  return (request.headers["x-admin-token"] || "") === adminToken;
}

function twitchEnv() {
  return { ...process.env, TWITCH_CHANNELS: runtimeTwitchChannels.join(",") };
}

function twitchPath(env = process.env) {
  if (env.TWITCH_CLIENT_ID && env.TWITCH_BOT_USER_ACCESS_TOKEN && env.TWITCH_BOT_USER_ID && env.TWITCH_BROADCASTER_USER_ID) {
    return "eventsub";
  }
  if (runtimeTwitchChannels.length === 0) return "none";
  return env.TWITCH_USERNAME && env.TWITCH_OAUTH_TOKEN ? "irc-auth" : "irc-anon";
}

function restartTwitchConnector() {
  try {
    twitchConnector?.stop();
  } catch {
    /* connector already down */
  }
  twitchConnector = startTwitchConnector(hub, twitchEnv());
}

async function loadRuntimeTwitchChannels() {
  const fromEnv = String(process.env.TWITCH_CHANNELS || "")
    .split(",")
    .map((channel) => channel.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean);
  const saved = await readFile(twitchChannelsFile, "utf8")
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  const fromFile = Array.isArray(saved?.channels)
    ? saved.channels.filter((channel) => /^[a-z0-9_]{1,25}$/.test(String(channel)))
    : [];
  return [...new Set([...fromEnv, ...fromFile])];
}

async function persistRuntimeTwitchChannels() {
  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(twitchChannelsFile, JSON.stringify({ channels: runtimeTwitchChannels }, null, 2));
  } catch {
    /* persistence is best-effort */
  }
}

function twitchChannelsSnapshot() {
  return {
    channels: runtimeTwitchChannels,
    mode: twitchPath(),
    mutable: twitchPath() !== "eventsub",
    adminLocked: Boolean(adminToken)
  };
}

function setupSnapshot(request) {
  const env = process.env;
  const present = (name) => Boolean(env[name] && String(env[name]).trim());
  const kickConfig = resolveKickConfig(env);
  const xSnapshot = xConnector?.snapshot?.() || { rules: resolveXRulesFromEnv(env) };
  const hostHeader = request.headers.host || `${host}:${port}`;
  const kickPublicBase = (env.KICK_WEBHOOK_PUBLIC_URL || "").trim().replace(/\/$/, "");

  return {
    demo: { enabled: demoEnabled, mode: demoEnabled ? "on" : "off" },
    history: { enabled: history.enabled },
    adminLocked: Boolean(adminToken),
    sources: {
      twitch: {
        path: twitchPath(),
        channels: runtimeTwitchChannels,
        channelsMutable: twitchPath() !== "eventsub",
        eventsubVars: {
          TWITCH_CLIENT_ID: present("TWITCH_CLIENT_ID"),
          TWITCH_BOT_USER_ACCESS_TOKEN: present("TWITCH_BOT_USER_ACCESS_TOKEN"),
          TWITCH_BOT_USER_ID: present("TWITCH_BOT_USER_ID"),
          TWITCH_BROADCASTER_USER_ID: present("TWITCH_BROADCASTER_USER_ID")
        },
        ircVars: {
          TWITCH_CHANNELS: runtimeTwitchChannels.length > 0,
          TWITCH_USERNAME: present("TWITCH_USERNAME"),
          TWITCH_OAUTH_TOKEN: present("TWITCH_OAUTH_TOKEN")
        },
        note: "EventSub needs all four vars. IRC works with channels alone (anonymous read-only)."
      },
      x: {
        vars: { X_BEARER_TOKEN: present("X_BEARER_TOKEN") },
        rules: xSnapshot.rules,
        note: "Filtered-stream rules are created on the X platform before starting Bubblewire."
      },
      kick: {
        vars: {
          KICK_WEBHOOK_PUBLIC_URL: present("KICK_WEBHOOK_PUBLIC_URL"),
          KICK_AUTO_SUBSCRIBE: Boolean(kickConfig.autoSubscribe),
          KICK_ACCESS_TOKEN: present("KICK_ACCESS_TOKEN"),
          KICK_BROADCASTER_USER_ID: present("KICK_BROADCASTER_USER_ID"),
          KICK_REQUIRE_SIGNATURE: shouldRequireKickSignature(env)
        },
        webhookUrl: `${kickPublicBase || `http://${hostHeader}`}/kick.webhook`,
        note: "Point Kick chat.message.sent webhooks at the URL above (public tunnel needed locally)."
      }
    }
  };
}

function getPathname(request) {
  return new URL(request.url, `http://${request.headers.host}`).pathname;
}

function matches(value, ...candidates) {
  return candidates.includes(value);
}

function sendSse(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readJsonBody(request) {
  return parseJsonBody(await readRawBody(request));
}

async function readRawBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1024 * 1024) throw new Error("request body too large");
  }
  return body;
}

function parseJsonBody(body) {
  return body ? JSON.parse(body) : {};
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ...securityHeaders
  });
  response.end(JSON.stringify(payload, null, 2));
}

function mimeType(filePath) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
      ".png": "image/png",
      ".json": "application/json; charset=utf-8",
      ".webmanifest": "application/manifest+json; charset=utf-8"
    }[extname(filePath)] || "application/octet-stream"
  );
}

function shutdown() {
  demo.stop();
  try {
    twitchConnector?.stop();
  } catch {
    /* already stopped */
  }
  for (const connector of connectors) connector.stop();
  server.close(() => process.exit(0));
}
