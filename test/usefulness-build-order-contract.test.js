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

test("dashboard keeps the surviving usefulness surfaces and stays decluttered", async () => {
  const [html, app] = await Promise.all([
    readFile(`${repoRoot}/public/index.html`, "utf8"),
    readFile(`${repoRoot}/public/app.js`, "utf8")
  ]);

  assert.match(app, /SAFETY_STORAGE_KEY/);
  assert.match(app, /applySafetyToMessage/);

  assert.match(html, /id="watchChips"/);
  assert.match(html, /id="pinnedList"/);

  assert.doesNotMatch(html, /id="moderatorQueue"/);
  assert.doesNotMatch(html, /id="sessionDesk"/);
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
