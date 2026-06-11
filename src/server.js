import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { createDemoConnector } from "./connectors/demo.js";
import { resolveKickConfig, shouldRequireKickSignature, startKickConnector, verifyKickWebhookSignature } from "./connectors/kick.js";
import { startTwitchConnector } from "./connectors/twitch.js";
import {
  cleanYouTubeChannelId,
  cleanYouTubeLiveChatId,
  extractYouTubeChannelHandle,
  extractYouTubeVideoId,
  resolveYouTubeConfig,
  startYouTubeConnector
} from "./connectors/youtube.js";
import {
  clearXLiveBroadcastRules,
  extractXLiveBroadcastTarget,
  fetchXConnectionHistory,
  resolveXRulesFromEnv,
  resolveXStreamPolicy,
  setXLiveBroadcastRule,
  startXConnector,
  terminateAllXConnections,
  xliveRuleForBroadcast,
  xliveStatusForStreamState
} from "./connectors/x.js";
import { createAnalyzer } from "./core/analysis.js";
import { createHistoryLog } from "./core/history.js";
import { createFeedHub } from "./core/hub.js";
import { createInjectedMessage, normalizeKickWebhook } from "./core/messages.js";
import { createProofPacket, createReplayBundle, createSessionSnapshot } from "./core/session.js";

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
let runtimeXPaused = isFlagEnabled(process.env.X_STREAM_PAUSED);

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
const analyzer = createAnalyzer();
hub.subscribe((event) => {
  if (event.type === "message") {
    history.append(event.message);
    analyzer.ingest(event.message);
  }
});

// Push the rolling intelligence read to all SSE clients a couple times a second.
const analysisInterval = setInterval(() => {
  if (sseClients > 0) hub.publish({ type: "analysis", analysis: analyzer.snapshot() });
}, 2500);
if (typeof analysisInterval.unref === "function") analysisInterval.unref();

