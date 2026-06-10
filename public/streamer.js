/* Bubblewire — Streamer Mode
   Second-screen glanceable view. Readable from 3 feet in 2 seconds.
   Consumes the same SSE feed as the dashboard (/events.stream) plus
   /analysis.json + /status.json for boot. Zero dependencies. */

const THEME_KEY = "bubblewire:theme:v1";
const THEMES = ["gold", "matrix", "ice", "synthwave"];
const WATCH_STORAGE_KEY = "bubblewire:watchlist:v1";
const ANSWERED_KEY = "bubblewire:streamer:answered:v1";

const NOW_TTL_MS = 90000; // items decay out of the NOW slot after ~90s
const NOW_SWAP_FACTOR = 1.15; // hysteresis: newer item must be 15% hotter to evict
const SOURCE_PREFERRED_ORDER = ["twitch", "youtube", "x", "kick", "xlive"];
const INLINE_CHANNEL_SOURCES = new Set(SOURCE_PREFERRED_ORDER);
const FALLBACK_COLORS = {
  twitch: "#9146ff",
  youtube: "#ff0033",
  x: "#f4f2ea",
  kick: "#53fc18",
  xlive: "#ff6b35",
  demo: "#d8a84a"
};
const GENERIC_SOURCE_COLOR = "#9b9483";
const MOOD_GLYPH = { hyped: "▲▲", positive: "▲", neutral: "▬", restless: "▽", negative: "▼▼", quiet: "··" };

const state = {
  sources: {}, // runtime source meta from snapshot: key -> { label, color }
  analysis: null,
  watchlist: loadWatchlist(),
  answered: loadAnswered(),
  msgTimes: [], // [{ t, source }] rolling ~150s for rate math
  lastMessage: null,
  lastMoodTone: null,
  lastMoodScore: null,
  moodDir: null, // "up" | "down" | null
  now: null, // { key, kind, score, at, render }
  nowShownKey: null,
  lastSpikeProposedAt: 0,
  lastHitProposedAt: new Map(), // term -> t
  watching: 0,
  booted: false
};

const els = {
  clock: document.getElementById("stClock"),
  link: document.getElementById("stLink"),
  linkLabel: document.getElementById("stLinkLabel"),
  watching: document.getElementById("stWatching"),
  watchingCount: document.getElementById("stWatchingCount"),
  now: document.getElementById("stNow"),
  nowKind: document.getElementById("stNowKind"),
  nowAge: document.getElementById("stNowAge"),
  nowBody: document.getElementById("stNowBody"),
  moodBody: document.getElementById("stMoodBody"),
  rateBody: document.getElementById("stRateBody"),
  rateTotal: document.getElementById("stRateTotal"),
  trendsBody: document.getElementById("stTrendsBody"),
  questionsBody: document.getElementById("stQuestionsBody"),
  pulseLine: document.getElementById("stPulseLine")
};

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const timeFormatter = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

applyTheme();
bindEvents();
connectEvents();
bootFetch();
setInterval(tick, 1000);
tick();

/* ---------- theme ---------- */

function applyTheme() {
  const params = new URLSearchParams(location.search);
  let theme = params.get("theme") || "";
  if (!THEMES.includes(theme)) {
    try {
      theme = localStorage.getItem(THEME_KEY) || "gold";
    } catch {
      theme = "gold";
    }
  }
  if (THEMES.includes(theme) && theme !== "gold") {
    document.documentElement.dataset.theme = theme;
  }
}

/* ---------- wiring ---------- */

function bindEvents() {
  els.questionsBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-question-id]");
    if (!button) return;
    markAnswered(button.dataset.questionId, button);
  });
}

function connectEvents() {
  const events = new EventSource("/events.stream");

  events.addEventListener("open", () => setLinkState("live"));
  events.addEventListener("error", () => setLinkState("retry"));

  events.addEventListener("snapshot", (event) => {
    const snapshot = JSON.parse(event.data);
    applySnapshot(snapshot);
  });

  events.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.message) ingestMessage(payload.message);
  });

  events.addEventListener("analysis", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.analysis) applyAnalysis(payload.analysis);
  });

  events.addEventListener("presence", (event) => {
    const payload = JSON.parse(event.data);
    state.watching = payload.watching || 0;
    renderWatching();
  });
}

