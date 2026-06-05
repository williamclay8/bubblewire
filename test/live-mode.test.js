import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("DEMO_MODE=off blocks synthetic routes while keeping Kick webhooks live", async (t) => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let stdout = "";
  let stderr = "";

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DEMO_MODE: "off",
      HOST: "127.0.0.1",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  t.after(() => stopChild(child));

  await waitForServer(baseUrl, child, () => stdout, () => stderr);

  const before = await getJson(`${baseUrl}/status.json`);
  assert.deepEqual(before.runtime, {
    demoEnabled: false,
    demoMode: "off",
    demoRunning: false,
    liveOnly: true,
    watching: 0
  });
  assert.equal(before.messages.length, 0);

  const spike = await postJson(`${baseUrl}/demo-spike.json`, {});
  assert.equal(spike.status, 409);

  const start = await postJson(`${baseUrl}/demo-start.json`, {});
  assert.equal(start.status, 409);

  const inject = await postJson(`${baseUrl}/inject.json`, {
    source: "x",
    author: "synthetic",
    content: "synthetic message should not enter live-only feed"
  });
  assert.equal(inject.status, 409);

  const kick = await postJson(`${baseUrl}/kick.webhook`, {
    message_id: `live-mode-${Date.now()}`,
    broadcaster: { username: "marketbubble", channel_slug: "marketbubble" },
    sender: {
      username: "proofjudge",
      channel_slug: "proofjudge",
      is_verified: true,
      identity: { username_color: "#53FC18", badges: [{ text: "Reviewer" }] }
    },
    content: "Kick webhook stays live",
    created_at: new Date().toISOString()
  }, { "Kick-Event-Type": "chat.message.sent" });

  assert.equal(kick.status, 200);

  const after = await getJson(`${baseUrl}/status.json`);
  assert.equal(after.messages.length, 1);
  assert.equal(after.messages[0].source, "kick");
  assert.equal(after.messages[0].mode, "live");
  assert.equal(after.messages[0].evidenceLevel, "webhook-proof");
  assert.equal(after.proof.sources.kick.evidenceLevel, "webhook-proof");
  assert.equal(after.proof.sources.kick.rawType, "chat.message.sent");
  assert.equal(after.messages.some((message) => message.mode === "demo"), false);
});

test("setup.json exposes configured X rule labels without credentials", async (t) => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let stdout = "";
  let stderr = "";

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DEMO_MODE: "off",
      HOST: "127.0.0.1",
      PORT: String(port),
      X_BEARER_TOKEN: "",
      X_STREAM_RULES: "challenge: from:MarketBubble bubblewire; markets: polymarket OR kalshi"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  t.after(() => stopChild(child));

  await waitForServer(baseUrl, child, () => stdout, () => stderr);

  const setup = await getJson(`${baseUrl}/setup.json`, { "X-Forwarded-Proto": "https" });
  assert.equal(setup.sources.x.vars.X_BEARER_TOKEN, false);
  assert.equal(setup.sources.x.rules.status, "configured");
  assert.equal(setup.sources.x.rules.count, 2);
  assert.deepEqual(setup.sources.x.rules.rules.map((rule) => rule.tag), ["challenge", "markets"]);
  assert.match(setup.sources.kick.webhookUrl, /^https:\/\/127\.0\.0\.1:\d+\/kick\.webhook$/);
});

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

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
