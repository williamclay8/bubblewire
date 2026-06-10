// Bubblewire intelligence layer — zero-dependency, heuristic, server-side.
// Everything here is transparent rule-based scoring over normalized message
// text. It is intentionally labeled "heuristic" in the UI; it does not claim
// to be a trained model. Pure functions where possible so it is unit-testable.

const SOURCES = ["twitch", "youtube", "x", "xlive", "kick"];

// Compact sentiment lexicon tuned for livestream chat, not prose. Weighted.
const POSITIVE = {
  pog: 2, poggers: 2, pogchamp: 2, lets: 1, letsgo: 2, lfg: 2, hype: 2, hyped: 2,
  w: 1.5, dub: 1.5, goat: 2, clutch: 2, insane: 1.5, cracked: 1.5, clean: 1, nice: 1,
  love: 2, lovely: 1.5, amazing: 2, great: 1.5, good: 1, gg: 1.5, ggs: 1.5, based: 1.5,
  king: 1.5, queen: 1.5, legend: 2, fire: 1.5, banger: 2, sheesh: 1.5, ez: 1, easy: 1,
  congrats: 2, congratulations: 2, beautiful: 1.5, happy: 1.5, win: 1.5, winning: 1.5,
  yes: 1, yay: 1.5, cute: 1.5, wholesome: 2, respect: 1.5, thanks: 1.5, ty: 1, glhf: 1
};

const NEGATIVE = {
  l: 1.5, ratio: 1.5, trash: 2, garbage: 2, mid: 1.5, cringe: 2, boring: 1.5, bad: 1.5,
  worst: 2, terrible: 2, awful: 2, hate: 2, hated: 2, gross: 1.5, yikes: 1.5, oof: 1,
  rip: 1, dead: 1, throw: 1.5, throwing: 2, choke: 1.5, choked: 2, lost: 1, lose: 1.5,
  losing: 1.5, fail: 1.5, fails: 1.5, scam: 2, fake: 1.5, lame: 1.5, annoying: 1.5,
  toxic: 2, mad: 1.5, angry: 1.5, cry: 1, crying: 1.5, copium: 1.5, washed: 1.5,
  overrated: 1.5, disappointing: 2, broken: 1, laggy: 1.5, lag: 1, sad: 1.5, sus: 1
};

const NEGATORS = new Set(["not", "no", "never", "dont", "didnt", "isnt", "aint", "cant", "wont"]);

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been", "to",
  "of", "in", "on", "at", "for", "with", "as", "by", "it", "its", "this", "that", "these",
  "those", "i", "im", "you", "your", "youre", "he", "she", "they", "we", "me", "my", "mine",
  "him", "her", "them", "us", "do", "does", "did", "so", "if", "then", "than", "just", "like",
  "got", "get", "gonna", "wanna", "yeah", "yes", "no", "ok", "okay", "lol", "lmao", "lmfao",
  "bro", "guys", "chat", "stream", "streamer", "yall", "what", "when", "why", "how", "who",
  "all", "out", "up", "now", "one", "even", "really", "very", "too", "from", "about", "guy",
  "man", "dude", "omg", "wtf", "idk", "tho", "though", "still", "gonna", "going", "go", "can"
]);

const QUESTION_STARTERS = new Set([
  "what", "why", "how", "when", "where", "who", "which", "can", "could", "would", "should",
  "is", "are", "do", "does", "did", "will", "has", "have", "any", "anyone"
]);

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^a-z0-9$#'\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^['#]+|['#]+$/g, ""))
    .filter(Boolean);
}

// Returns a per-message sentiment score in roughly [-1, 1].
export function scoreSentiment(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { score: 0, hits: 0 };

  let raw = 0;
  let hits = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    let value = 0;
    if (POSITIVE[token]) value = POSITIVE[token];
    else if (NEGATIVE[token]) value = -NEGATIVE[token];
    if (value === 0) continue;

    const prev = tokens[i - 1];
    if (prev && NEGATORS.has(prev)) value *= -0.85;
    raw += value;
    hits += 1;
  }

  if (hits === 0) {
    // Fall back to punctuation/caps energy with no polarity signal.
    return { score: 0, hits: 0 };
  }
  // Squash to [-1, 1] so a single strong word doesn't dominate.
  const score = Math.max(-1, Math.min(1, raw / (hits + 1.5)));
  return { score, hits };
}

