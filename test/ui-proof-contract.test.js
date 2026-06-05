import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("dashboard exposes a live proof receipt bound to status snapshots", async () => {
  const [html, app] = await Promise.all([
    readFile(`${repoRoot}/public/index.html`, "utf8"),
    readFile(`${repoRoot}/public/app.js`, "utf8")
  ]);

  assert.match(html, /id="proofReceipt"/);
  assert.match(app, /proof:\s*\{\s*sources:\s*\{\s*\}/);
  assert.match(app, /proofReceipt:\s*document\.querySelector\("#proofReceipt"\)/);
  assert.match(app, /state\.proof\s*=\s*snapshot\.proof\s*\|\|\s*state\.proof/);
  assert.match(app, /function renderProofReceipt\(\)/);
  assert.match(app, /message\.evidenceLevel/);
  assert.match(app, /evidence-tag/);
});
