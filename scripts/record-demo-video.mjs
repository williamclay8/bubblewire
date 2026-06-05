import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = fileURLToPath(new URL("..", import.meta.url));
const frameDir = join(root, "docs/evidence/video-frames/final-cut");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const target = process.env.BUBBLEWIRE_VIDEO_URL || "https://bubblewire.xyz";
const width = 1920;
const height = 1080;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shots = [];
let chrome;
let ws;
let nextId = 1;
const pending = new Map();

await mkdir(frameDir, { recursive: true });

try {
  const port = await getFreePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "bubblewire-video-chrome-"));
  chrome = spawn(chromePath, [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-features=Translate",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "about:blank"
  ]);

  chrome.stderr.on("data", () => {});
  const page = await openPage(port, "about:blank");
  await connectCdp(page.webSocketDebuggerUrl);
  await command("Page.enable");
  await command("Runtime.enable");
  await command("DOM.enable");
  await command("Input.setIgnoreInputEvents", { ignore: false });
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height
  });

  await navigate(target);
  await evalPage(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await navigate(target);
  await sleep(1200);
  await capture("01-boot", "Boot sequence", "One real-time feed for Twitch, X, and Kick.");

  await waitForRows();
  await sleep(2600);
  await hoverFirstMessage();
  await capture("02-live-feed", "Live command center", "Twitch chat and X filtered-stream posts flow with source labels.");

  await clickFirstMessage();
  await sleep(650);
  await capture("03-proof-inspector", "Raw provenance", "Selecting a row exposes the normalized source payload and live receipt.");

  await fill("#searchInput", await usefulSearchTerm());
  await sleep(650);
  await click('[data-source-filter="twitch"]');
  await sleep(700);
  await capture("04-search-filter", "Search + source filter", "Keyboard-first filtering highlights the signal without losing context.");

  await click(".author[data-author-q]");
  await sleep(700);
  await capture("05-author-drilldown", "Author drill-down", "Click any author to isolate their messages, then Esc clears the view.");
  await key("Escape");
  await sleep(400);

  const watchTerm = await usefulSearchTerm();
  await fill("#watchInput", watchTerm);
  await click("#watchAddButton");
  await sleep(900);
  await capture("06-watchlist", "Watchlist alerts", "Terms flag matching rows and raise toasts for fast moderation.");

  await click('[data-theme-pick="matrix"]');
  await sleep(600);
  await capture("07-volume-theme", "Volume + heat rail", "The tape, radar, and heat meters surface bursts before the room scrolls past.");

  await click("#setupButton");
  await sleep(1200);
  await capture("08-setup-honesty", "Setup honesty", "The drawer shows real source status and sanitized credential checks, never secrets.");

  await navigate(`${target}/overlay-setup.html`);
  await waitForSelector("#cfgPreview");
  await setRange("#cfgMax", "9");
  await setRange("#cfgFade", "35");
  await setRange("#cfgScale", "1.3");
  await click('[data-cfg-align="bottom"]');
  await sleep(1000);
  await capture("09-overlay-config", "OBS overlay builder", "Resize, fade, align, and filter the browser-source overlay live.");

  await navigate(`${target}?theme=gold`);
  await waitForRows();
  await click("#recapButton");
  await sleep(1000);
  await capture("10-recap-close", "Recap + close", "Bubblewire captures the moment, the proof, and the broadcast.");

  await writeFile(join(frameDir, "shot-manifest.json"), JSON.stringify({ target, width, height, shots }, null, 2));
  console.log(JSON.stringify({ ok: true, frameDir, shots }, null, 2));
} finally {
  try {
    ws?.close();
  } catch {}
  try {
    chrome?.kill("SIGTERM");
  } catch {}
}

async function openPage(port, url) {
  await waitForChrome(port);
  const encoded = encodeURIComponent(url);
  let response = await fetch(`http://127.0.0.1:${port}/json/new?${encoded}`, { method: "PUT" });
  if (!response.ok) response = await fetch(`http://127.0.0.1:${port}/json/new?${encoded}`);
  if (!response.ok) throw new Error(`Could not open CDP page: ${response.status}`);
  return response.json();
}

function connectCdp(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(webSocketDebuggerUrl);
    ws.onopen = resolve;
    ws.onerror = reject;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result || {});
    };
  });
}

function command(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 15000);
  });
}

async function navigate(url) {
  await command("Page.navigate", { url });
  await sleep(1200);
}

async function evalPage(fnOrSource) {
  const expression = typeof fnOrSource === "function" ? `(${fnOrSource})()` : fnOrSource;
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  return result.result?.value;
}

async function capture(name, title, subtitle) {
  const { data } = await command("Page.captureScreenshot", { format: "png", fromSurface: true });
  const path = join(frameDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, "base64"));
  shots.push({ name, title, subtitle, path });
}

async function waitForSelector(selector, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evalPage(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${selector}`);
}

async function waitForRows(timeout = 18000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const rows = await evalPage("document.querySelectorAll('[data-message-id]').length");
    if (rows >= 3) return;
    await sleep(500);
  }
}

async function rect(selector) {
  return evalPage(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  })()`);
}

async function click(selector) {
  const box = await rect(selector);
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await command("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function hoverFirstMessage() {
  const box = await rect("[data-message-id]");
  if (!box) return;
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + box.width * 0.38, y: box.y + box.height / 2 });
}

async function clickFirstMessage() {
  await click("[data-message-id]");
}

async function fill(selector, value) {
  await evalPage(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return;
    el.focus();
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
}

async function setRange(selector, value) {
  await fill(selector, value);
}

async function key(keyName) {
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: keyName });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: keyName });
}

async function usefulSearchTerm() {
  const term = await evalPage(`(() => {
    const text = [...document.querySelectorAll("[data-message-id] .content, [data-message-id] .msg-text, [data-message-id]")]
      .map((el) => el.textContent || "")
      .join(" ")
      .toLowerCase();
    const words = text.match(/[a-z$][a-z0-9_$]{2,}/g) || [];
    return words.find((word) => !["twitch", "kick", "source", "live", "privmsg"].includes(word)) || "lol";
  })()`);
  return String(term || "lol").slice(0, 24);
}

function waitForChrome(port) {
  const deadline = Date.now() + 15000;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) return resolve();
      } catch {}
      if (Date.now() > deadline) return reject(new Error("Chrome did not start"));
      setTimeout(tick, 250);
    };
    tick();
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