const twitchChannelsFile = join(dataDir, "twitch-channels.json");
const xliveFile = process.env.XLIVE_FILE || join(dataDir, "xlive.json");
const youtubeFile = process.env.YOUTUBE_FILE || join(dataDir, "youtube.json");
let runtimeTwitchChannels = await loadRuntimeTwitchChannels();
let runtimeXLiveBroadcastId = await loadRuntimeXLiveBroadcast();
let runtimeYouTubeTarget = await loadRuntimeYouTubeTarget();
let twitchConnector = startTwitchConnector(hub, twitchEnv());
let youtubeConnector = startYouTubeConnector(hub, youtubeEnv());
let xConnector = startManagedXConnector();

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

    if (request.method === "GET" && matches(pathname, "/api/analysis", "/analysis.json")) {
      return sendJson(response, analyzer.snapshot());
    }

    if (request.method === "GET" && matches(pathname, "/api/setup", "/setup.json")) {
      return sendJson(response, setupSnapshot(request));
    }

    if (request.method === "GET" && matches(pathname, "/api/session", "/session.json")) {
      const snapshot = appSnapshot();
      const setup = setupSnapshot(request);
      return sendJson(response, createSessionSnapshot({ snapshot, setup, routes: publicRoutes(request) }));
    }

    if (request.method === "GET" && matches(pathname, "/api/proof-packet", "/proof-packet.json")) {
      const snapshot = appSnapshot();
      const setup = setupSnapshot(request);
      return sendJson(response, createProofPacket({ snapshot, setup, routes: publicRoutes(request) }));
    }

    if (request.method === "GET" && matches(pathname, "/api/replay", "/replay.json")) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const momentId = url.searchParams.get("moment") || url.searchParams.get("id") || "";
      const windowSeconds = url.searchParams.get("window") || url.searchParams.get("windowSeconds") || 90;
      return sendJson(response, createReplayBundle({
        snapshot: appSnapshot(),
        momentId,
        windowSeconds
      }));
    }

    if (request.method === "POST" && pathname === "/api/x/control") {
      if (!isAdminAuthorized(request)) {
        return sendJson(response, { ok: false, error: "admin token required" }, 401);
      }
      const payload = await readJsonBody(request);
      const action = String(payload.action || "").trim().toLowerCase();
      if (!["pause", "resume"].includes(action)) {
        return sendJson(response, { ok: false, error: "action must be pause or resume" }, 400);
      }
      runtimeXPaused = action === "pause";
      restartXConnector();
      return sendJson(response, {
        ok: true,
        paused: runtimeXPaused,
        status: hub.snapshot().status.x,
        x: xConnector.snapshot()
      });
    }

    if (request.method === "GET" && pathname === "/api/x/connections") {
      if (!isAdminAuthorized(request)) {
        return sendJson(response, { ok: false, error: "admin token required" }, 401);
      }
      return sendJson(response, {
        ok: true,
        connections: await fetchXConnectionHistory(process.env)
      });
    }

    if (request.method === "POST" && pathname === "/api/x/connections") {
      if (!isAdminAuthorized(request)) {
        return sendJson(response, { ok: false, error: "admin token required" }, 401);
      }
      const payload = await readJsonBody(request);
      const action = String(payload.action || "").trim().toLowerCase();
      if (!["list", "terminate", "terminate-all"].includes(action)) {
        return sendJson(response, { ok: false, error: "action must be list or terminate-all" }, 400);
      }
      if (action === "list") {
        return sendJson(response, {
          ok: true,
          connections: await fetchXConnectionHistory(process.env)
        });
      }

      runtimeXPaused = true;
      restartXConnector();
      const before = await fetchXConnectionHistory(process.env);
      const terminated = await terminateAllXConnections(process.env);
      const after = await fetchXConnectionHistory(process.env);
      return sendJson(
        response,
        {
          ok: Boolean(terminated.ok),
          paused: runtimeXPaused,
          before,
          terminated,
          after,
          status: hub.snapshot().status.x,
          x: xConnector.snapshot()
        },
        terminated.ok ? 200 : 502
      );
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

    if (request.method === "GET" && pathname === "/api/xlive/broadcast") {
      return sendJson(response, xliveSnapshot());
    }

    if (request.method === "POST" && pathname === "/api/xlive/broadcast") {
      if (!isAdminAuthorized(request)) {
        return sendJson(response, { ok: false, error: "admin token required" }, 401);
      }
      const payload = await readJsonBody(request);
      const action = String(payload.action || "").trim().toLowerCase();
      if (action === "clear") {
        return sendJson(response, await clearXLiveBroadcast());
      }

      const broadcastId = extractXLiveBroadcastTarget(payload.url || payload.id || payload.broadcast || "");
      if (!broadcastId) {
        return sendJson(response, {
          ok: false,
          error: "expected an X broadcast URL, x.com/twitter.com status URL, or numeric post id"
        }, 400);
      }

      const rules = await setXLiveBroadcastRule(process.env, broadcastId);
      runtimeXLiveBroadcastId = broadcastId;
      await persistRuntimeXLiveBroadcast();
      xConnector?.setXLiveBroadcast?.(runtimeXLiveBroadcastId);
      return sendJson(response, { ok: true, rules, ...xliveSnapshot() });
    }

    if (request.method === "DELETE" && pathname === "/api/xlive/broadcast") {
      if (!isAdminAuthorized(request)) {
        return sendJson(response, { ok: false, error: "admin token required" }, 401);
      }
      return sendJson(response, await clearXLiveBroadcast());
    }

    if (request.method === "GET" && pathname === "/api/youtube/live") {
      return sendJson(response, youtubeSnapshot());
    }

    if (request.method === "POST" && pathname === "/api/youtube/live") {
      if (!isAdminAuthorized(request)) {
        return sendJson(response, { ok: false, error: "admin token required" }, 401);
      }
      const payload = await readJsonBody(request);
      const action = String(payload.action || "").trim().toLowerCase();
      if (action === "clear") {
        return sendJson(response, await clearYouTubeTarget());
      }

      const rawVideo = payload.url || payload.videoId || payload.video || payload.channelHandle || payload.handle || "";
      const rawChat = payload.liveChatId || payload.chatId || "";
      const videoId = extractYouTubeVideoId(rawVideo);
      const liveChatId = cleanYouTubeLiveChatId(rawChat);
      const channelHandle = videoId ? "" : extractYouTubeChannelHandle(payload.channelHandle || payload.handle || payload.channel || rawVideo || "");
      const channelId = cleanYouTubeChannelId(payload.channelId || "");
      if (!videoId && !liveChatId && !channelHandle && !channelId) {
        return sendJson(response, {
          ok: false,
          error: "expected a YouTube watch/live URL, video id, live chat id, channel id, or @handle"
        }, 400);
      }

      runtimeYouTubeTarget = { videoId, liveChatId, channelId, channelHandle };
      await persistRuntimeYouTubeTarget();
      restartYouTubeConnector();
      return sendJson(response, { ok: true, ...youtubeSnapshot() });
    }

    if (request.method === "DELETE" && pathname === "/api/youtube/live") {
      if (!isAdminAuthorized(request)) {
        return sendJson(response, { ok: false, error: "admin token required" }, 401);
      }
      return sendJson(response, await clearYouTubeTarget());
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
  const requestedPath = matches(url.pathname, "/", "/judge", "/overlay", "/overlay.html") ? "/index.html" : url.pathname;
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
    analysis: analyzer.snapshot(),
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

function isFlagEnabled(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "pause", "paused"].includes(normalized);
}

function isAdminAuthorized(request) {
  if (!adminToken) return !isProductionRuntime();
  return (request.headers["x-admin-token"] || "") === adminToken;
}

function isAdminLocked() {
  return Boolean(adminToken) || isProductionRuntime();
}

function isProductionRuntime(env = process.env) {
  return env.RENDER === "true" || Boolean(env.RENDER_SERVICE_ID || env.RENDER_EXTERNAL_URL);
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

function xEnv() {
  return { ...process.env, X_LIVE_BROADCAST_ID: runtimeXLiveBroadcastId };
}

function youtubeEnv() {
  return {
    ...process.env,
    YOUTUBE_VIDEO_ID: runtimeYouTubeTarget.videoId || process.env.YOUTUBE_VIDEO_ID || "",
    YOUTUBE_LIVE_CHAT_ID: runtimeYouTubeTarget.liveChatId || process.env.YOUTUBE_LIVE_CHAT_ID || "",
    YOUTUBE_CHANNEL_ID: runtimeYouTubeTarget.channelId || process.env.YOUTUBE_CHANNEL_ID || "",
    YOUTUBE_CHANNEL_HANDLE: runtimeYouTubeTarget.channelHandle || process.env.YOUTUBE_CHANNEL_HANDLE || process.env.YOUTUBE_HANDLE || ""
  };
}

function startManagedXConnector() {
  if (runtimeXPaused) return createPausedXConnector();
  return startXConnector(hub, xEnv());
}

function restartXConnector() {
  try {
    xConnector?.stop();
  } catch {
    /* connector already down */
  }
  xConnector = startManagedXConnector();
}

function restartYouTubeConnector() {
  try {
    youtubeConnector?.stop();
  } catch {
    /* connector already down */
  }
  youtubeConnector = startYouTubeConnector(hub, youtubeEnv());
}

function createPausedXConnector() {
  const rules = resolveXRulesFromEnv(process.env);
  const stream = {
    ...resolveXStreamPolicy(process.env),
    paused: true
  };
  hub.setSourceStatus("x", {
    state: "paused",
    detail: "X filtered stream paused by admin control",
    diagnostics: null,
    stream
  });
  hub.setSourceStatus("xlive", xliveStatusForStreamState("paused", runtimeXLiveBroadcastId));
  return {
    stop() {},
    setXLiveBroadcast(id) {
      const next = extractXLiveBroadcastTarget(id || "") || "";
      hub.setSourceStatus("xlive", xliveStatusForStreamState("paused", next));
      return next;
    },
    snapshot() {
      return { rules, diagnostics: null, stream, xlive: { broadcastId: runtimeXLiveBroadcastId || null } };
    }
  };
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
    adminLocked: isAdminLocked()
  };
}

async function loadRuntimeXLiveBroadcast() {
  const saved = await readFile(xliveFile, "utf8")
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  if (saved && typeof saved === "object" && "broadcastId" in saved) {
    return extractXLiveBroadcastTarget(saved.broadcastId || "") || "";
  }
  return extractXLiveBroadcastTarget(process.env.X_LIVE_BROADCAST_ID || "") || "";
}

async function persistRuntimeXLiveBroadcast() {
  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(xliveFile, JSON.stringify({ broadcastId: runtimeXLiveBroadcastId || null }, null, 2));
  } catch {
    /* persistence is best-effort */
  }
}

