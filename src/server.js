import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { createDemoConnector } from "./connectors/demo.js";
import { startTwitchConnector } from "./connectors/twitch.js";
import { startXConnector } from "./connectors/x.js";
import { createFeedHub } from "./core/hub.js";
import { createInjectedMessage, normalizeKickWebhook } from "./core/messages.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = normalize(join(__dirname, ".."));
const publicDir = join(rootDir, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const demoEnabled = isDemoModeEnabled(process.env.DEMO_MODE);
const hub = createFeedHub();
const demo = createDemoConnector(hub);
const connectors = [];

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
};

connectors.push(startTwitchConnector(hub));
connectors.push(startXConnector(hub));
if (demoEnabled) {
  demo.start();
} else {
  hub.setSourceStatus("kick", {
    state: "webhook-ready",
    detail: "POST Kick chat.message.sent events to /kick.webhook"
  });
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
      const payload = await readJsonBody(request);
      const message = normalizeKickWebhook(payload, request.headers);
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
  sendSse(response, "snapshot", appSnapshot());

  const unsubscribe = hub.subscribe((event) => {
    sendSse(response, event.type, event);
  });

  const heartbeat = setInterval(() => {
    sendSse(response, "heartbeat", { now: new Date().toISOString() });
  }, 15000);

  response.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
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
      liveOnly: !demoEnabled
    }
  };
}

function isDemoModeEnabled(value = "on") {
  const normalized = String(value || "on").trim().toLowerCase();
  return !["0", "false", "live", "no", "off"].includes(normalized);
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
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1024 * 1024) throw new Error("request body too large");
  }
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
      ".woff2": "font/woff2"
    }[extname(filePath)] || "application/octet-stream"
  );
}

function shutdown() {
  demo.stop();
  for (const connector of connectors) connector.stop();
  server.close(() => process.exit(0));
}
