import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.BUBBLEWIRE_URL || "http://127.0.0.1:3000";
const expectedSources = parseList(process.env.BUBBLEWIRE_EXPECT_SOURCES);
const postKickProof = process.env.BUBBLEWIRE_PROOF_KICK !== "0";
const outputDir = new URL("../docs/evidence/logs/", import.meta.url);
const outputFile = new URL("live-proof.json", outputDir);

const proof = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  checks: [],
  snapshots: {},
  result: "pending"
};

await mkdir(outputDir, { recursive: true });

try {
  proof.snapshots.healthz = await getJson("/healthz");
  await checkTextRoute("/overlay.html", "overlay HTML");
  await checkTextRoute("/export.ndjson", "NDJSON export");
  await checkSseRoute("/events.stream");

  const beforeSnapshot = await getJson("/status.json");
  proof.snapshots.before = summarizeSnapshot(beforeSnapshot);
  checkRuntime(beforeSnapshot, "before");

  await expectRejectedPost("/demo-spike.json", {});
  await expectRejectedPost("/demo-start.json", {});
  await expectRejectedPost("/inject.json", {
    source: "x",
    author: "synthetic",
    content: "synthetic message should not enter live-only feed"
  });

  if (postKickProof) await postKickWebhook();

  const afterSnapshot = expectedSources.length
    ? await waitForExpectedSources()
    : await getJson("/status.json");
  proof.snapshots.after = summarizeSnapshot(afterSnapshot);
  checkRuntime(afterSnapshot, "after");
  checkExpectedSources(afterSnapshot);
  pass("live-only smoke");
  proof.result = "pass";
} catch (error) {
  fail("live-only smoke", error.message);
  proof.result = "fail";
}

await writeFile(outputFile, `${JSON.stringify(proof, null, 2)}\n`);
console.log(`Live proof ${proof.result}: ${outputFile.pathname}`);

if (proof.result !== "pass") process.exit(1);

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await readJson(response);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return body;
}

async function expectRejectedPost(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await readJson(response);
  proof.checks.push({
    name: `${path} rejects synthetic input`,
    status: response.status,
    body
  });
  if (response.status !== 409) {
    throw new Error(`${path} returned HTTP ${response.status}; expected 409`);
  }
}

async function postKickWebhook() {
  const messageId = `live-proof-${Date.now()}`;
  const response = await fetch(`${baseUrl}/kick.webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Kick-Event-Type": "chat.message.sent"
    },
    body: JSON.stringify({
      message_id: messageId,
      broadcaster: { username: "marketbubble", channel_slug: "marketbubble" },
      sender: {
        username: "proofjudge",
        channel_slug: "proofjudge",
        is_verified: true,
        identity: { username_color: "#53FC18", badges: [{ text: "Reviewer" }] }
      },
      content: "Kick webhook live proof event",
      created_at: new Date().toISOString()
    })
  });
  const body = await readJson(response);
  proof.checks.push({
    name: "/kick.webhook accepts live webhook-shaped input",
    status: response.status,
    body
  });
  if (response.status !== 200) {
    throw new Error(`/kick.webhook returned HTTP ${response.status}; expected 200`);
  }
}

async function checkTextRoute(path, name) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.text();
  proof.checks.push({
    name,
    status: response.status,
    bytes: body.length
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
}

async function checkSseRoute(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
  const reader = response.body?.getReader();
  const firstChunk = reader ? await reader.read() : { value: new Uint8Array() };
  await reader?.cancel();
  clearTimeout(timeout);

  proof.checks.push({
    name: "SSE stream opens",
    status: response.status,
    contentType: response.headers.get("content-type"),
    firstChunkBytes: firstChunk.value?.length || 0
  });

  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error(`${path} did not return text/event-stream`);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function checkRuntime(snapshot, label) {
  const failures = [];
  if (snapshot.runtime?.demoEnabled !== false) failures.push("runtime.demoEnabled is not false");
  if (snapshot.runtime?.demoMode !== "off") failures.push("runtime.demoMode is not off");
  if (snapshot.runtime?.liveOnly !== true) failures.push("runtime.liveOnly is not true");
  if (snapshot.runtime?.demoRunning !== false) failures.push("runtime.demoRunning is not false");
  if ((snapshot.messages || []).some((message) => message.mode === "demo" || message.source === "demo")) {
    failures.push("demo messages present");
  }

  proof.checks.push({
    name: `${label} runtime is live-only`,
    status: failures.length ? "fail" : "pass",
    runtime: snapshot.runtime,
    totalMessages: snapshot.stats?.totalMessages || 0,
    demoMessages: (snapshot.messages || []).filter((message) => (
      message.mode === "demo" || message.source === "demo"
    )).length
  });

  if (failures.length) throw new Error(`${label}: ${failures.join("; ")}`);
}

function summarizeSnapshot(snapshot) {
  return {
    runtime: snapshot.runtime,
    status: snapshot.status,
    stats: snapshot.stats,
    sampleMessages: (snapshot.messages || []).slice(0, 12).map((message) => ({
      id: message.id,
      source: message.source,
      sourceLabel: message.sourceLabel,
      channel: message.channel,
      content: truncate(message.content, 160),
      mode: message.mode,
      receivedAt: message.receivedAt,
      url: message.url,
      badges: message.badges || []
    }))
  };
}

function truncate(value = "", maxLength) {
  const text = String(value);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

async function waitForExpectedSources() {
  const deadline = Date.now() + Number(process.env.BUBBLEWIRE_EXPECT_TIMEOUT_MS || 45000);
  let snapshot = await getJson("/status.json");

  while (Date.now() < deadline) {
    if (expectedSources.every((source) => sourceIsLive(snapshot, source))) return snapshot;
    await delay(1500);
    snapshot = await getJson("/status.json");
  }

  return snapshot;
}

function checkExpectedSources(snapshot) {
  if (expectedSources.length === 0) return;

  const failures = expectedSources.filter((source) => !sourceIsLive(snapshot, source));
  proof.checks.push({
    name: "expected live sources are present",
    status: failures.length ? "fail" : "pass",
    expectedSources,
    sourceStatus: snapshot.status,
    sourceCounts: Object.fromEntries(
      Object.entries(snapshot.stats?.sources || {}).map(([source, stats]) => [source, stats.count])
    )
  });

  if (failures.length) {
    throw new Error(`expected live source evidence missing for: ${failures.join(", ")}`);
  }
}

function sourceIsLive(snapshot, source) {
  const status = snapshot.status?.[source]?.state;
  const count = snapshot.stats?.sources?.[source]?.count || 0;
  return status === "connected" && count > 0;
}

function pass(name) {
  proof.checks.push({ name, status: "pass" });
}

function fail(name, detail) {
  proof.checks.push({ name, status: "fail", detail });
}

function parseList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