async function bootFetch() {
  // SSE snapshot usually wins this race; these are belt-and-braces for boot
  // and for static hosting quirks. Failures are silent by design.
  try {
    const response = await fetch("/analysis.json");
    if (response.ok) {
      const analysis = await response.json();
      if (!state.analysis) applyAnalysis(analysis);
    }
  } catch {
    /* stream will provide */
  }
  try {
    const response = await fetch("/status.json");
    if (response.ok) {
      const snapshot = await response.json();
      if (!state.booted) applySnapshot(snapshot);
    }
  } catch {
    /* stream will provide */
  }
}

function applySnapshot(snapshot) {
  if (snapshot.sources && typeof snapshot.sources === "object") {
    state.sources = snapshot.sources;
  }
  if (typeof snapshot.runtime?.watching === "number") {
    state.watching = snapshot.runtime.watching;
    renderWatching();
  }
  // Seed rate math + pulse with recent history so the page is alive instantly.
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  if (!state.booted && messages.length > 0) {
    const cutoff = Date.now() - 150000;
    for (const message of messages) {
      const t = toMs(message.receivedAt);
      if (t >= cutoff) state.msgTimes.push({ t, source: message.source });
    }
    state.msgTimes.sort((a, b) => a.t - b.t);
    showPulse(messages[0]);
    state.lastMessage = messages[0];
  }
  state.booted = true;
  if (snapshot.analysis) applyAnalysis(snapshot.analysis);
  renderRates();
}

function ingestMessage(message) {
  if (!message) return;
  state.msgTimes.push({ t: toMs(message.receivedAt), source: message.source });
  pruneTimes();
  state.lastMessage = message;
  showPulse(message);
  checkHotHit(message);
  renderRates();
}

function applyAnalysis(analysis) {
  const previousTone = state.lastMoodTone;
  const previousScore = state.lastMoodScore;
  state.analysis = analysis;

  const overall = analysis.overall || null;
  if (overall && overall.samples > 0) {
    if (previousScore !== null) {
      const delta = overall.score - previousScore;
      if (delta > 0.08) state.moodDir = "up";
      else if (delta < -0.08) state.moodDir = "down";
    }
    // Mood flip — the headline beat for the NOW slot.
    if (previousTone && previousTone !== overall.tone && overall.samples >= 5) {
      proposeNow({
        key: `flip:${overall.tone}:${Math.floor(Date.now() / 30000)}`,
        kind: "flip",
        kindLabel: "mood flip",
        score: 100,
        at: Date.now(),
        headline: `chat turning ${escapeHtml(overall.mood)}`,
        sub: `<span>was ${escapeHtml(moodWordForTone(previousTone))} · ${overall.samples} msgs in ${analysis.windowSeconds || 90}s</span>`
      });
    }
    state.lastMoodTone = overall.tone;
    state.lastMoodScore = overall.score;
  }

  renderMood();
  renderTrends();
  renderQuestions();
  proposeTopQuestion();
}

/* ---------- NOW slot engine ---------- */

function nowPriority(item, t) {
  const age = t - item.at;
  if (age >= NOW_TTL_MS) return 0;
  return item.score * (1 - age / NOW_TTL_MS);
}

function proposeNow(candidate) {
  const t = Date.now();
  const current = state.now;
  if (current && current.key === candidate.key) {
    // Same beat, fresher data — update in place, no re-entrance.
    state.now = { ...current, ...candidate, at: current.at };
    renderNow(false);
    return;
  }
  const currentPriority = current ? nowPriority(current, t) : 0;
  const candidatePriority = nowPriority(candidate, t);
  if (candidatePriority <= 0) return;
  if (currentPriority > 0 && candidatePriority <= currentPriority * NOW_SWAP_FACTOR) return;
  state.now = candidate;
  renderNow(true);
}

