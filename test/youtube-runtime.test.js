import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("POST /api/youtube/live gates on admin token, persists, and updates YouTube setup", async (t) => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stateDir = await mkdtemp(join(tmpdir(), "bubblewire-youtube-"));
  const youtubeFile = join(stateDir, "youtube.json");
  let stdout = "";
  let stderr = "";

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ADMIN_TOKEN: "test-admin",
      DEMO_MODE: "off",
      HOST: "127.0.0.1",
      PORT: String(port),
      YOUTUBE_FILE: youtubeFile,
      YOUTUBE_API_KEY: ""
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

  const before = await getJson(`${baseUrl}/status.json`);
  assert.ok(before.stats.sources.youtube);
  assert.ok(before.proof.sources.youtube);
  assert.equal(before.sources.youtube.label, "YouTube");
  assert.equal(before.status.youtube.state, "missing");

  const unauthorized = await sendJsonRequest("POST", `${baseUrl}/api/youtube/live`, {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  });
  assert.equal(unauthorized.status, 401);

  const set = await sendJsonRequest(
    "POST",
    `${baseUrl}/api/youtube/live`,
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "x-admin-token": "test-admin" }
  );
  assert.equal(set.status, 200);
  assert.equal(set.body.ok, true);
  assert.equal(set.body.videoId, "dQw4w9WgXcQ");
  assert.equal(set.body.channelHandle, null);
  assert.equal(set.body.configured, true);

  const persisted = JSON.parse(await readFile(youtubeFile, "utf8"));
  assert.equal(persisted.videoId, "dQw4w9WgXcQ");
  assert.equal(persisted.liveChatId, null);
  assert.equal(persisted.channelHandle, null);

  const setup = await getJson(`${baseUrl}/setup.json`);
  assert.equal(setup.sources.youtube.videoId, "dQw4w9WgXcQ");
  assert.equal(setup.sources.youtube.configured, true);
  assert.equal(setup.sources.youtube.control.endpoint, "/api/youtube/live");
  assert.equal(setup.sources.youtube.vars.YOUTUBE_API_KEY, false);
  assert.match(setup.sources.youtube.status.detail, /missing YOUTUBE_API_KEY/);

  const setHandle = await sendJsonRequest(
    "POST",
    `${baseUrl}/api/youtube/live`,
    { handle: "@notthreadguy" },
    { "x-admin-token": "test-admin" }
  );
  assert.equal(setHandle.status, 200);
  assert.equal(setHandle.body.ok, true);
  assert.equal(setHandle.body.channelHandle, "notthreadguy");
  assert.equal(setHandle.body.configured, true);

  const persistedHandle = JSON.parse(await readFile(youtubeFile, "utf8"));
  assert.equal(persistedHandle.videoId, null);
  assert.equal(persistedHandle.liveChatId, null);
  assert.equal(persistedHandle.channelHandle, "notthreadguy");

  const clear = await sendJsonRequest(
    "POST",
    `${baseUrl}/api/youtube/live`,
    { action: "clear" },
    { "x-admin-token": "test-admin" }
  );
  assert.equal(clear.status, 200);
  assert.equal(clear.body.configured, false);
  assert.deepEqual(JSON.parse(await readFile(youtubeFile, "utf8")), {
    videoId: null,
    liveChatId: null,
    channelId: null,
    channelHandle: null
  });
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

async function sendJsonRequest(method, url, body, headers = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
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
