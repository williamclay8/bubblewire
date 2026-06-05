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

test("mobile dashboard gives the unified feed more room for live messages", async () => {
  const css = await readFile(`${repoRoot}/public/styles.css`, "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 820px)"));
  const avatarDensitySection = css.slice(css.indexOf("/* ---------- v4: avatars + density ---------- */"));

  assert.match(css, /\.layout\s*{[\s\S]*grid-template-columns:\s*236px minmax\(0,\s*1fr\) 332px;/);
  assert.match(mobile, /\.feed-panel\s*{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*height:\s*78vh;[\s\S]*height:\s*78svh;/);
  assert.match(mobile, /\.feed-head\s*{[\s\S]*padding:\s*10px 12px;/);
  assert.match(mobile, /\.proof-receipt\s*{[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto;[\s\S]*padding:\s*6px 10px;/);
  assert.match(mobile, /\.feed\s*{[\s\S]*padding:\s*6px;[\s\S]*gap:\s*4px;/);
  assert.match(mobile, /\.message\s*{[\s\S]*padding:\s*6px 9px 7px;/);
  assert.match(mobile, /\.msg-head\s*{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto auto;/);
  assert.match(mobile, /\.avatar,\s*\.avatar-fallback,\s*\.handle,\s*\.channel,\s*\.mode-tag,\s*\.heat,\s*\.verified,\s*\.watch-tag,\s*\.dupe-badge,\s*\.msg-spacer\s*{[\s\S]*display:\s*none;/);
  assert.match(avatarDensitySection, /@media \(max-width: 820px\)\s*{[\s\S]*\.avatar,\s*\.avatar-fallback,\s*\.handle,\s*\.channel,\s*\.mode-tag,\s*\.heat,\s*\.verified,\s*\.watch-tag,\s*\.dupe-badge,\s*\.msg-spacer\s*{[\s\S]*display:\s*none;/);
  assert.match(mobile, /\.author\s*{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.match(mobile, /\.msg-content\s*{[\s\S]*font-size:\s*13\.5px;[\s\S]*line-height:\s*1\.42;/);
});