async function loadRuntimeYouTubeTarget() {
  const saved = await readFile(youtubeFile, "utf8")
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  if (!saved || typeof saved !== "object") return { videoId: "", liveChatId: "", channelId: "", channelHandle: "" };
  return {
    videoId: extractYouTubeVideoId(saved.videoId || saved.url || "") || "",
    liveChatId: cleanYouTubeLiveChatId(saved.liveChatId || saved.chatId || "") || "",
    channelId: cleanYouTubeChannelId(saved.channelId || "") || "",
    channelHandle: extractYouTubeChannelHandle(saved.channelHandle || saved.handle || saved.channel || "") || ""
  };
}

async function persistRuntimeYouTubeTarget() {
  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(youtubeFile, JSON.stringify({
      videoId: runtimeYouTubeTarget.videoId || null,
      liveChatId: runtimeYouTubeTarget.liveChatId || null,
      channelId: runtimeYouTubeTarget.channelId || null,
      channelHandle: runtimeYouTubeTarget.channelHandle || null
    }, null, 2));
  } catch {
    /* persistence is best-effort */
  }
}

async function clearXLiveBroadcast() {
  const rules = await clearXLiveBroadcastRules(process.env);
  runtimeXLiveBroadcastId = "";
  await persistRuntimeXLiveBroadcast();
  xConnector?.setXLiveBroadcast?.("");
  return { ok: true, rules, ...xliveSnapshot() };
}

