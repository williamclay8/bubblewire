import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("setup drawer renders sanitized X stream rules", async () => {
  const app = await readFile(`${repoRoot}/public/app.js`, "utf8");
  const css = await readFile(`${repoRoot}/public/styles.css`, "utf8");

  assert.match(app, /function ruleRows\(ruleSnapshot\)/);
  assert.match(app, /ruleSnapshot\?\.rules/);
  assert.match(app, /class="rule-row"/);
  assert.match(app, /x\.rules/);
  assert.match(app, /function xDiagnostics\(diagnostics\)/);
  assert.match(app, /xDiagnostics\(x\.diagnostics\)/);
  assert.match(app, /class="x-diagnostics"/);
  assert.match(app, /bodySnippet/);
  assert.match(app, /function xStreamControl\(x\)/);
  assert.match(app, /data-x-control/);
  assert.match(app, /\/api\/x\/control/);
  assert.match(css, /\.rule-stack/);
  assert.match(css, /\.rule-row/);
  assert.match(css, /\.x-diagnostics/);
  assert.match(css, /\.x-diagnostic-row/);
  assert.match(css, /\.x-control/);
  assert.match(css, /\.x-control-actions/);
});