function decayNow() {
  const t = Date.now();
  if (state.now && nowPriority(state.now, t) <= 0) {
    state.now = null;
    state.nowShownKey = null;
  }
  if (!state.now) {
    const fallback = buildFallbackNow();
    if (fallback) {
      state.now = fallback;
      renderNow(state.nowShownKey !== fallback.key);
    }
  }
  renderNowAge();
}

function buildFallbackNow() {
  // 1. Freshest unanswered question (still worth answering for ~3 min).
  const question = (state.analysis?.questions || []).find(
    (q) => !state.answered.has(q.id) && Date.now() - toMs(q.at) < 180000
  );
  if (question) {
    return {
      key: `q:${question.id}`,
      kind: "question",
      kindLabel: "open question",
      score: 55,
      at: toMs(question.at),
      headline: escapeHtml(clip(question.content, 120)),
      sub: `${chipHtml(question.source)}<span>${escapeHtml(question.author || "unknown")}</span>`
    };
  }
  // 2. Steady-state pulse: top trend + room temperature. Never a dead panel.
  const trend = (state.analysis?.trends || [])[0];
  const mood = state.analysis?.overall?.samples ? state.analysis.overall.mood : null;
  const rate = rateInWindow(60000);
  if (trend || mood || rate > 0) {
    const headline = trend ? markCashtags(escapeHtml(trend.term)) : "chat is steady";
    const bits = [];
    if (trend) bits.push(`${trend.count} mentions${trend.crossPlatform ? " · cross-platform" : ""}`);
    if (mood) bits.push(`mood ${mood}`);
    bits.push(`${rate}/min`);
    return {
      key: "idle",
      kind: "idle",
      kindLabel: "pulse",
      score: 10,
      at: Date.now(),
      headline,
      sub: `<span>${escapeHtml(bits.join(" · "))}</span>`
    };
  }
  return null; // keep the boot "waiting for signal…" card
}

function renderNow(animate) {
  const item = state.now;
  if (!item || !els.nowBody) return;
  els.now.dataset.kind = item.kind;
  els.nowKind.textContent = item.kindLabel || "";
  els.nowBody.innerHTML = `
    <p class="st-now-headline">${item.headline}</p>
    ${item.sub ? `<div class="st-now-sub">${item.sub}</div>` : ""}
  `;
  if (animate && !reducedMotion && state.nowShownKey !== item.key) {
    els.nowBody.classList.remove("st-enter");
    void els.nowBody.offsetWidth;
    els.nowBody.classList.add("st-enter");
  }
  state.nowShownKey = item.key;
  renderNowAge();
}

function renderNowAge() {
  if (!els.nowAge) return;
  const item = state.now;
  if (!item || item.kind === "idle") {
    els.nowAge.textContent = "";
    return;
  }
  els.nowAge.textContent = relativeAge(item.at);
}

/* ---------- candidate detectors ---------- */

function checkHotHit(message) {
  const content = String(message.content || "");
  const lower = content.toLowerCase();
  const t = Date.now();

  let term = null;
  let isWatch = false;
  for (const watch of state.watchlist) {
    if (watch && lower.includes(watch.toLowerCase())) {
      term = watch;
      isWatch = true;
      break;
    }
  }
  if (!term) {
    const cash = content.match(/\$[a-z]{2,8}\b/i);
    if (cash) term = cash[0];
  }
  if (!term) return;

  const key = term.toLowerCase();
  const last = state.lastHitProposedAt.get(key) || 0;
  if (t - last < 30000) return;
  state.lastHitProposedAt.set(key, t);

  proposeNow({
    key: `hit:${key}:${Math.floor(t / 30000)}`,
    kind: "hit",
    kindLabel: isWatch ? "watchlist hit" : "ticker hit",
    score: isWatch ? 85 : 78,
    at: t,
    headline: markCashtags(escapeHtml(clip(content, 110))),
    sub: `${chipHtml(message.source)}<span>${escapeHtml(message.author?.name || "unknown")} · ${escapeHtml(term)}</span>`
  });
}

