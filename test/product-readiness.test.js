import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("homepage presents Bubblewire with a compact self-serve masthead", async () => {
  const [html, app, css] = await Promise.all([
    readFile(`${repoRoot}/public/index.html`, "utf8"),
    readFile(`${repoRoot}/public/app.js`, "utf8"),
    readFile(`${repoRoot}/public/styles.css`, "utf8")
  ]);
  const publicText = `${html}\n${app}\n${css}`;

  assert.doesNotMatch(publicText, /Y Combinator|\byc\b|ycombinator/i);
  assert.match(html, /One real-time feed for Twitch, YouTube, X, and Kick/);
  assert.match(html, /id="productCommand"/);
  assert.match(html, /id="productDemoButton"/);
  assert.match(html, /id="connectSourcesButton"/);
  assert.match(html, /data-source-filter="youtube"/);
  assert.match(app, /SOURCE_ORDER = \["twitch", "youtube", "x", "xlive", "kick"\]/);
  assert.match(html, /src="\/app\.js\?v=stream-targets-20260610"/);
  assert.match(html, /href="\/styles\.css\?v=twitch-lock-20260610"/);

  assert.match(app, /ACTIVATION_STORAGE_KEY/);
  assert.match(app, /productDemoButton:\s*document\.querySelector\("#productDemoButton"\)/);
  assert.match(app, /connectSourcesButton:\s*document\.querySelector\("#connectSourcesButton"\)/);
  assert.match(app, /function renderProductSurface\(\)/);
  assert.match(app, /function trackActivation\(/);
  assert.match(app, /function runProductDemo\(\)/);

  assert.match(css, /\.product-command\s*{/);
  assert.match(css, /\.command-copy h1\s*{/);
  assert.match(css, /body\[data-judge="1"\]\s+\.product-command\s*{[\s\S]*display:\s*none\s*!important;/);
});

test("overlay configurator exposes YouTube as a source", async () => {
  const [html, app] = await Promise.all([
    readFile(`${repoRoot}/public/overlay-setup.html`, "utf8"),
    readFile(`${repoRoot}/public/overlay-setup.js`, "utf8")
  ]);

  assert.match(html, /data-cfg-source="youtube"/);
  assert.match(app, /sources:\s*\["twitch", "youtube", "x", "kick"\]/);
});

test("live message source chips carry channel context where sources can fan out", async () => {
  const [html, streamerHtml, app, streamer] = await Promise.all([
    readFile(`${repoRoot}/public/index.html`, "utf8"),
    readFile(`${repoRoot}/public/streamer.html`, "utf8"),
    readFile(`${repoRoot}/public/app.js`, "utf8"),
    readFile(`${repoRoot}/public/streamer.js`, "utf8")
  ]);

  assert.match(html, /src="\/app\.js\?v=stream-targets-20260610"/);
  assert.match(streamerHtml, /src="\/streamer\.js\?v=stream-targets-20260610"/);
  assert.match(app, /const INLINE_CHANNEL_SOURCES = new Set\(SOURCE_ORDER\);/);
  assert.doesNotMatch(app, /CHANNEL_LABELED_SOURCES/);
  assert.match(app, /function sourceChipLabel\(message\)/);
  assert.match(app, /function sourceChannelTarget\(source,\s*channel\)/);
  assert.match(app, /if \(source === "xlive"\) return clean\.replace\(\//);
  assert.match(app, /return `\$\{label\} \u00b7 \$\{sourceChannelTarget\(source,\s*channel\)\}`;/);
  assert.match(app, /<span class="src-tag">\$\{escapeHtml\(sourceChipLabel\(message\)\)\}<\/span>/);
  assert.match(app, /<span class="src-tag">\$\{escapeHtml\(sourceChipLabel\(safeMessage\)\)\}<\/span>/);
  assert.match(streamer, /const INLINE_CHANNEL_SOURCES = new Set\(SOURCE_PREFERRED_ORDER\);/);
  assert.match(streamer, /function sourceChipLabel\(message\)/);
  assert.match(streamer, /function sourceChannelTarget\(source,\s*channel\)/);
  assert.match(streamer, /sourceChipLabel\(message\)/);
});

test("production Twitch channel controls do not pretend locked env channels are removable", async () => {
  const [app, css, renderConfig] = await Promise.all([
    readFile(`${repoRoot}/public/app.js`, "utf8"),
    readFile(`${repoRoot}/public/styles.css`, "utf8"),
    readFile(`${repoRoot}/render.yaml`, "utf8")
  ]);

  assert.match(renderConfig, /value:\s*threadguy,fazebanks,marketbubble\b/);
  assert.doesNotMatch(renderConfig, /\bxqc\b/);
  assert.match(app, /function twitchChannelChip\(channel,\s*adminLocked\)/);
  assert.match(app, /twitchChannelChip\(channel,\s*setup\.adminLocked\)/);
  assert.match(app, /watch-chip-locked/);
  assert.match(css, /\.watch-chip-locked\s*{/);
});

test("mobile product shell stays compact and feed-first in judge mode", async () => {
  const css = await readFile(`${repoRoot}/public/styles.css`, "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 820px)"));

  assert.match(css, /\.shell\s*{[\s\S]*grid-template-rows:\s*auto auto auto auto auto 1fr;/);
  assert.match(mobile, /\.product-command\s*{[^}]*padding:\s*10px;[^}]*overflow-x:\s*hidden;/);
  assert.match(mobile, /\.command-actions\s*{[^}]*grid-template-columns:\s*1fr 1fr;/);
});
