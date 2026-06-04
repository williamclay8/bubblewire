/* Bubblewire UI smoke test.
   Requires playwright-core (`npm i -D playwright-core`) plus a Chromium binary.
   Set BUBBLEWIRE_CHROMIUM to a chromium/headless_shell path, or rely on
   `npx playwright-core install chromium-headless-shell`. Skips gracefully when absent. */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.SMOKE_PORT || 3140);
const BASE = `http://127.0.0.1:${PORT}`;

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.log("ui-smoke: playwright-core not installed — skipping (npm i -D playwright-core)");
  process.exit(0);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const dataDir = await mkdtemp(join(tmpdir(), "bubblewire-smoke-"));
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: "127.0.0.1",
    DEMO_MODE: "on",
    HISTORY_FILE: join(dataDir, "feed.ndjson"),
    ADMIN_TOKEN: ""
  },
  stdio: "ignore"
});

await waitForServer();

let browser;
try {
  browser = await launchBrowser();
} catch (error) {
  console.log(`ui-smoke: no Chromium available (${error.message}) — skipping`);
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
  process.exit(0);
}

const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(BASE, { waitUntil: "load" });
  check("dashboard loads", (await page.title()).includes("Bubblewire"));

  await page.waitForSelector(".message", { timeout: 15000 });
  check("demo feed populates", true);

  const fonts = await page.evaluate(() => ({
    mono: document.fonts.check('12px "IBM Plex Mono"'),
    inter: document.fonts.check("12px Inter")
  }));
  check("self-hosted fonts active", fonts.mono && fonts.inter);

  // Search highlight
  await page.fill("#searchInput", "candle");
  await page.waitForTimeout(400);
  const markCount = await page.locator("mark").count();
  const summary = await page.textContent("#feedSummary");
  check("search filters and highlights", summary.includes('"candle"'), `marks=${markCount}`);
  await page.click("#clearSearchButton");

  // Pause actually pauses
  await page.click("#pauseButton");
  const before = await page.locator("#feedList > *").count();
  await page.waitForTimeout(3200);
  const after = await page.locator("#feedList > *").count();
  const bannerVisible = await page.locator("#pausedBanner").isVisible();
  check("pause freezes feed", before === after && bannerVisible, `rows ${before}→${after}`);
  await page.click("#pauseButton");

  // Watchlist
  await page.fill("#watchInput", "hype");
  await page.click("#watchAddButton");
  const chip = await page.locator(".watch-chip").first().textContent();
  check("watchlist chip added", chip.includes("hype"));

  // Setup drawer
  await page.click("#setupButton");
  await page.waitForSelector(".setup-section", { timeout: 5000 });
  const envRows = await page.locator(".env-row").count();
  check("setup drawer shows env status", envRows >= 8, `${envRows} env rows`);
  await page.click("#setupClose");

  // History pagination (fresh boot: everything is still in the live buffer)
  await page.click("#loadOlderButton");
  await page.waitForTimeout(700);
  const olderLabel = (await page.textContent("#loadOlderButton")).trim();
  check("history endpoint responds", /No older messages|loaded|Load older/i.test(olderLabel), olderLabel);

  // Overlay params
  const overlay = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await overlay.goto(`${BASE}/overlay.html?max=3&align=bottom&sources=twitch,kick`, { waitUntil: "load" });
  await overlay.waitForTimeout(4500);
  const overlayCount = await overlay.locator(".overlay-item").count();
  const bottomAligned = await overlay.locator(".overlay-root.align-bottom").count();
  const xTags = await overlay.locator(".overlay-item .src-tag", { hasText: /^X$/ }).count();
  check("overlay respects max/align/sources", overlayCount === 3 && bottomAligned === 1 && xTags === 0, `items=${overlayCount}`);

  // Default overlay (no params) must show the full default count, not a clamped minimum.
  const plain = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await plain.goto(`${BASE}/overlay.html`, { waitUntil: "load" });
  await plain.waitForTimeout(2500);
  const plainCount = await plain.locator(".overlay-item").count();
  check("overlay default shows multiple items", plainCount >= 4, `items=${plainCount}`);

  // Configurator page
  const cfg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await cfg.goto(`${BASE}/overlay-setup.html`, { waitUntil: "load" });
  await cfg.locator("#cfgMax").fill("9");
  await cfg.waitForTimeout(100);
  const url = await cfg.textContent("#cfgUrl");
  check("configurator builds url", url.includes("max=9"), url.trim());

  // PWA bits
  const manifest = await page.evaluate(() => fetch("/manifest.webmanifest").then((r) => r.ok));
  const sw = await page.evaluate(() => fetch("/sw.js").then((r) => r.ok));
  check("manifest + service worker served", manifest && sw);

  check("zero console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\nui-smoke: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server did not start");
}

async function launchBrowser() {
  const explicit = process.env.BUBBLEWIRE_CHROMIUM;
  if (explicit) {
    return chromium.launch({ executablePath: explicit, args: ["--no-sandbox"] });
  }
  return chromium.launch({ args: ["--no-sandbox"] });
}
