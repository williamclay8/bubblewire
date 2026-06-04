const isOverlay = location.pathname === "/overlay" || location.pathname === "/overlay.html";

const MAX_RENDERED = 80;
const OVERLAY_RENDERED = 6;
const PRIORITY_HEAT = 18;
const PIN_STORAGE_KEY = "bubblewire:pins:v1";
const RADAR_BUCKETS = 30;
const RADAR_BUCKET_MS = 2000;
const SOURCE_ORDER = ["twitch", "x", "kick"];
const FALLBACK_COLORS = { twitch: "#9146ff", x: "#f4f2ea", kick: "#53fc18", demo: "#d8a84a" };

const state = {
  messages: [],
  status: {},
  stats: { totalMessages: 0, duplicatesDropped: 0, sources: {} },
  sources: {},
  filter: "all",
  query: "",
  priorityOnly: false,
  paused: false,
  unread: 0,
  selectedId: null,
  pinned: loadPins()
};

const els = {
  shell: document.querySelector("#appShell"),
  overlayRoot: document.querySelector("#overlayRoot"),
  statusStrip: document.querySelector("#statusStrip"),
  linkState: document.querySelector("#linkState"),
  clock: document.querySelector("#clock"),
  tape: document.querySelector("#tape"),
  sourceCards: document.querySelector("#sourceCards"),
  feedPanel: document.querySelector("#feedPanel"),
  feedList: document.querySelector("#feedList"),
  overlayFeed: document.querySelector("#overlayFeed"),
  feedSummary: document.querySelector("#feedSummary"),
  searchInput: document.querySelector("#searchInput"),
  priorityOnly: document.querySelector("#priorityOnly"),
  pauseButton: document.querySelector("#pauseButton"),
  spikeButton: document.querySelector("#spikeButton"),
  exportButton: document.querySelector("#exportButton"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  unreadCount: document.querySelector("#unreadCount"),
  duplicateCount: document.querySelector("#duplicateCount"),
  bufferCount: document.querySelector("#bufferCount"),
  uptimeValue: document.querySelector("#uptimeValue"),
  rawPayload: document.querySelector("#rawPayload"),
  pinnedList: document.querySelector("#pinnedList"),
  pinnedCount: document.querySelector("#pinnedCount"),
  radarCanvas: document.querySelector("#radarCanvas")
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

if (isOverlay) {
  els.shell.hidden = true;
  els.overlayRoot.hidden = false;
  document.body.style.background = "transparent";
}

bindControls();
connectEvents();
loadSnapshot();
startTicker();

/* ---------- wiring ---------- */

function bindControls() {
  if (isOverlay) return;

  document.querySelectorAll("[data-source-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.sourceFilter;
      document.querySelectorAll("[data-source-filter]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderFeed();
      renderStats();
    });
  });

  els.searchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderFeed();
    renderStats();
  });

  els.priorityOnly?.addEventListener("change", (event) => {
    state.priorityOnly = event.target.checked;
    renderFeed();
    renderStats();
  });

  els.pauseButton?.addEventListener("click", togglePause);
  els.spikeButton?.addEventListener("click", () => postJson("/demo-spike.json"));
  els.exportButton?.addEventListener("click", () => {
    location.href = "/export.ndjson";
  });
  els.clearSearchButton?.addEventListener("click", clearSearch);

  // One delegated listener for the whole feed instead of per-row bindings.
  els.feedList?.addEventListener("click", (event) => {
    const pin = event.target.closest("[data-pin-id]");
    if (pin) {
      event.stopPropagation();
      togglePin(pin.dataset.pinId);
      return;
    }
    const row = event.target.closest("[data-message-id]");
    if (row) selectMessage(row.dataset.messageId);
  });

  els.pinnedList?.addEventListener("click", (event) => {
    const unpin = event.target.closest("[data-unpin-id]");
    if (unpin) togglePin(unpin.dataset.unpinId);
  });

  document.addEventListener("keydown", (event) => {
    const typing = /^(input|textarea|select)$/i.test(event.target.tagName);
    if (event.key === "/" && !typing) {
      event.preventDefault();
      els.searchInput?.focus();
    } else if ((event.key === "p" || event.key === "P") && !typing) {
      togglePause();
    } else if (event.key === "Escape" && typing) {
      clearSearch();
      event.target.blur();
    }
  });
}

function togglePause() {
  state.paused = !state.paused;
  if (els.pauseButton) {
    els.pauseButton.setAttribute("aria-pressed", String(state.paused));
  }
  els.feedPanel?.classList.toggle("paused", state.paused);
  if (!state.paused) {
    state.unread = 0;
    renderFeed();
  }
  renderStats();
}

