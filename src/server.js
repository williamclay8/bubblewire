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
const hub = createFeedHub();
const demo = createDemoConnector(hub);
const connectors = [];

connectors.push(startTwitchConnector(hub));
connectors.push(startXConnector(hub));
demo.start();

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/events") {
      return handleEvents(response);
    }

    if (request.method === "GET" && request.url === "/api/status") {
      return sendJson(response, hub.snapshot());
    }

    if (request.method === "GET" && request.url === "/healthz") {
      return sendJson(response, {
        ok: true,
        service: "bubblewire",
        uptimeSeconds: Math.round(process.uptime()),
        checkedAt: new Date().toISOString()
      });
    }

    if (request.method === "GET" && request.url === "/api/messages") {
      return sendJson(response, { messages: hub.snapshot().messages });
    }

    if (request.method === "GET" && request.url === "/api/export.ndjson") {
      const ndjson = hub
        .snapshot()
        .messages.slice()
        .reverse()
        .map((message) => JSON.stringify(message))
        .join("\n");
      response.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": "attachment; filename=bubblewire-feed.ndjson"
      });
      return response.end(`${ndjson}\n`);
    }

    if (request.method === "POST" && request.url === "/webhooks/kick") {
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

    if (request.method === "POST" && request.url === "/api/inject") {
      const payload = await readJsonBody(request);
      const message = createInjectedMessage(payload);
      hub.addMessage(message);
      return sendJson(response, { ok: true, message });
    }

    if (request.method === "POST" && request.url === "/api/demo/start") {
      demo.start();
      return sendJson(response, { ok: true, running: demo.isRunning() });
    }

    if (request.method === "POST" && request.url === "/api/demo/stop") {
      demo.stop();
      return sendJson(response, { ok: true, running: demo.isRunning() });
    }

    if (request.method === "POST" && request.url === "/api/demo/spike") {
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
    Connection: "keep-alive"
  });
  sendSse(response, "snapshot", hub.snapshot());

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
  const requestedPath = url.pathname === "/" || url.pathname === "/overlay" ? "/index.html" : url.pathname;
  const filePath = normalize(join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeType(filePath)
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
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
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function mimeType(filePath) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    }[extname(filePath)] || "application/octet-stream"
  );
}

function shutdown() {
  demo.stop();
  for (const connector of connectors) connector.stop();
  server.close(() => process.exit(0));
}
