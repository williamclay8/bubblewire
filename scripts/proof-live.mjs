import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.BUBBLEWIRE_URL || "http://127.0.0.1:3000";
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
  proof.snapshots.before = await getJson("/status.json");
  checkRuntime(proof.snapshots.before, "before");

  await expectRejectedPost("/demo-spike.json", {});
  await expectRejectedPost("/demo-start.json", {});
  await expectRejectedPost("/inject.json", {
    source: "x",
    author: "synthetic",
    content: "synthetic message should not enter live-only feed"
  });

  proof.snapshots.after = await getJson("/status.json");
  checkRuntime(proof.snapshots.after, "after");
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

function pass(name) {
  proof.checks.push({ name, status: "pass" });
}

function fail(name, detail) {
  proof.checks.push({ name, status: "fail", detail });
}