function checkSpike() {
  const t = Date.now();
  const count10 = state.msgTimes.filter((m) => m.t >= t - 10000).length;
  const count120 = state.msgTimes.filter((m) => m.t >= t - 120000).length;
  const rate10 = count10 * 6; // per minute
  const baseline = Math.max(1, count120 / 2); // per minute over 2 min
  const spiking = count10 >= 5 && rate10 >= baseline * 3;
  if (!spiking) return;
  if (t - state.lastSpikeProposedAt < 45000) {
    // Refresh the live number if the spike card is already up.
    if (state.now?.kind === "spike") {
      proposeNow({ ...state.now, headline: `volume spike — ${rate10}/min` });
    }
    return;
  }
  state.lastSpikeProposedAt = t;
  proposeNow({
    key: `spike:${Math.floor(t / 45000)}`,
    kind: "spike",
    kindLabel: "volume spike",
    score: 90,
    at: t,
    headline: `volume spike — ${rate10}/min`,
    sub: `<span>${(rate10 / baseline).toFixed(1)}× the 2-minute baseline</span>`
  });
}

function proposeTopQuestion() {
  const question = (state.analysis?.questions || []).find(
    (q) => !state.answered.has(q.id) && Date.now() - toMs(q.at) < 120000
  );
  if (!question) return;
  proposeNow({
    key: `q:${question.id}`,
    kind: "question",
    kindLabel: "open question",
    score: 55,
    at: toMs(question.at),
    headline: escapeHtml(clip(question.content, 120)),
    sub: `${chipHtml(question.source)}<span>${escapeHtml(question.author || "unknown")}</span>`
  });
}

/* ---------- zones ---------- */

function renderMood() {
  if (!els.moodBody) return;
  const analysis = state.analysis;
  if (!analysis || !analysis.overall) {
    els.moodBody.innerHTML = `<p class="st-empty">listening…</p>`;
    return;
  }
  const overall = analysis.overall;
  const glyph = MOOD_GLYPH[overall.mood] || "▬";
  const arrow = state.moodDir === "up" ? "▲" : state.moodDir === "down" ? "▼" : "";

  const rows = sourceKeys()
    .map((source) => {
      const data = analysis.sources?.[source] || { mood: "quiet", tone: "neutral", score: 0, samples: 0 };
      const pct = Math.round(((Number(data.score) || 0) + 1) * 50);
      return `
        <div class="st-mood-row" data-tone="${escapeAttr(data.tone)}" style="--src:${escapeAttr(sourceColor(source))}">
          ${chipHtml(source)}
          <span class="st-mood-track"><span class="st-mood-fill" style="left:${pct}%"></span></span>
          <span class="st-mood-row-label">${escapeHtml(data.mood)}</span>
        </div>
      `;
    })
    .join("");

  els.moodBody.innerHTML = `
    <div class="st-mood-overall" data-tone="${escapeAttr(overall.tone)}">
      <span class="st-mood-glyph">${glyph}</span>
      <span class="st-mood-word">${escapeHtml(overall.samples ? overall.mood : "quiet")}</span>
      ${arrow ? `<span class="st-mood-arrow" data-dir="${state.moodDir}">${arrow}</span>` : ""}
    </div>
    <div class="st-mood-rows">${rows}</div>
  `;
}

function renderTrends() {
  if (!els.trendsBody) return;
  const trends = (state.analysis?.trends || []).slice(0, 5);
  if (trends.length === 0) {
    els.trendsBody.innerHTML = `<p class="st-empty">no trending terms yet</p>`;
    return;
  }
  els.trendsBody.innerHTML = trends
    .map((trend, index) => {
      const cash = trend.term.startsWith("$");
      return `
        <span class="st-trend${cash ? " cash" : ""}" data-rank="${index}" title="${escapeAttr(trend.sources.join(", "))}">
          ${trend.crossPlatform ? `<span class="st-cross">✦</span>` : ""}
          ${escapeHtml(trend.term)}
          <span class="st-trend-count">×${trend.count}</span>
        </span>
      `;
    })
    .join("");
}