async function clearYouTubeTarget() {
  runtimeYouTubeTarget = { videoId: "", liveChatId: "", channelId: "", channelHandle: "" };
  await persistRuntimeYouTubeTarget();
  restartYouTubeConnector();
  return { ok: true, ...youtubeSnapshot() };
}

function xliveSnapshot() {
  return {
    broadcastId: runtimeXLiveBroadcastId || null,
    configured: Boolean(runtimeXLiveBroadcastId),
    rule: runtimeXLiveBroadcastId ? xliveRuleForBroadcast(runtimeXLiveBroadcastId) : null,
    status: hub.snapshot().status.xlive || null,
    adminLocked: isAdminLocked()
  };
}

function youtubeSnapshot() {
  const connector = youtubeConnector?.snapshot?.() || {};
  const config = resolveYouTubeConfig(youtubeEnv());
  const videoId = connector.videoId || config.videoId || null;
  const liveChatId = connector.liveChatId || config.liveChatId || null;
  const channelId = connector.channelId || config.channelId || null;
  const channelHandle = connector.channelHandle || config.channelHandle || null;
  return {
    videoId,
    liveChatId,
    channelId,
    channelHandle,
    configured: Boolean(videoId || liveChatId || channelId || channelHandle),
    status: hub.snapshot().status.youtube || null,
    diagnostics: connector.diagnostics || null,
    control: {
      endpoint: "/api/youtube/live",
      adminLocked: isAdminLocked()
    },
    note: "Uses YouTube Data API liveChat/messages; set @handle, channel id, video URL/id, or direct liveChatId."
  };
}

