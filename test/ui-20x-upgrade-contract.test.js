import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("dashboard exposes moment engine, proof console, workspace, and judge surfaces", async () => {
  const [html, app, css, server] = await Promise.all([
    readFile(`${repoRoot}/public/index.html`, "utf8"),
    readFile(`${repoRoot}/public/app.js`, "utf8"),
    readFile(`${repoRoot}/public/styles.css`, "utf8"),
    readFile(`${repoRoot}/src/server.js`, "utf8")
  ]);

  assert.match(server, /"\/judge"/);
  assert.match(app, /const isJudgeRoute = location\.pathname === "\/judge"/);

  assert.match(html, /id="momentRail"/);
  assert.match(html, /id="momentRailList"/);
  assert.match(html, /id="proofConsole"/);
  assert.match(html, /id="proofConsoleBody"/);
  assert.match(html, /id="workspacePanel"/);
  assert.match(html, /id="workspaceSummary"/);
  assert.match(html, /id="judgeBrief"/);

  assert.match(app, /function renderMomentRail\(\)/);
  assert.match(app, /function shareMoment\(/);
  assert.match(app, /function renderProofConsole\(\)/);
  assert.match(app, /function renderWorkspaceSummary\(\)/);
  assert.match(app, /function renderJudgeBrief\(\)/);
  assert.match(app, /function maskPublicUrl\(/);
  assert.match(app, /maskPublicUrl\(setupSource\.webhookUrl\)/);

  assert.match(css, /\.moment-rail\s*{/);
  assert.match(css, /\.moment-action-row\s*{/);
  assert.match(css, /\.proof-console\s*{/);
  assert.match(css, /\.workspace-panel\s*{/);
  assert.match(css, /\.judge-brief\s*{/);
  assert.match(css, /\.judge-link::after\s*{/);
});

test("overlay configurator includes broadcast presets with preset-aware URLs", async () => {
  const [html, app, css] = await Promise.all([
    readFile(`${repoRoot}/public/overlay-setup.html`, "utf8"),
    readFile(`${repoRoot}/public/overlay-setup.js`, "utf8"),
    readFile(`${repoRoot}/public/styles.css`, "utf8")
  ]);

  assert.match(html, /data-cfg-preset="broadcast"/);
  assert.match(html, /data-cfg-preset="ticker"/);
  assert.match(html, /data-cfg-preset="questions"/);
  assert.match(html, /id="cfgPresetOut"/);

  assert.match(app, /const PRESETS =/);
  assert.match(app, /function applyPreset\(/);
  assert.match(app, /params\.set\("preset", preset\)/);
  assert.match(app, /preset: "ticker"/);
  assert.match(app, /preset: "questions"/);

  const dashboardApp = await readFile(`${repoRoot}/public/app.js`, "utf8");
  assert.match(dashboardApp, /const OVERLAY_PRESETS =/);
  assert.match(dashboardApp, /const preset = OVERLAY_PRESETS\[params\.get\("preset"\)\]/);
  assert.match(dashboardApp, /params\.has\("max"\)/);

  assert.match(css, /\.preset-grid\s*{/);
  assert.match(css, /\.preset-card\.active\s*{/);
});
