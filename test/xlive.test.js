import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  clearXLiveBroadcastRules,
  extractXLiveBroadcastTarget,
  extractXPostId,
  isXLiveRuleTag,
  setXLiveBroadcastRule,
  startXConnector,
  xliveRuleForBroadcast,
  xliveStatusForStreamState
} from "../src/connectors/x.js";
import {
  findXLiveMatchingRule,
  normalizeXLiveStreamEvent,
  normalizeXStreamEvent,
  SOURCE_META
} from "../src/core/messages.js";
import { createDemoConnector } from "../src/connectors/demo.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("extractXPostId accepts x.com and twitter.com status URLs, query params, and bare ids", () => {
  assert.equal(extractXPostId("https://x.com/blknoiz06/status/1930412345678901234"), "1930412345678901234");
  assert.equal(extractXPostId("https://twitter.com/blknoiz06/status/1930412345678901234"), "1930412345678901234");
  assert.equal(extractXPostId("https://x.com/blknoiz06/status/1930412345678901234?s=20&t=abc"), "1930412345678901234");
  assert.equal(extractXPostId("https://www.x.com/i/web/status/1930412345678901234"), "1930412345678901234");
  assert.equal(extractXPostId("https://mobile.twitter.com/user/statuses/1930412345678901234"), "1930412345678901234");
  assert.equal(extractXPostId("x.com/blknoiz06/status/1930412345678901234/video/1"), "1930412345678901234");
  assert.equal(extractXPostId("1930412345678901234"), "1930412345678901234");
  assert.equal(extractXPostId("  1930412345678901234  "), "1930412345678901234");
});

test("extractXLiveBroadcastTarget accepts X broadcast URLs and post URLs", () => {
  assert.equal(extractXLiveBroadcastTarget("https://x.com/i/broadcasts/1yKAPPvoZmqxb"), "1yKAPPvoZmqxb");
  assert.equal(extractXLiveBroadcastTarget("https://twitter.com/i/broadcasts/1yKAPPvoZmqxb"), "1yKAPPvoZmqxb");
  assert.equal(extractXLiveBroadcastTarget("x.com/i/broadcasts/1yKAPPvoZmqxb?s=20"), "1yKAPPvoZmqxb");
  assert.equal(extractXLiveBroadcastTarget("https://x.com/blknoiz06/status/1930412345678901234"), "1930412345678901234");
  assert.equal(extractXLiveBroadcastTarget("not a broadcast"), "");
});

test("extractXPostId rejects invalid input", () => {
  assert.equal(extractXPostId(""), "");
  assert.equal(extractXPostId(null), "");
  assert.equal(extractXPostId("not a url"), "");
  assert.equal(extractXPostId("https://example.com/user/status/1930412345678901234"), "");
  assert.equal(extractXPostId("https://x.com/blknoiz06"), "");
  assert.equal(extractXPostId("https://x.com/blknoiz06/status/abcdef"), "");
  assert.equal(extractXPostId("123"), ""); // too short to be a post id
  assert.equal(extractXPostId("12abc34"), "");
});

test("xliveRuleForBroadcast builds the conversation_id rule with the xlive tag", () => {
  assert.deepEqual(xliveRuleForBroadcast("1930412345678901234"), {
    value: "conversation_id:1930412345678901234",
    tag: "xlive:1930412345678901234"
  });
  assert.equal(isXLiveRuleTag("xlive:1930412345678901234"), true);
  assert.equal(isXLiveRuleTag("challenge-watch"), false);
});

test("xliveRuleForBroadcast builds a URL rule for X broadcast urls", () => {
  assert.deepEqual(xliveRuleForBroadcast("1yKAPPvoZmqxb"), {
    value: "url_contains:1yKAPPvoZmqxb",
    tag: "xlive:1yKAPPvoZmqxb"
  });
});

test("SOURCE_META registers xlive as its own labeled source", () => {
  assert.equal(SOURCE_META.xlive.label, "X Live");
  assert.ok(SOURCE_META.xlive.color);
});

test("normalizeXStreamEvent routes xlive-tagged matching_rules to the xlive source", () => {
  const payload = {
    data: {
      id: "2001",
      text: "what's the invalidation on this $SOL entry?",
      author_id: "77",
      created_at: "2026-06-09T17:00:00Z"
    },
    includes: { users: [{ id: "77", username: "degenwhale", name: "Degen Whale" }] },
    matching_rules: [{ id: "rule-9", tag: "xlive:1930412345678901234" }]
  };

  const message = normalizeXStreamEvent(payload);

  assert.equal(message.source, "xlive");
  assert.equal(message.sourceLabel, "X Live");
  assert.equal(message.id, "xlive:2001");
  assert.equal(message.rawType, "live-broadcast-reply");
  assert.equal(message.channel, "xlive:1930412345678901234");
  assert.equal(message.author.handle, "degenwhale");
});

