import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("server exposes stream session, proof packet, and replay surfaces", async () => {
  const [server, session] = await Promise.all([
    readFile(`${repoRoot}/src/server.js`, "utf8"),
    readFile(`${repoRoot}/src/core/session.js`, "utf8").catch(() => "")
  ]);

  assert.match(server, /"\/session\.json"/);
  assert.match(server, /"\/proof-packet\.json"/);
  assert.match(server, /"\/replay\.json"/);
  assert.match(server, /createSessionSnapshot/);
  assert.match(server, /createProofPacket/);
  assert.match(server, /createReplayBundle/);

  assert.match(session, /export function createSessionSnapshot/);
  assert.match(session, /export function createProofPacket/);
  assert.match(session, /export function createReplayBundle/);
  assert.match(session, /export function applySafetyRules/);
});

test("dashboard contains the full usefulness build order surfaces", async () => {
  const [html, app, css] = await Promise.all([
    readFile(`${repoRoot}/public/index.html`, "utf8"),
    readFile(`${repoRoot}/public/app.js`, "utf8"),
    readFile(`${repoRoot}/public/styles.css`, "utf8")
  ]);

  for (const id of [
    "sessionDesk",
    "sessionPreflight",
    "sessionProofButton",
    "moderatorQueue",
    "moderatorQueueList",
    "replayStudio",
    "replayExportButton",
    "guidedSetupPanel",
    "safetyPanel",
    "safetyBlockedInput",
    "signalPresetSelect"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  for (const symbol of [
    "SESSION_STORAGE_KEY",
    "MOD_QUEUE_STORAGE_KEY",
    "SAFETY_STORAGE_KEY",
    "SIGNAL_PRESETS",
    "renderSessionDesk",
    "renderModeratorQueue",
    "queueMessageForReview",
    "exportReplayBundle",
    "renderGuidedSetup",
    "applySafetyToMessage",
    "applySignalPreset"
  ]) {
    assert.match(app, new RegExp(symbol));
  }

  assert.match(css, /\.session-desk\s*{/);
  assert.match(css, /\.moderator-queue\s*{/);
  assert.match(css, /\.replay-studio\s*{/);
  assert.match(css, /\.guided-setup-panel\s*{/);
  assert.match(css, /\.safety-panel\s*{/);
});

test("overlay supports approved, moment, question, and featured modes", async () => {
  const [app, setup] = await Promise.all([
    readFile(`${repoRoot}/public/app.js`, "utf8"),
    readFile(`${repoRoot}/public/overlay-setup.js`, "utf8")
  ]);

  assert.match(app, /overlayConfig\.mode/);
  assert.match(app, /approvedOnly/);
  assert.match(app, /featuredIds/);
  assert.match(app, /function overlayMessages\(/);
  assert.match(app, /mode === "moments"/);
  assert.match(app, /mode === "questions"/);

  assert.match(setup, /mode: "approved"/);
  assert.match(setup, /mode: "moments"/);
  assert.match(setup, /mode: "questions"/);
});