function renderQuestions() {
  if (!els.questionsBody) return;
  const questions = (state.analysis?.questions || [])
    .filter((q) => !state.answered.has(q.id))
    .slice(0, 3);
  if (questions.length === 0) {
    els.questionsBody.innerHTML = `<p class="st-empty">no open questions</p>`;
    return;
  }
  els.questionsBody.innerHTML = questions
    .map(
      (question) => `
      <button type="button" class="st-q" data-question-id="${escapeAttr(question.id)}" style="--src:${escapeAttr(sourceColor(question.source))}" title="Mark answered">
        <span class="st-q-meta">
          ${chipHtml(question.source)}
          <span class="st-q-author">${escapeHtml(question.author || "unknown")}</span>
          <span class="st-q-age" data-at="${escapeAttr(String(toMs(question.at)))}">${relativeAge(toMs(question.at))}</span>
        </span>
        <span class="st-q-text">${escapeHtml(question.content)}</span>
      </button>
    `
    )
    .join("");
}

function markAnswered(id, button) {
  if (!id) return;
  state.answered.add(id);
  saveAnswered();
  if (state.now?.key === `q:${id}`) {
    state.now = null;
    decayNow();
  }
  if (button && !reducedMotion) {
    button.classList.add("st-q-leaving");
    setTimeout(renderQuestions, 240);
  } else {
    renderQuestions();
  }
}

function renderRates() {
  if (!els.rateBody) return;
  const t = Date.now();
  const keys = sourceKeys();
  if (keys.length === 0) {
    els.rateBody.innerHTML = `<p class="st-empty">no traffic yet</p>`;
    return;
  }
  const totalRate = rateInWindow(60000);
  if (els.rateTotal) els.rateTotal.textContent = totalRate ? `${totalRate}/min total` : "";

  els.rateBody.innerHTML = keys
    .map((source) => {
      const times = state.msgTimes.filter((m) => m.source === source);
      const perMin = times.filter((m) => m.t >= t - 60000).length;
      const count10 = times.filter((m) => m.t >= t - 10000).length;
      const baseline = Math.max(1, times.filter((m) => m.t >= t - 120000).length / 2);
      const spiking = count10 >= 4 && count10 * 6 >= baseline * 3;
      return `
        <div class="st-rate-card${spiking ? " spiking" : ""}" style="--src:${escapeAttr(sourceColor(source))}">
          ${chipHtml(source)}
          <span class="st-rate-num">${perMin}<small>/min</small></span>
          <span class="st-rate-spike">▲ spike</span>
        </div>
      `;
    })
    .join("");
}

function showPulse(message) {
  if (!els.pulseLine || !message) return;
  for (const old of els.pulseLine.querySelectorAll(".st-pulse-msg")) {
    if (old.classList.contains("st-pulse-old")) old.remove();
    else old.classList.add("st-pulse-old");
  }
  const row = document.createElement("div");
  row.className = "st-pulse-msg";
  row.style.setProperty("--src", sourceColor(message.source));
  row.innerHTML = `
    <span class="st-pulse-author">${escapeHtml(sourceChipLabel(message))} · ${escapeHtml(message.author?.name || "unknown")}</span>
    <span class="st-pulse-text">${escapeHtml(clip(message.content, 160))}</span>
  `;
  els.pulseLine.appendChild(row);
  setTimeout(() => {
    for (const old of els.pulseLine.querySelectorAll(".st-pulse-old")) old.remove();
  }, 500);
}

function renderWatching() {
  if (!els.watching) return;
  const show = state.watching >= 1;
  els.watching.hidden = !show;
  if (show && els.watchingCount) els.watchingCount.textContent = String(state.watching);
}