function setupSnapshot(request) {
  const env = process.env;
  const present = (name) => Boolean(env[name] && String(env[name]).trim());
  const kickConfig = resolveKickConfig(env);
  const youtube = youtubeSnapshot();
  const xSnapshot = xConnector?.snapshot?.() || { rules: resolveXRulesFromEnv(env) };
  const statusSnapshot = hub.snapshot().status;
  const hostHeader = request.headers.host || `${host}:${port}`;
  const protocol = forwardedProtocol(request) || (request.socket.encrypted ? "https" : "http");
  const kickPublicBase = (env.KICK_WEBHOOK_PUBLIC_URL || "").trim().replace(/\/$/, "");

  return {
    demo: { enabled: demoEnabled, mode: demoEnabled ? "on" : "off" },
    history: { enabled: history.enabled },
    adminLocked: isAdminLocked(),
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
      youtube: {
        vars: {
          YOUTUBE_API_KEY: present("YOUTUBE_API_KEY") || present("GOOGLE_API_KEY"),
          YOUTUBE_LIVE_CHAT_ID: present("YOUTUBE_LIVE_CHAT_ID"),
          YOUTUBE_VIDEO_ID: present("YOUTUBE_VIDEO_ID") || present("YOUTUBE_LIVE_VIDEO_ID") || present("YOUTUBE_URL") || present("YOUTUBE_LIVE_URL"),
          YOUTUBE_CHANNEL_HANDLE: present("YOUTUBE_CHANNEL_HANDLE") || present("YOUTUBE_HANDLE") || present("YOUTUBE_CHANNEL_ID") || present("YOUTUBE_CHANNEL_URL")
        },
        videoId: youtube.videoId,
        liveChatId: youtube.liveChatId,
        channelId: youtube.channelId,
        channelHandle: youtube.channelHandle,
        configured: youtube.configured,
        status: youtube.status,
        diagnostics: youtube.diagnostics,
        control: youtube.control,
        note: youtube.note
      },
      x: {
        vars: {
          X_BEARER_TOKEN: present("X_BEARER_TOKEN"),
          X_STREAM_ENABLED: present("X_STREAM_ENABLED")
        },
        status: statusSnapshot.x || null,
        rules: xSnapshot.rules,
        diagnostics: xSnapshot.diagnostics || statusSnapshot.x?.diagnostics || null,
        stream: xSnapshot.stream || statusSnapshot.x?.stream || resolveXStreamPolicy(env),
        control: {
          paused: runtimeXPaused,
          endpoint: "/api/x/control",
          connectionsEndpoint: "/api/x/connections",
          adminLocked: isAdminLocked()
        },
        note: "Filtered-stream rules are created on the X platform before starting Bubblewire."
      },
      xlive: {
        vars: {
          X_BEARER_TOKEN: present("X_BEARER_TOKEN"),
          X_LIVE_BROADCAST_ID: present("X_LIVE_BROADCAST_ID")
        },
        broadcastId: runtimeXLiveBroadcastId || null,
        configured: Boolean(runtimeXLiveBroadcastId),
        rule: runtimeXLiveBroadcastId ? xliveRuleForBroadcast(runtimeXLiveBroadcastId) : null,
        status: statusSnapshot.xlive || null,
        control: {
          endpoint: "/api/xlive/broadcast",
          adminLocked: isAdminLocked()
        },
        note: "Paste the live broadcast post URL; replies ride the single shared X filtered-stream connection."
      },
      kick: {
        vars: {
          KICK_WEBHOOK_PUBLIC_URL: present("KICK_WEBHOOK_PUBLIC_URL"),
          KICK_AUTO_SUBSCRIBE: Boolean(kickConfig.autoSubscribe),
          KICK_ACCESS_TOKEN: present("KICK_ACCESS_TOKEN"),
          KICK_BROADCASTER_USER_ID: present("KICK_BROADCASTER_USER_ID"),
          KICK_REQUIRE_SIGNATURE: shouldRequireKickSignature(env)
        },
        webhookUrl: `${kickPublicBase || `${protocol}://${hostHeader}`}/kick.webhook`,
        note: "Point Kick chat.message.sent webhooks at the URL above (public tunnel needed locally)."
      }
    }
  };
}

function publicRoutes(request) {
  const origin = publicOrigin(request);
  return {
    app: origin,
    judge: `${origin}/judge`,
    overlay: `${origin}/overlay.html`,
    setup: `${origin}/setup.json`,
    status: `${origin}/status.json`,
    session: `${origin}/session.json`,
    proofPacket: `${origin}/proof-packet.json`,
    replay: `${origin}/replay.json`
  };
}

function publicOrigin(request) {
  const hostHeader = request.headers.host || `${host}:${port}`;
  const protocol = forwardedProtocol(request) || (request.socket.encrypted ? "https" : "http");
  return `${protocol}://${hostHeader}`;
}

function getPathname(request) {
  return new URL(request.url, `http://${request.headers.host}`).pathname;
}

function forwardedProtocol(request) {
  const value = firstHeader(request.headers["x-forwarded-proto"]);
  return value ? value.split(",")[0].trim() : "";
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
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
      ".mp4": "video/mp4",
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
  try {
    youtubeConnector?.stop();
  } catch {
    /* already stopped */
  }
  try {
    xConnector?.stop();
  } catch {
    /* already stopped */
  }
  for (const connector of connectors) connector.stop();
  server.close(() => process.exit(0));
}
