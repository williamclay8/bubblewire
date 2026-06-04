import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export function createHistoryLog(options = {}) {
  const filePath = options.filePath;
  const enabled = options.enabled !== false && Boolean(filePath);
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const rotatedPath = `${filePath}.1`;

  let queue = Promise.resolve();
  let approxBytes = null;

  function append(message) {
    if (!enabled || !message?.id) return;
    queue = queue
      .then(() => writeLine(message))
      .catch(() => {
        /* history is best-effort; never block the feed */
      });
  }

  async function writeLine(message) {
    await ensureSized();
    const line = `${JSON.stringify(message)}\n`;
    if (approxBytes + line.length > maxBytes) {
      await rename(filePath, rotatedPath).catch(() => {});
      approxBytes = 0;
    }
    await appendFile(filePath, line, "utf8");
    approxBytes += line.length;
  }

  async function ensureSized() {
    if (approxBytes !== null) return;
    await mkdir(dirname(filePath), { recursive: true }).catch(() => {});
    approxBytes = await stat(filePath).then((s) => s.size).catch(() => 0);
  }

  async function query({ before = new Date().toISOString(), limit = 80 } = {}) {
    if (!enabled) return { messages: [], exhausted: true };
    await queue.catch(() => {});

    const cutoff = new Date(before).getTime();
    const safeCutoff = Number.isNaN(cutoff) ? Date.now() : cutoff;
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80));

    const lines = [];
    for (const path of [rotatedPath, filePath]) {
      const content = await readFile(path, "utf8").catch(() => "");
      if (content) lines.push(...content.split("\n"));
    }

    const seen = new Set();
    const matches = [];
    for (const line of lines) {
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (!message?.id || seen.has(message.id)) continue;
      seen.add(message.id);
      const ts = new Date(message.receivedAt || 0).getTime();
      if (Number.isNaN(ts) || ts >= safeCutoff) continue;
      matches.push(message);
    }

    matches.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    const page = matches.slice(0, safeLimit);
    return { messages: page, exhausted: page.length < safeLimit };
  }

  async function flush() {
    await queue.catch(() => {});
  }

  return { append, query, flush, enabled };
}