function setLinkState(value) {
  if (!els.link) return;
  els.link.dataset.state = value;
  if (els.linkLabel) els.linkLabel.textContent = value === "live" ? "LIVE" : value === "retry" ? "RETRY" : "LINK";
}

/* ---------- 1s tick ---------- */

function tick() {
  if (els.clock) els.clock.textContent = timeFormatter.format(new Date());
  pruneTimes();
  checkSpike();
  decayNow();
  for (const node of document.querySelectorAll(".st-q-age[data-at]")) {
    node.textContent = relativeAge(Number(node.dataset.at));
  }
  renderRates();
}

/* ---------- sources ---------- */

function sourceKeys() {
  const keys = new Set();
  for (const key of Object.keys(state.sources || {})) {
    if (key !== "demo") keys.add(key);
  }
  for (const key of Object.keys(state.analysis?.sources || {})) keys.add(key);
  for (const entry of state.msgTimes) {
    if (entry.source && entry.source !== "demo") keys.add(entry.source);
  }
  return [...keys].sort((a, b) => {
    const ai = SOURCE_PREFERRED_ORDER.indexOf(a);
    const bi = SOURCE_PREFERRED_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function sourceColor(source) {
  return state.sources?.[source]?.color || FALLBACK_COLORS[source] || GENERIC_SOURCE_COLOR;
}

function sourceLabel(source) {
  return state.sources?.[source]?.label || String(source || "?").toUpperCase();
}

function sourceChipLabel(message) {
  const source = String(message?.source || "").toLowerCase();
  const label = String(message?.sourceLabel || sourceLabel(source)).trim();
  const channel = String(message?.channel || "").trim().replace(/^#/, "");
  if (!channel || !INLINE_CHANNEL_SOURCES.has(source)) return label;
  return `${label} · ${sourceChannelTarget(source, channel)}`;
}

function sourceChannelTarget(source, channel) {
  const clean = String(channel || "").trim().replace(/^#/, "");
  if (!clean) return "";
  if (source === "xlive") return clean.replace(/^xlive:/, "live ");
  if (source === "x") return clean;
  if (source === "youtube" && clean.startsWith("@")) return clean;
  return `#${clean}`;
}

function chipHtml(source) {
  return `<span class="st-chip" style="--src:${escapeAttr(sourceColor(source))}"><i></i>${escapeHtml(sourceLabel(source))}</span>`;
}

/* ---------- persistence ---------- */

function loadWatchlist() {
  try {
    const items = JSON.parse(localStorage.getItem(WATCH_STORAGE_KEY) || "[]");
    return Array.isArray(items) ? items.filter((term) => typeof term === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

function loadAnswered() {
  try {
    const items = JSON.parse(sessionStorage.getItem(ANSWERED_KEY) || "[]");
    return new Set(Array.isArray(items) ? items.slice(-80) : []);
  } catch {
    return new Set();
  }
}

function saveAnswered() {
  try {
    sessionStorage.setItem(ANSWERED_KEY, JSON.stringify([...state.answered].slice(-80)));
  } catch {
    /* in-memory only */
  }
}

/* ---------- helpers ---------- */

function pruneTimes() {
  const cutoff = Date.now() - 150000;
  while (state.msgTimes.length > 0 && state.msgTimes[0].t < cutoff) state.msgTimes.shift();
  if (state.msgTimes.length > 1200) state.msgTimes.splice(0, state.msgTimes.length - 1200);
}

function rateInWindow(ms) {
  const cutoff = Date.now() - ms;
  return state.msgTimes.filter((m) => m.t >= cutoff).length * (60000 / ms);
}

function relativeAge(at) {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function moodWordForTone(tone) {
  return tone === "pos" ? "positive" : tone === "neg" ? "negative" : "neutral";
}

function markCashtags(escapedText) {
  return escapedText.replace(/\$[a-z0-9]{2,8}\b/gi, (match) => `<span class="st-cash">${match}</span>`);
}

function clip(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toMs(value) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