function clearSearch() {
  state.query = "";
  if (els.searchInput) els.searchInput.value = "";
  renderFeed();
  renderStats();
}

async function loadSnapshot() {
  try {
    const response = await fetch("/status.json");
    applySnapshot(await response.json());
  } catch {
    /* SSE snapshot will follow */
  }
}

function connectEvents() {
  const events = new EventSource("/events.stream");

  events.addEventListener("open", () => setLinkState("live"));
  events.addEventListener("error", () => setLinkState("retry"));

  events.addEventListener("snapshot", (event) => applySnapshot(JSON.parse(event.data)));
  events.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    state.stats = payload.stats || state.stats;
    ingestMessage(payload.message);
  });
  events.addEventListener("status", (event) => {
    const payload = JSON.parse(event.data);
    state.status = payload.status || state.status;
    renderStatus();
  });
  events.addEventListener("stats", (event) => {
    const payload = JSON.parse(event.data);
    state.stats = payload.stats || state.stats;
    renderStats();
  });
}

function setLinkState(value) {
  els.linkState?.setAttribute("data-state", value);
  const label = document.querySelector("#linkLabel");
  if (label) label.textContent = value === "live" ? "LINK LIVE" : "LINK RETRY";
}

function applySnapshot(snapshot) {
  state.messages = snapshot.messages || [];
  state.status = snapshot.status || {};
  state.stats = snapshot.stats || state.stats;
  state.sources = snapshot.sources || {};
  renderAll();
}

function ingestMessage(message) {
  if (!message) return;
  state.messages = [message, ...state.messages.filter((item) => item.id !== message.id)].slice(0, 250);

  if (state.paused && !isOverlay) {
    state.unread += 1;
    renderStats();
    return;
  }

  prependMessage(message);
  renderStats();
  if (!isOverlay) renderSourceCards();
}

/* ---------- rendering ---------- */

function renderAll() {
  renderStatus();
  renderStats();
  renderFeed();
  if (!isOverlay) {
    renderSourceCards();
    renderPinned();
    drawRadar();
  }
}

function renderStatus() {
  if (!els.statusStrip || isOverlay) return;
  els.statusStrip.innerHTML = Object.entries(state.status)
    .map(([source, status]) => {
      const label = state.sources[source]?.label || source;
      return `
        <div class="status-pill" data-state="${escapeAttr(status.state)}" title="${escapeAttr(status.detail || "")}">
          <span class="status-dot"></span>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(status.state)}</small>
        </div>
      `;
    })
    .join("");
}

function renderStats() {
  if (isOverlay) return;
  const total = state.stats.totalMessages || 0;
  const visible = filteredMessages().length;

  if (els.feedSummary) {
    els.feedSummary.textContent = `${visible} visible / ${total} captured${state.paused ? " — paused" : ""}`;
  }
  if (els.unreadCount) els.unreadCount.textContent = String(state.unread);
  if (els.duplicateCount) els.duplicateCount.textContent = String(state.stats.duplicatesDropped || 0);
  if (els.bufferCount) els.bufferCount.textContent = String(state.messages.length);
  if (els.pauseButton) {
    els.pauseButton.textContent = state.paused
      ? `Resume${state.unread ? ` (${state.unread})` : ""}`
      : "Pause";
  }
  renderTape(total, visible);
}

function renderTape(total, visible) {
  if (!els.tape) return;
  const sourceSegments = SOURCE_ORDER.map((source) => {
    const count = state.stats.sources?.[source]?.count || 0;
    const color = sourceColor(source);
    return `<span class="src" style="--src:${escapeAttr(color)}">${escapeHtml(source)} <b>${pad(count)}</b></span>`;
  }).join("");
  els.tape.innerHTML = `
    <span>captured <b>${pad(total)}</b></span>
    <span>visible <b>${pad(visible)}</b></span>
    <span>dedupe <b>${pad(state.stats.duplicatesDropped || 0)}</b></span>
    <span>unread <b>${pad(state.unread)}</b></span>
    ${sourceSegments}
  `;
}

function renderSourceCards() {
  if (!els.sourceCards) return;
  els.sourceCards.innerHTML = SOURCE_ORDER
    .map((source) => {
      const meta = state.sources[source] || {};
      const status = state.status[source] || {};
      const sourceStats = state.stats.sources?.[source] || {};
      const lastAt = sourceStats.lastMessageAt
        ? `<p class="last-at">last ${escapeHtml(formatTime(sourceStats.lastMessageAt))}</p>`
        : "";
      return `
        <article class="source-card" style="--src:${escapeAttr(sourceColor(source))}" data-state="${escapeAttr(status.state || "idle")}">
          <div class="source-card-head">
            <strong>${escapeHtml(meta.label || source)}</strong>
            <span class="metric-value">${sourceStats.count || 0}</span>
          </div>
          <p>${escapeHtml(status.detail || "idle")}</p>
          ${lastAt}
        </article>
      `;
    })
    .join("");
}