test("normalizeXStreamEvent prefers xlive when a payload matches xlive and regular rules", () => {
  const payload = {
    data: { id: "2002", text: "$HYPE mention inside the broadcast chat", author_id: "78" },
    matching_rules: [
      { id: "rule-1", tag: "challenge-watch" },
      { id: "rule-9", tag: "xlive:1930412345678901234" }
    ]
  };

  const message = normalizeXStreamEvent(payload);

  assert.equal(message.source, "xlive");
  assert.equal(message.channel, "xlive:1930412345678901234");
  assert.equal(findXLiveMatchingRule(payload.matching_rules).id, "rule-9");
});

test("normalizeXStreamEvent keeps untagged payloads on the x source", () => {
  const message = normalizeXStreamEvent({
    data: { id: "2003", text: "regular filtered post", author_id: "79" },
    matching_rules: [{ id: "rule-1", tag: "challenge-watch" }]
  });

  assert.equal(message.source, "x");
  assert.equal(message.id, "x:2003");
  assert.equal(message.rawType, "filtered-stream");
});

test("normalizeXLiveStreamEvent forces the xlive source", () => {
  const message = normalizeXLiveStreamEvent({
    data: { id: "2004", text: "forced xlive", author_id: "80" },
    matching_rules: []
  });

  assert.equal(message.source, "xlive");
  assert.equal(message.sourceLabel, "X Live");
  assert.equal(message.channel, "live-broadcast");
});

