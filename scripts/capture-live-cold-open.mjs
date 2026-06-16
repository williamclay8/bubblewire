import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = fileURLToPath(new URL("..", import.meta.url));
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const target = process.env.BUBBLEWIRE_VIDEO_URL || "https://bubblewire.xyz";
const outputDir = process.env.OUTPUT_DIR || join(root, "docs/evidence/video/market-bubble-live-2026-06-11");
const frameDir = join(outputDir, "frames");
const width = Number(process.env.CAPTURE_WIDTH || 1920);
const height = Number(process.env.CAPTURE_HEIGHT || 1080);
const captureFps = Number(process.env.CAPTURE_FPS || 5);
const frameIntervalMs = Math.max(50, Math.round(1000 / captureFps));

let chrome;
let ws;
let nextId = 1;
let frameIndex = 0;
const pending = new Map();
const timeline = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await mkdir(frameDir, { recursive: true });

try {
  const port = await getFreePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "bubblewire-live-capture-chrome-"));
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
  await command("Input.setIgnoreInputEvents", { ignore: false });
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height
  });

  await navigate(`${target}/?theme=gold`);
  await waitForRows();
  await sleep(1200);
  await captureFor(7, "dashboard-live-feed");

  await click("#setupButton");
  await sleep(900);
  await captureFor(4, "setup-proof-drawer");

  await navigate(`${target}/streamer.html?theme=gold`);
  await sleep(2200);
  await captureFor(6, "streamer-mode");

  const manifest = {
    target,
    capturedAt: new Date().toISOString(),
    width,
    height,
    captureFps,
    frames: frameIndex,
    nominalDurationSeconds: frameIndex / captureFps,
    frameDir,
    timeline
  };
  await writeFile(join(outputDir, "capture-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, outputDir, frameDir, frames: frameIndex, captureFps }, null, 2));
} finally {
  try {
    ws?.close();
  } catch {}
  try {
    chrome?.kill("SIGTERM");
  } catch {}
}

async function captureFor(seconds, label) {
  const startFrame = frameIndex;
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const started = Date.now();
    await captureFrame(label);
    await sleep(Math.max(0, frameIntervalMs - (Date.now() - started)));
  }
  timeline.push({
    label,
    startFrame,
    endFrame: frameIndex - 1,
    frames: frameIndex - startFrame,
    durationSeconds: (frameIndex - startFrame) / captureFps
  });
}

async function captureFrame(label) {
  const { data } = await command("Page.captureScreenshot", { format: "png", fromSurface: true });
  const path = join(frameDir, `${String(frameIndex).padStart(5, "0")}.png`);
  await writeFile(path, Buffer.from(data, "base64"));
  frameIndex += 1;
  return { label, path };
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

async function evalPage(source) {
  const result = await command("Runtime.evaluate", {
    expression: source,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  return result.result?.value;
}

async function waitForRows(timeout = 18000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const rows = await evalPage("document.querySelectorAll('[data-message-id]').length");
    if (rows >= 3) return;
    await sleep(500);
  }
  throw new Error("Timed out waiting for live message rows");
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

function waitForChrome(port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const check = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.on("connect", () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error("Chrome did not open its debugging port"));
        else setTimeout(check, 150);
      });
    };
    check();
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("No free port"))));
    });
    server.on("error", reject);
  });
}
