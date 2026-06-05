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