test("setXLiveBroadcastRule replaces stale xlive rules and adds the conversation rule", async () => {
  const calls = [];
  const result = await setXLiveBroadcastRule(
    { X_BEARER_TOKEN: "SECRET_TOKEN" },
    "https://x.com/blknoiz06/status/1930412345678901234",
    {
      fetch: async (url, options = {}) => {
        const method = options.method || "GET";
        calls.push({ url: String(url), method, body: options.body ? JSON.parse(options.body) : null });
        if (method === "GET") {
          const afterAdd = calls.some((call) => call.body?.add);
          return new Response(
            JSON.stringify({
              data: afterAdd
                ? [{ id: "991", tag: "xlive:1930412345678901234", value: "conversation_id:1930412345678901234" }]
                : [
                    { id: "100", tag: "challenge-watch", value: "from:MarketBubble" },
                    { id: "990", tag: "xlive:111111111111", value: "conversation_id:111111111111" }
                  ]
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ meta: { summary: {} } }), { status: 201 });
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.broadcastId, "1930412345678901234");
  assert.deepEqual(result.rule, {
    value: "conversation_id:1930412345678901234",
    tag: "xlive:1930412345678901234"
  });
  assert.equal(result.deletedStale, 1);
  // Stale xlive rule deleted, regular rule untouched.
  const deleteCall = calls.find((call) => call.body?.delete);
  assert.deepEqual(deleteCall.body.delete.ids, ["990"]);
  const addCall = calls.find((call) => call.body?.add);
  assert.deepEqual(addCall.body.add, [{ value: "conversation_id:1930412345678901234", tag: "xlive:1930412345678901234" }]);
  assert.equal(result.rules.rules.some((rule) => rule.tag === "xlive:1930412345678901234"), true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_TOKEN/);
});

test("setXLiveBroadcastRule accepts an X broadcast URL", async () => {
  const calls = [];
  const result = await setXLiveBroadcastRule(
    { X_BEARER_TOKEN: "SECRET_TOKEN" },
    "https://x.com/i/broadcasts/1yKAPPvoZmqxb",
    {
      fetch: async (url, options = {}) => {
        const method = options.method || "GET";
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ url: String(url), method, body });

        if (method === "GET") {
          return new Response(JSON.stringify({
            data: [
              { id: "991", tag: "xlive:1yKAPPvoZmqxb", value: "url_contains:1yKAPPvoZmqxb" }
            ]
          }), { status: 200 });
        }

        return new Response(JSON.stringify({ data: [] }), { status: 201 });
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.broadcastId, "1yKAPPvoZmqxb");
  assert.deepEqual(result.rule, {
    value: "url_contains:1yKAPPvoZmqxb",
    tag: "xlive:1yKAPPvoZmqxb"
  });
  const addCall = calls.find((call) => call.body?.add);
  assert.deepEqual(addCall.body.add, [{ value: "url_contains:1yKAPPvoZmqxb", tag: "xlive:1yKAPPvoZmqxb" }]);
});

test("startXConnector ensures an env-configured X broadcast rule before opening the stream", async (t) => {
  const calls = [];
  const statuses = [];
  const streamBody = new ReadableStream();
  const connector = startXConnector(
    {
      setSourceStatus(source, status) {
        statuses.push({ source, status });
      },
      addMessage() {}
    },
    {
      X_BEARER_TOKEN: "SECRET_TOKEN",
      X_STREAM_ENABLED: "on",
      X_LIVE_BROADCAST_ID: "https://x.com/i/broadcasts/1yKAPPvoZmqxb"
    },
    {
      fetch: async (url, options = {}) => {
        const href = String(url);
        const method = options.method || "GET";
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ href, method, body });

        if (href.endsWith("/rules")) {
          const hasAddedXLive = calls.some((call) => call.body?.add);
          return new Response(JSON.stringify({
            data: hasAddedXLive
              ? [{ id: "991", tag: "xlive:1yKAPPvoZmqxb", value: "url_contains:1yKAPPvoZmqxb" }]
              : [{ id: "100", tag: "marketbubble-live", value: "MarketBubble" }]
          }), { status: method === "POST" ? 201 : 200 });
        }

        return new Response(streamBody, { status: 200 });
      }
    }
  );

  t.after(() => connector.stop());

  await waitFor(() => statuses.some((entry) => entry.source === "x" && entry.status.state === "connected"));
  const streamCallIndex = calls.findIndex((call) => call.href.includes("/2/tweets/search/stream") && call.method === "GET" && !call.href.endsWith("/rules"));
  const addCallIndex = calls.findIndex((call) => call.body?.add);
  const xliveStatus = statuses.filter((entry) => entry.source === "xlive").pop()?.status;

  assert.ok(addCallIndex >= 0);
  assert.ok(streamCallIndex > addCallIndex);
  assert.deepEqual(calls[addCallIndex].body.add, [{ value: "url_contains:1yKAPPvoZmqxb", tag: "xlive:1yKAPPvoZmqxb" }]);
  assert.equal(xliveStatus.state, "live");
  assert.equal(connector.snapshot().rules.rules.some((rule) => rule.tag === "xlive:1yKAPPvoZmqxb"), true);
  assert.doesNotMatch(JSON.stringify({ calls, statuses }), /SECRET_TOKEN/);
});

test("setXLiveBroadcastRule reports missing bearer token and invalid ids without fetching", async () => {
  let fetchCalls = 0;
  const fetchSpy = async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  };

  const noToken = await setXLiveBroadcastRule({}, "1930412345678901234", { fetch: fetchSpy });
  assert.equal(noToken.ok, false);
  assert.equal(noToken.broadcastId, "1930412345678901234");
  assert.match(noToken.summary, /missing X_BEARER_TOKEN/);

  const badId = await setXLiveBroadcastRule({ X_BEARER_TOKEN: "t" }, "nonsense", { fetch: fetchSpy });
  assert.equal(badId.ok, false);
  assert.match(badId.summary, /invalid X live broadcast URL or post id/);
  assert.equal(fetchCalls, 0);
});

