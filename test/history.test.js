import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createHistoryLog } from "../src/core/history.js";

function fakeMessage(id, receivedAt, content = "hello") {
  return { id, source: "twitch", receivedAt, content };
}

test("history log appends and queries messages older than a cutoff", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bubblewire-history-"));
  const log = createHistoryLog({ filePath: join(dir, "feed.ndjson") });

  log.append(fakeMessage("a", "2026-06-04T10:00:00.000Z"));
  log.append(fakeMessage("b", "2026-06-04T10:00:01.000Z"));
  log.append(fakeMessage("c", "2026-06-04T10:00:02.000Z"));
  await log.flush();

  const page = await log.query({ before: "2026-06-04T10:00:02.000Z", limit: 10 });
  assert.equal(page.messages.length, 2);
  assert.equal(page.messages[0].id, "b");
  assert.equal(page.messages[1].id, "a");
  assert.equal(page.exhausted, true);

  const limited = await log.query({ before: "2026-06-04T10:00:02.000Z", limit: 1 });
  assert.equal(limited.messages.length, 1);
  assert.equal(limited.messages[0].id, "b");
  assert.equal(limited.exhausted, false);

  await rm(dir, { recursive: true, force: true });
});

test("history log dedupes ids and rotates past max size", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bubblewire-history-"));
  const a = fakeMessage("a", "2026-06-04T10:00:00.000Z", "first");
  const lineBytes = JSON.stringify(a).length + 1;
  // Budget fits two lines, so the third append rotates once and only once.
  const log = createHistoryLog({ filePath: join(dir, "feed.ndjson"), maxBytes: lineBytes * 2 + 4 });

  log.append(a);
  log.append(a);
  log.append(fakeMessage("b", "2026-06-04T10:00:01.000Z", "secnd"));
  log.append(fakeMessage("c", "2026-06-04T10:00:02.000Z", "third"));
  await log.flush();

  const page = await log.query({ before: "2026-06-04T10:00:03.000Z", limit: 10 });
  const ids = page.messages.map((message) => message.id);
  assert.deepEqual(ids, ["c", "b", "a"]);

  await rm(dir, { recursive: true, force: true });
});

test("disabled history returns empty exhausted pages", async () => {
  const log = createHistoryLog({ filePath: "", enabled: false });
  log.append(fakeMessage("a", "2026-06-04T10:00:00.000Z"));
  const page = await log.query({});
  assert.deepEqual(page, { messages: [], exhausted: true });
});