function renderFeed() {
  const target = isOverlay ? els.overlayFeed : els.feedList;
  if (!target) return;

  const messages = filteredMessages();
  if (messages.length === 0) {
    target.innerHTML = `<li class="empty-state">awaiting signal</li>`;
    return;
  }

  target.innerHTML = messages
    .slice(0, isOverlay ? OVERLAY_RENDERED : MAX_RENDERED)
    .map((message) => (isOverlay ? overlayMarkup(message) : messageMarkup(message)))
    .join("");
}

function prependMessage(message) {
  const target = isOverlay ? els.overlayFeed : els.feedList;
  if (!target) return;
  if (!passesFilter(message)) return;

  const empty = target.querySelector(".empty-state");
  if (empty) empty.remove();

  target.insertAdjacentHTML("afterbegin", isOverlay ? overlayMarkup(message) : messageMarkup(message));
  target.firstElementChild?.classList.add("msg-enter");

  const cap = isOverlay ? OVERLAY_RENDERED : MAX_RENDERED;
  while (target.children.length > cap) {
    target.lastElementChild.remove();
  }
}

function messageMarkup(message) {
  const selected = state.selectedId === message.id ? " selected" : "";
  const pinnedState = state.pinned.has(message.id);
  const heatLevel = Math.min(4, Math.ceil((message.heat || 0) / 25));
  const heatBars = [1, 2, 3, 4]
    .map((step) => `<i${step <= heatLevel ? ' class="on"' : ""}></i>`)
    .join("");
  const verified = message.author.verified ? `<span class="verified" title="Verified">✓</span>` : "";
  const mode = message.mode && message.mode !== "live"
    ? `<span class="mode-tag">${escapeHtml(message.mode)}</span>`
    : "";
  const channel = message.channel ? `<span class="channel">#${escapeHtml(message.channel)}</span>` : "";

  return `
    <li class="message${selected}${pinnedState ? " pinned-state" : ""}" data-message-id="${escapeAttr(message.id)}" style="--src:${escapeAttr(message.sourceColor)}">
      <div class="msg-head">
        <span class="src-tag">${escapeHtml(message.sourceLabel)}</span>
        <span class="author" style="color:${escapeAttr(message.author.color || message.sourceColor)}">${escapeHtml(message.author.name)}</span>
        ${verified}
        <span class="handle">${escapeHtml(formatHandle(message.author.handle))}</span>
        ${channel}
        ${mode}
        <span class="msg-spacer"></span>
        <span class="heat" title="Heat ${message.heat || 0}"><span class="heat-bar">${heatBars}</span>${message.heat || 0}</span>
        <time class="msg-time">${escapeHtml(formatTime(message.receivedAt))}</time>
        <button type="button" class="pin-btn" data-pin-id="${escapeAttr(message.id)}">${pinnedState ? "Unpin" : "Pin"}</button>
      </div>
      <p class="msg-content">${linkify(message.content)}</p>
    </li>
  `;
}

function overlayMarkup(message) {
  return `
    <li class="overlay-item" style="--src:${escapeAttr(message.sourceColor)}">
      <span class="src-tag">${escapeHtml(message.sourceLabel)}</span>
      <div>
        <strong style="color:${escapeAttr(message.author.color || message.sourceColor)}">${escapeHtml(message.author.name)}</strong>
        <p class="msg-content">${linkify(message.content)}</p>
      </div>
    </li>
  `;
}

function selectMessage(id) {
  const previous = state.selectedId;
  state.selectedId = id;
  const message = state.messages.find((item) => item.id === id);
  if (els.rawPayload && message) {
    els.rawPayload.textContent = JSON.stringify(message, null, 2);
  }
  // Toggle classes in place — no feed rebuild.
  if (previous) {
    els.feedList?.querySelector(`[data-message-id="${cssEscape(previous)}"]`)?.classList.remove("selected");
  }
  els.feedList?.querySelector(`[data-message-id="${cssEscape(id)}"]`)?.classList.add("selected");
}

function togglePin(id) {
  const message = state.pinned.get(id) || state.messages.find((item) => item.id === id);
  if (!message) return;
  if (state.pinned.has(id)) state.pinned.delete(id);
  else state.pinned.set(id, message);
  savePins();
  renderPinned();

  const row = els.feedList?.querySelector(`[data-message-id="${cssEscape(id)}"]`);
  if (row) {
    const pinnedNow = state.pinned.has(id);
    row.classList.toggle("pinned-state", pinnedNow);
    const button = row.querySelector("[data-pin-id]");
    if (button) button.textContent = pinnedNow ? "Unpin" : "Pin";
  }
}