test("clearXLiveBroadcastRules deletes only xlive-tagged rules", async () => {
  const calls = [];
  const result = await clearXLiveBroadcastRules(
    { X_BEARER_TOKEN: "SECRET_TOKEN" },
    {
      fetch: async (url, options = {}) => {
        const method = options.method || "GET";
        calls.push({ method, body: options.body ? JSON.parse(options.body) : null });
        if (method === "GET") {
          const afterDelete = calls.some((call) => call.body?.delete);
          return new Response(
            JSON.stringify({
              data: afterDelete
                ? [{ id: "100", tag: "challenge-watch", value: "from:MarketBubble" }]
                : [
                    { id: "100", tag: "challenge-watch", value: "from:MarketBubble" },
                    { id: "991", tag: "xlive:1930412345678901234", value: "conversation_id:1930412345678901234" }
                  ]
            }),
            { status: 200 }
          );
        }
        return new Response("{}", { status: 200 });
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.deleted, 1);
  const deleteCall = calls.find((call) => call.body?.delete);
  assert.deepEqual(deleteCall.body.delete.ids, ["991"]);
  assert.equal(result.rules.rules.some((rule) => rule.tag.startsWith("xlive:")), false);
});

test("xliveStatusForStreamState maps shared-stream states to xlive source status", () => {
  assert.deepEqual(xliveStatusForStreamState("connected", ""), {
    state: "idle",
    detail: "no live broadcast set",
    broadcastId: null,
    diagnostics: null
  });

  const live = xliveStatusForStreamState("connected", "1930412345678901234");
  assert.equal(live.state, "live");
  assert.equal(live.broadcastId, "1930412345678901234");
  assert.equal(live.ruleTag, "xlive:1930412345678901234");
  assert.match(live.detail, /shared X stream/);

  assert.equal(xliveStatusForStreamState("connecting", "1").state, "connecting");
  assert.equal(xliveStatusForStreamState("missing", "1").state, "missing");
  assert.equal(xliveStatusForStreamState("disabled", "1").state, "disabled");
  assert.equal(xliveStatusForStreamState("paused", "1").state, "paused");
  assert.equal(xliveStatusForStreamState("reconnecting", "1").state, "reconnecting");
});

test("startXConnector publishes xlive status alongside x and supports runtime broadcast updates", () => {
  const statuses = [];
  const connector = startXConnector(
    {
      setSourceStatus(source, status) {
        statuses.push({ source, status });
      },
      addMessage() {}
    },
    { X_BEARER_TOKEN: "" } // local default: stream disabled, no fetch
  );

  const firstXLive = statuses.find((entry) => entry.source === "xlive");
  assert.equal(firstXLive.status.state, "idle");
  assert.equal(firstXLive.status.detail, "no live broadcast set");
  assert.equal(connector.snapshot().xlive.broadcastId, null);

  const applied = connector.setXLiveBroadcast("https://x.com/blknoiz06/status/1930412345678901234");
  assert.equal(applied, "1930412345678901234");
  const updated = statuses.filter((entry) => entry.source === "xlive").pop();
  assert.equal(updated.status.state, "disabled");
  assert.match(updated.status.detail, /1930412345678901234/);
  assert.equal(connector.snapshot().xlive.broadcastId, "1930412345678901234");

  connector.setXLiveBroadcast("");
  const cleared = statuses.filter((entry) => entry.source === "xlive").pop();
  assert.equal(cleared.status.state, "idle");
  connector.stop();
});

test("startXConnector seeds the broadcast from X_LIVE_BROADCAST_ID", () => {
  const statuses = [];
  const connector = startXConnector(
    {
      setSourceStatus(source, status) {
        statuses.push({ source, status });
      },
      addMessage() {}
    },
    { X_BEARER_TOKEN: "", X_LIVE_BROADCAST_ID: "https://x.com/blknoiz06/status/1930412345678901234" }
  );

  const xlive = statuses.find((entry) => entry.source === "xlive");
  assert.equal(xlive.status.broadcastId, "1930412345678901234");
  assert.equal(connector.snapshot().xlive.broadcastId, "1930412345678901234");
  connector.stop();
});

test("demo connector emits xlive-labeled messages and marks the xlive source", async (t) => {
  const messages = [];
  const statuses = [];
  const hub = {
    addMessage(message) {
      messages.push(message);
    },
    setSourceStatus(source, status) {
      statuses.push({ source, status });
    }
  };
  const demo = createDemoConnector(hub, { intervalMs: 1 });
  demo.start();
  t.after(() => demo.stop());

  await waitFor(() => messages.some((message) => message.source === "xlive"));
  const xliveMessage = messages.find((message) => message.source === "xlive");

  assert.equal(xliveMessage.sourceLabel, "X Live");
  assert.equal(xliveMessage.mode, "demo");
  assert.ok(xliveMessage.content.length > 0);
  assert.equal(statuses.some((entry) => entry.source === "xlive" && entry.status.state === "demo"), true);
});

test("POST /api/xlive/broadcast gates on admin token, persists, and updates xlive status", async (t) => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stateDir = await mkdtemp(join(tmpdir(), "bubblewire-xlive-"));
  const xliveFile = join(stateDir, "xlive.json");
  let stdout = "";
  let stderr = "";

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ADMIN_TOKEN: "test-admin",
      DEMO_MODE: "off",
      HISTORY: "off",
      HOST: "127.0.0.1",
      PORT: String(port),
      X_BEARER_TOKEN: "",
      X_LIVE_BROADCAST_ID: "",
      X_STREAM_ENABLED: "off",
      XLIVE_FILE: xliveFile
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  t.after(async () => {
    await stopChild(child);
    await rm(stateDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => stdout, () => stderr);

  // Boot state: xlive registered, idle, no broadcast.
  const before = await getJson(`${baseUrl}/status.json`);
  assert.equal(before.status.xlive.state, "idle");
  assert.equal(before.status.xlive.detail, "no live broadcast set");
  assert.ok(before.stats.sources.xlive);
  assert.ok(before.proof.sources.xlive);
  assert.equal(before.proof.sources.xlive.label, "X Live");
  assert.equal(before.sources.xlive.label, "X Live");

  // Admin gate.
  const unauthorized = await sendJsonRequest("POST", `${baseUrl}/api/xlive/broadcast`, {
    url: "https://x.com/blknoiz06/status/1930412345678901234"
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await sendJsonRequest(
    "POST",
    `${baseUrl}/api/xlive/broadcast`,
    { url: "https://example.com/nope" },
    { "x-admin-token": "test-admin" }
  );
  assert.equal(invalid.status, 400);

  // Configure by URL.
  const set = await sendJsonRequest(
    "POST",
    `${baseUrl}/api/xlive/broadcast`,
    { url: "https://x.com/blknoiz06/status/1930412345678901234?s=20" },
    { "x-admin-token": "test-admin" }
  );
  assert.equal(set.status, 200);
  assert.equal(set.body.ok, true);
  assert.equal(set.body.broadcastId, "1930412345678901234");
  assert.deepEqual(set.body.rule, {
    value: "conversation_id:1930412345678901234",
    tag: "xlive:1930412345678901234"
  });
  // No bearer token in this test, so the rule cannot reach X — reported honestly.
  assert.equal(set.body.rules.ok, false);
  assert.match(set.body.rules.summary, /missing X_BEARER_TOKEN/);

  // Persistence.
  const persisted = JSON.parse(await readFile(xliveFile, "utf8"));
  assert.equal(persisted.broadcastId, "1930412345678901234");

  // Public snapshot + setup wiring.
  const snapshot = await getJson(`${baseUrl}/api/xlive/broadcast`);
  assert.equal(snapshot.broadcastId, "1930412345678901234");
  assert.equal(snapshot.configured, true);

  const status = await getJson(`${baseUrl}/status.json`);
  assert.equal(status.status.xlive.broadcastId, "1930412345678901234");
  assert.notEqual(status.status.xlive.state, "idle");

  const setup = await getJson(`${baseUrl}/setup.json`);
  assert.equal(setup.sources.xlive.broadcastId, "1930412345678901234");
  assert.equal(setup.sources.xlive.configured, true);
  assert.equal(setup.sources.xlive.rule.value, "conversation_id:1930412345678901234");
  assert.equal(setup.sources.xlive.control.endpoint, "/api/xlive/broadcast");
  assert.doesNotMatch(JSON.stringify(setup), /test-admin/);

  // Clear via action and via DELETE.
  const cleared = await sendJsonRequest(
    "POST",
    `${baseUrl}/api/xlive/broadcast`,
    { action: "clear" },
    { "x-admin-token": "test-admin" }
  );
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.broadcastId, null);
  assert.equal(JSON.parse(await readFile(xliveFile, "utf8")).broadcastId, null);

  const after = await getJson(`${baseUrl}/status.json`);
  assert.equal(after.status.xlive.state, "idle");

  const deleteUnauthorized = await sendJsonRequest("DELETE", `${baseUrl}/api/xlive/broadcast`, {});
  assert.equal(deleteUnauthorized.status, 401);
  const deleteOk = await sendJsonRequest("DELETE", `${baseUrl}/api/xlive/broadcast`, {}, { "x-admin-token": "test-admin" });
  assert.equal(deleteOk.status, 200);
  assert.equal(deleteOk.body.broadcastId, null);
});

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition was not met");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl, child, readStdout, readStderr) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early\nstdout:\n${readStdout()}\nstderr:\n${readStderr()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`server did not start\nstdout:\n${readStdout()}\nstderr:\n${readStderr()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;

  child.kill("SIGTERM");
  const result = await Promise.race([
    once(child, "exit").then(() => "exit"),
    delay(1000).then(() => "timeout")
  ]);

  if (result === "timeout" && child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  return response.json();
}

async function sendJsonRequest(method, url, body, headers = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  const rawBody = await response.text();
  return {
    status: response.status,
    body: rawBody ? parseMaybeJson(rawBody) : {}
  };
}

function parseMaybeJson(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { rawBody };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
