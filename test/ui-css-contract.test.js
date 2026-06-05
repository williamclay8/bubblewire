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

test("mobile dashboard keeps a phone-width startup layout with a denser feed", async () => {
  const [css, html] = await Promise.all([
    readFile(`${repoRoot}/public/styles.css`, "utf8"),
    readFile(`${repoRoot}/public/index.html`, "utf8")
  ]);
  const mobile = css.slice(css.indexOf("@media (max-width: 820px)"));
  const avatarDensitySection = css.slice(css.indexOf("/* ---------- v4: avatars + density ---------- */"));

  assert.match(html, /href="\/styles\.css\?v=x-durable-20260605a"/);
  assert.match(css, /\.layout\s*{[\s\S]*grid-template-columns:\s*236px minmax\(0,\s*1fr\) 332px;/);
  assert.match(mobile, /\.shell,\s*\.topbar,\s*\.tape,\s*\.signal-stream,\s*\.layout,\s*\.rail,\s*\.feed-panel,\s*\.inspector\s*{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*hidden;/);
  assert.match(mobile, /\.overlay-link\s*{[\s\S]*width:\s*36px;[\s\S]*font-size:\s*0;/);
  assert.match(mobile, /\.overlay-link::after\s*{[\s\S]*content:\s*"↗";/);
  assert.match(mobile, /\.feed-panel\s*{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*height:\s*74vh;[^}]*height:\s*74svh;/);
  assert.match(mobile, /\.feed-head\s*{[^}]*padding:\s*10px 12px;/);
  assert.doesNotMatch(mobile, /\.proof-receipt\s*{[^}]*flex-wrap:\s*nowrap;/);
  assert.match(mobile, /\.proof-receipt\s*{[^}]*overflow-x:\s*hidden;[^}]*padding:\s*6px 10px;/);
  assert.match(mobile, /\.feed\s*{[^}]*padding:\s*6px;[^}]*gap:\s*4px;/);
  assert.match(mobile, /\.message\s*{[^}]*padding:\s*6px 9px 7px;/);
  assert.doesNotMatch(mobile, /\.msg-head\s*{[^}]*display:\s*grid;/);
  assert.match(mobile, /\.avatar,\s*\.avatar-fallback,\s*\.handle,\s*\.channel,\s*\.mode-tag,\s*\.heat,\s*\.verified,\s*\.watch-tag,\s*\.dupe-badge\s*{[^}]*display:\s*none;/);
  assert.match(avatarDensitySection, /@media \(max-width: 820px\)\s*{[\s\S]*\.avatar,\s*\.avatar-fallback,\s*\.handle,\s*\.channel,\s*\.mode-tag,\s*\.heat,\s*\.verified,\s*\.watch-tag,\s*\.dupe-badge\s*{[\s\S]*display:\s*none;/);
  assert.match(mobile, /\.author\s*{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/);
  assert.match(mobile, /\.msg-content\s*{[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.32;/);
  assert.match(mobile, /body\[data-density="compact"\]\s+\.msg-content\s*{[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.32;/);
  assert.match(css, /@media \(max-width: 540px\)\s*{[\s\S]*\.message\s*{[^}]*padding:\s*5px 7px 6px;[\s\S]*\.author\s*{[^}]*font-size:\s*11px;[\s\S]*\.msg-content\s*{[^}]*font-size:\s*11px;[^}]*line-height:\s*1\.28;[\s\S]*body\[data-density="compact"\]\s+\.msg-content\s*{[^}]*font-size:\s*11px;[^}]*line-height:\s*1\.28;/);
});
