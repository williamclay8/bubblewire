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
  assert.match(css, /\.rule-stack/);
  assert.match(css, /\.rule-row/);
});
