import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("mobile channel hero stacks input before the watch action", async () => {
  const css = await readFile(`${repoRoot}/public/styles.css`, "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 820px)"));

  assert.match(mobile, /\.channel-hero\s*{[\s\S]*display:\s*grid;/);
  assert.match(mobile, /\.channel-hero-label\s*{[\s\S]*grid-column:\s*1\s*\/\s*2;/);
  assert.match(mobile, /\.channel-hero input\s*{[\s\S]*grid-column:\s*1\s*\/\s*-1;[\s\S]*order:\s*2;/);
  assert.match(mobile, /#heroWatchButton\s*{[\s\S]*grid-column:\s*1\s*\/\s*-1;[\s\S]*order:\s*3;/);
});

test("judge mode makes the mobile feed the first visible work surface", async () => {
  const [css, app] = await Promise.all([
    readFile(`${repoRoot}/public/styles.css`, "utf8"),
    readFile(`${repoRoot}/public/app.js`, "utf8")
  ]);
  const mobile = css.slice(css.indexOf("@media (max-width: 820px)"));

  assert.match(app, /state\.judgeMode\s*=\s*params\.get\("judge"\)\s*===\s*"1"/);
  assert.match(app, /document\.body\.dataset\.judge\s*=\s*state\.judgeMode\s*\?\s*"1"\s*:\s*"0"/);
  assert.match(app, /if\s*\(state\.judgeMode\)\s*return;/);
  assert.match(mobile, /\.feed-panel\s*{[\s\S]*order:\s*1;/);
  assert.match(mobile, /\.rail\s*{[\s\S]*order:\s*2;/);
  assert.match(mobile, /\.inspector\s*{[\s\S]*order:\s*3;/);
  assert.match(css, /body\[data-judge="1"\]\s+\.channel-hero\s*{[\s\S]*display:\s*none\s*!important;/);
});