function renderPinned() {
  if (!els.pinnedList) return;
  const pinned = [...state.pinned.values()];
  if (els.pinnedCount) els.pinnedCount.textContent = String(pinned.length);
  if (pinned.length === 0) {
    els.pinnedList.innerHTML = `<div class="pinned-item pinned-empty"><p>No pinned messages. Pins persist across reloads.</p></div>`;
    return;
  }
  els.pinnedList.innerHTML = pinned
    .map((message) => `
      <article class="pinned-item">
        <strong>${escapeHtml(message.sourceLabel)} / ${escapeHtml(message.author.name)}</strong>
        <button type="button" class="unpin-btn" data-unpin-id="${escapeAttr(message.id)}">Unpin</button>
        <p>${escapeHtml(message.content)}</p>
      </article>
    `)
    .join("");
}

/* ---------- filtering ---------- */

function passesFilter(message) {
  if (state.filter !== "all" && message.source !== state.filter) return false;
  if (state.priorityOnly && (message.heat || 0) < PRIORITY_HEAT) return false;
  if (!state.query) return true;
  const haystack = [
    message.sourceLabel,
    message.author.name,
    message.author.handle,
    message.channel,
    message.content
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(state.query);
}

function filteredMessages() {
  return state.messages.filter(passesFilter);
}

/* ---------- ticker: clock, uptime, radar ---------- */

function startTicker() {
  if (isOverlay) return;
  tick();
  setInterval(tick, 1000);
}

function tick() {
  if (els.clock) {
    const now = new Date();
    els.clock.dateTime = now.toISOString();
    els.clock.textContent = `${now.toISOString().slice(11, 19)} UTC`;
  }
  if (els.uptimeValue && state.stats.startedAt) {
    els.uptimeValue.textContent = formatDuration(Date.now() - new Date(state.stats.startedAt).getTime());
  }
  drawRadar();
}

function drawRadar() {
  const canvas = els.radarCanvas;
  if (!canvas || !canvas.clientWidth) return;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (canvas.width !== Math.round(cssWidth * dpr)) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // Background grid.
  ctx.strokeStyle = "rgba(236, 233, 223, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (cssHeight / 4) * i + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssWidth, y);
    ctx.stroke();
  }

  // Bucket counts per source over the radar window.
  const counts = Object.fromEntries(SOURCE_ORDER.map((source) => [source, new Array(RADAR_BUCKETS).fill(0)]));
  const now = Date.now();
  for (const message of state.messages) {
    const age = Math.max(0, now - new Date(message.receivedAt).getTime());
    const bucket = Math.floor(age / RADAR_BUCKET_MS);
    if (bucket >= RADAR_BUCKETS) continue;
    const index = RADAR_BUCKETS - 1 - bucket;
    if (counts[message.source]) counts[message.source][index] += 1;
  }

  const totals = new Array(RADAR_BUCKETS).fill(0);
  for (const source of SOURCE_ORDER) {
    counts[source].forEach((value, index) => {
      totals[index] += value;
    });
  }
  const max = Math.max(2, ...totals);
  const slot = cssWidth / RADAR_BUCKETS;
  const barWidth = Math.max(2, slot - 2);
  const floor = cssHeight - 4;

  for (let index = 0; index < RADAR_BUCKETS; index += 1) {
    let y = floor;
    for (const source of SOURCE_ORDER) {
      const value = counts[source][index];
      if (!value) continue;
      const barHeight = (value / max) * (cssHeight - 14);
      ctx.fillStyle = sourceColor(source);
      ctx.fillRect(index * slot + 1, y - barHeight, barWidth, barHeight);
      y -= barHeight;
    }
  }
}

/* ---------- persistence ---------- */

function loadPins() {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return new Map();
    const items = JSON.parse(raw);
    return new Map(items.filter((item) => item?.id).map((item) => [item.id, item]));
  } catch {
    return new Map();
  }
}

function savePins() {
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...state.pinned.values()].slice(-24)));
  } catch {
    /* storage unavailable — pins stay in-memory */
  }
}

/* ---------- helpers ---------- */

async function postJson(url, body = {}) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function sourceColor(source) {
  return state.sources[source]?.color || FALLBACK_COLORS[source] || "#888";
}

function pad(value) {
  return String(value).padStart(4, "0");
}

function formatTime(value) {
  return timeFormatter.format(new Date(value));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (n) => String(n).padStart(2, "0");
  return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
}

function formatHandle(handle) {
  return handle ? `@${handle}` : "";
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function linkify(text) {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
  );
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