const MOOD_BANDS = [
  { min: 0.45, label: "hyped", tone: "pos" },
  { min: 0.15, label: "positive", tone: "pos" },
  { min: -0.15, label: "neutral", tone: "neutral" },
  { min: -0.45, label: "restless", tone: "neg" },
  { min: -Infinity, label: "negative", tone: "neg" }
];

export function moodForScore(score, sampleSize) {
  if (!sampleSize) return { label: "quiet", tone: "neutral", score: 0 };
  const band = MOOD_BANDS.find((entry) => score >= entry.min) || MOOD_BANDS[MOOD_BANDS.length - 1];
  return { label: band.label, tone: band.tone, score };
}

export function createAnalyzer(options = {}) {
  const now = options.now || (() => Date.now());
  const windowMs = options.windowMs || 90000; // 90s rolling window
  const ewmaAlpha = options.ewmaAlpha || 0.08;
  const maxMoments = options.maxMoments || 12;
  const maxTrend = options.maxTrend || 8;

  // Per-source rolling buffers of { t, score, hits }
  const buffers = Object.fromEntries(SOURCES.map((s) => [s, []]));
  const ewma = Object.fromEntries(SOURCES.map((s) => [s, 0]));
  const ewmaReady = Object.fromEntries(SOURCES.map((s) => [s, false]));
  // term -> { total, sources:Set, lastAt }
  const termWindow = []; // { t, terms:[], source }
  const moments = [];
  let lastMomentAt = 0;
  let messagesSeen = 0;

  function ingest(message) {
    if (!message || !SOURCES.includes(message.source)) return;
    const t = toMs(message.receivedAt);
    const { score, hits } = scoreSentiment(message.content);
    messagesSeen += 1;

    buffers[message.source].push({ t, score, hits });
    if (hits > 0) {
      ewma[message.source] = ewmaReady[message.source]
        ? ewma[message.source] + ewmaAlpha * (score - ewma[message.source])
        : score;
      ewmaReady[message.source] = true;
    }

    const terms = topTermsFromTokens(tokenize(message.content));
    termWindow.push({ t, terms, source: message.source });

    prune(t);
    detectMoment(message, t);
  }

  function prune(t) {
    const cutoff = t - windowMs;
    for (const source of SOURCES) {
      const buffer = buffers[source];
      let drop = 0;
      while (drop < buffer.length && buffer[drop].t < cutoff) drop += 1;
      if (drop > 0) buffer.splice(0, drop);
    }
    let dropTerms = 0;
    while (dropTerms < termWindow.length && termWindow[dropTerms].t < cutoff) dropTerms += 1;
    if (dropTerms > 0) termWindow.splice(0, dropTerms);
  }

  // A "moment" = a sentiment-laden message during elevated activity. We mark
  // the triggering message so it can be clipped/jumped-to.
  function detectMoment(message, t) {
    const recent = allRecent(t, 10000).length;
    const heat = message.heat || 0;
    const sentiment = scoreSentiment(message.content);
    const strong = Math.abs(sentiment.score) >= 0.5 && sentiment.hits >= 1;
    const spikey = recent >= 6;
    const veryHot = heat >= 45;

    if ((strong && (spikey || veryHot)) || (veryHot && spikey)) {
      if (t - lastMomentAt < 8000) return; // throttle
      lastMomentAt = t;
      moments.unshift({
        id: message.id,
        at: message.receivedAt,
        source: message.source,
        sourceLabel: message.sourceLabel,
        author: message.author?.name || "unknown",
        content: String(message.content).slice(0, 140),
        heat,
        tone: sentiment.score > 0 ? "pos" : sentiment.score < 0 ? "neg" : "neutral",
        rate10s: recent,
        reason: veryHot && strong ? "hot + charged" : spikey ? "spike" : "charged"
      });
      moments.splice(maxMoments);
    }
  }

  function allRecent(t, ms) {
    const cutoff = t - ms;
    const out = [];
    for (const source of SOURCES) {
      for (const entry of buffers[source]) {
        if (entry.t >= cutoff) out.push(entry);
      }
    }
    return out;
  }

  function snapshot() {
    const t = now();
    prune(t);

    const sources = {};
    let blendNum = 0;
    let blendDen = 0;
    for (const source of SOURCES) {
      const buffer = buffers[source];
      const sampled = buffer.filter((entry) => entry.hits > 0);
      const avg = sampled.length
        ? sampled.reduce((sum, entry) => sum + entry.score, 0) / sampled.length
        : 0;
      const blended = ewmaReady[source] ? ewma[source] * 0.6 + avg * 0.4 : avg;
      const mood = moodForScore(blended, buffer.length);
      sources[source] = {
        mood: mood.label,
        tone: mood.tone,
        score: round(blended),
        samples: buffer.length,
        scored: sampled.length
      };
      if (buffer.length) {
        blendNum += blended * buffer.length;
        blendDen += buffer.length;
      }
    }

    const overallScore = blendDen ? blendNum / blendDen : 0;
    const overallMood = moodForScore(overallScore, blendDen);

    return {
      updatedAt: new Date(t).toISOString(),
      windowSeconds: Math.round(windowMs / 1000),
      method: "heuristic-lexicon",
      overall: { mood: overallMood.label, tone: overallMood.tone, score: round(overallScore), samples: blendDen },
      sources,
      moments: moments.slice(0, maxMoments),
      questions: surfaceQuestions(t),
      trends: surfaceTrends(t)
    };
  }

  // Surface unanswered-looking questions: recent interrogatives, deduped by
  // normalized text, freshest first.
  const questionLog = [];
  function noteQuestion(message, t) {
    const text = String(message.content).trim();
    if (text.length < 6 || text.length > 160) return;
    const tokens = tokenize(text);
    const looksQuestion = text.includes("?") || (tokens[0] && QUESTION_STARTERS.has(tokens[0]));
    if (!looksQuestion) return;
    const key = tokens.slice(0, 8).join(" ");
    if (questionLog.some((q) => q.key === key)) return;
    questionLog.unshift({
      key,
      id: message.id,
      at: message.receivedAt,
      source: message.source,
      sourceLabel: message.sourceLabel,
      author: message.author?.name || "unknown",
      content: text.slice(0, 160),
      t
    });
    questionLog.splice(20);
  }

  function surfaceQuestions(t) {
    const cutoff = t - windowMs * 2;
    return questionLog
      .filter((q) => q.t >= cutoff)
      .slice(0, 6)
      .map(({ key, t: _t, ...rest }) => rest);
  }

  // Trending terms: frequency in window, with a cross-platform bonus so a term
  // appearing on multiple sources ranks above a single-channel spam term.
  function surfaceTrends(t) {
    const counts = new Map();
    for (const entry of termWindow) {
      for (const term of entry.terms) {
        const record = counts.get(term) || { term, total: 0, sources: new Set() };
        record.total += 1;
        record.sources.add(entry.source);
        counts.set(term, record);
      }
    }
    // Floor scales with volume: low-traffic windows surface 2+ mentions, busy
    // channels demand 3+ so a single spammed term doesn't dominate.
    const minMentions = termWindow.length > 40 ? 3 : 2;
    return [...counts.values()]
      .filter((record) => record.total >= minMentions || record.sources.size >= 2)
      .map((record) => ({
        term: record.term,
        count: record.total,
        sources: [...record.sources],
        crossPlatform: record.sources.size >= 2,
        score: record.total * (1 + (record.sources.size - 1) * 0.6)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTrend);
  }

  // Wrap ingest so questions get logged on the same pass.
  function ingestFull(message) {
    if (!message || !SOURCES.includes(message.source)) return;
    ingest(message);
    noteQuestion(message, toMs(message.receivedAt));
  }

  return { ingest: ingestFull, snapshot, get messagesSeen() { return messagesSeen; } };
}

function topTermsFromTokens(tokens) {
  const seen = new Set();
  const terms = [];
  for (const token of tokens) {
    const isCashtag = token.startsWith("$") && token.length >= 2;
    const clean = isCashtag ? token : token.replace(/[^a-z0-9]/g, "");
    if (clean.length < 3 && !isCashtag) continue;
    if (STOPWORDS.has(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    terms.push(clean);
  }
  return terms.slice(0, 12);
}

function toMs(value) {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
