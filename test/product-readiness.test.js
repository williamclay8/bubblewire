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
  assert.match(html, /One real-time feed for Twitch, X, and Kick/);
  assert.match(html, /id="productCommand"/);
  assert.match(html, /id="productDemoButton"/);
  assert.match(html, /id="connectSourcesButton"/);
  assert.match(html, /src="\/app\.js\?v=audit-fixes-20260610b"/);

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

test("mobile product shell stays compact and feed-first in judge mode", async () => {
  const css = await readFile(`${repoRoot}/public/styles.css`, "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 820px)"));

  assert.match(css, /\.shell\s*{[\s\S]*grid-template-rows:\s*auto auto auto auto auto 1fr;/);
  assert.match(mobile, /\.product-command\s*{[^}]*padding:\s*10px;[^}]*overflow-x:\s*hidden;/);
  assert.match(mobile, /\.command-actions\s*{[^}]*grid-template-columns:\s*1fr 1fr;/);
});
