import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyzer, moodForScore, scoreSentiment, tokenize } from "../src/core/analysis.js";

function msg(source, content, overrides = {}) {
  return {
    id: `${source}:${Math.random().toString(36).slice(2)}`,
    source,
    sourceLabel: source[0].toUpperCase() + source.slice(1),
    author: { name: overrides.author || "tester" },
    content,
    receivedAt: overrides.receivedAt || new Date().toISOString(),
    heat: overrides.heat || 0
  };
}

test("tokenize strips urls, punctuation, and lowercases", () => {
  const tokens = tokenize("LOVE this $HYPE!! https://x.com/foo @ansem");
  assert.ok(tokens.includes("love"));
  assert.ok(tokens.includes("$hype"));
  assert.ok(tokens.includes("ansem"));
  assert.ok(!tokens.some((t) => t.includes("http")));
});

test("scoreSentiment separates positive, negative, and neutral", () => {
  assert.ok(scoreSentiment("this is insane, absolute W, pog").score > 0.3);
  assert.ok(scoreSentiment("trash call, total L, this is garbage").score < -0.3);
  assert.equal(scoreSentiment("the stream starts at noon").score, 0);
});

test("negation flips polarity", () => {
  const plain = scoreSentiment("this is good").score;
  const negated = scoreSentiment("this is not good").score;
  assert.ok(plain > 0);
  assert.ok(negated < plain);
});

test("moodForScore bands map to labels", () => {
  assert.equal(moodForScore(0.6, 10).label, "hyped");
  assert.equal(moodForScore(0.25, 10).label, "positive");
  assert.equal(moodForScore(0, 10).label, "neutral");
  assert.equal(moodForScore(-0.6, 10).label, "negative");
  assert.equal(moodForScore(0.6, 0).label, "quiet");
});

test("analyzer reports per-source mood and overall", () => {
  let clock = 1_000_000;
  const analyzer = createAnalyzer({ now: () => clock });
  for (let i = 0; i < 5; i += 1) {
    analyzer.ingest(msg("twitch", "LETSGO this is insane pog W", { receivedAt: new Date(clock).toISOString() }));
    analyzer.ingest(msg("x", "trash, total L, garbage call", { receivedAt: new Date(clock).toISOString() }));
    clock += 1000;
  }
  const snap = analyzer.snapshot();
  assert.equal(snap.method, "heuristic-lexicon");
  assert.equal(snap.sources.twitch.tone, "pos");
  assert.equal(snap.sources.x.tone, "neg");
  assert.ok(snap.overall.samples >= 10);
});

test("analyzer detects a moment during a charged spike", () => {
  let clock = 2_000_000;
  const analyzer = createAnalyzer({ now: () => clock });
  // Burst of 8 messages in 1s, one strongly charged + hot.
  for (let i = 0; i < 7; i += 1) {
    analyzer.ingest(msg("twitch", "go go go", { receivedAt: new Date(clock).toISOString() }));
    clock += 120;
  }
  analyzer.ingest(msg("twitch", "THAT WAS INSANE, absolute W, clutch GG", { receivedAt: new Date(clock).toISOString(), heat: 60 }));
  const snap = analyzer.snapshot();
  assert.ok(snap.moments.length >= 1);
  assert.ok(snap.moments[0].content.length > 0);
  assert.ok(snap.moments[0].id);
});

test("analyzer surfaces questions and dedupes them", () => {
  let clock = 3_000_000;
  const analyzer = createAnalyzer({ now: () => clock });
  analyzer.ingest(msg("kick", "how do I add my own channel?", { receivedAt: new Date(clock).toISOString() }));
  clock += 1000;
  analyzer.ingest(msg("kick", "how do I add my own channel?", { receivedAt: new Date(clock).toISOString() }));
  clock += 1000;
  analyzer.ingest(msg("x", "when is the next stream", { receivedAt: new Date(clock).toISOString() }));
  const snap = analyzer.snapshot();
  assert.equal(snap.questions.length, 2);
  assert.ok(snap.questions.every((q) => q.id && q.content));
});

test("analyzer ranks cross-platform trends above single-source terms", () => {
  let clock = 4_000_000;
  const analyzer = createAnalyzer({ now: () => clock });
  // "$hype" appears on twitch + x + kick; "spam" only on twitch (more often).
  for (let i = 0; i < 5; i += 1) {
    analyzer.ingest(msg("twitch", "spam spam spam word", { receivedAt: new Date(clock).toISOString() }));
    clock += 200;
  }
  analyzer.ingest(msg("twitch", "$hype incoming", { receivedAt: new Date(clock).toISOString() }));
  analyzer.ingest(msg("x", "$hype mention", { receivedAt: new Date(clock).toISOString() }));
  analyzer.ingest(msg("kick", "$hype again", { receivedAt: new Date(clock).toISOString() }));
  const snap = analyzer.snapshot();
  const hype = snap.trends.find((t) => t.term === "$hype");
  assert.ok(hype, "expected $hype to trend");
  assert.equal(hype.crossPlatform, true);
  assert.deepEqual([...hype.sources].sort(), ["kick", "twitch", "x"]);
});

test("analyzer ignores demo and unknown sources", () => {
  const analyzer = createAnalyzer();
  analyzer.ingest(msg("demo", "this should not count W pog"));
  analyzer.ingest({ id: "x:1", source: "x", content: "real message W", author: { name: "a" }, receivedAt: new Date().toISOString() });
  const snap = analyzer.snapshot();
  assert.equal(snap.sources.x.samples, 1);
});
