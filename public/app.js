const isOverlay = location.pathname === "/overlay";

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
  pinned: new Map()
};

const els = {
  shell: document.querySelector(".shell"),
  overlayRoot: document.querySelector("#overlayRoot"),
  statusStrip: document.querySelector("#statusStrip"),
  sourceCards: document.querySelector("#sourceCards"),
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
  rawPayload: document.querySelector("#rawPayload"),
  pinnedList: document.querySelector("#pinnedList"),
  radarCanvas: document.querySelector("#radarCanvas")
};

if (isOverlay) {
  els.shell.hidden = true;
  els.overlayRoot.hidden = false;
  document.body.style.background = "transparent";
}

bindControls();
connectEvents();
loadSnapshot();

function bindControls() {
  document.querySelectorAll("[data-source-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.sourceFilter;
      document.querySelectorAll("[data-source-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      render();
    });
  });

  els.searchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderFeed();
  });

  els.priorityOnly?.addEventListener("change", (event) => {
    state.priorityOnly = event.target.checked;
    renderFeed();
  });

  els.pauseButton?.addEventListener("click", () => {
    state.paused = !state.paused;
    els.pauseButton.textContent = state.paused ? "Resume" : "Pause";
    if (!state.paused) {
      state.unread = 0;
      renderFeed();
    }
    renderStats();
  });

  els.spikeButton?.addEventListener("click", () => postJson("/api/demo/spike"));
  els.exportButton?.addEventListener("click", () => {
    location.href = "/api/export.ndjson";
  });
  els.clearSearchButton?.addEventListener("click", () => {
    state.query = "";
    els.searchInput.value = "";
    renderFeed();
  });
}

async function loadSnapshot() {
  const response = await fetch("/api/status");
  applySnapshot(await response.json());
}

function connectEvents() {
  const events = new EventSource("/events");
  events.addEventListener("snapshot", (event) => applySnapshot(JSON.parse(event.data)));
  events.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    upsertMessage(payload.message);
    state.stats = payload.stats || state.stats;
    if (state.paused) state.unread += 1;
    render();
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

function applySnapshot(snapshot) {
  state.messages = snapshot.messages || [];
  state.status = snapshot.status || {};
  state.stats = snapshot.stats || state.stats;
  state.sources = snapshot.sources || {};
  render();
}

function upsertMessage(message) {
  state.messages = [message, ...state.messages.filter((item) => item.id !== message.id)].slice(0, 250);
}

function render() {
  renderStatus();
  renderStats();
  renderFeed();
  renderSourceCards();
  renderPinned();
  drawRadar();
}

function renderStatus() {
  if (!els.statusStrip) return;
  els.statusStrip.innerHTML = Object.entries(state.status)
    .map(([source, status]) => {
      const label = state.sources[source]?.label || source;
      return `
        <div class="status-pill" data-state="${escapeAttr(status.state)}">
          <span class="status-dot"></span>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(status.state)}</small>
        </div>
      `;
    })
    .join("");
}

function renderStats() {
  if (els.feedSummary) {
    const total = state.stats.totalMessages || 0;
    const visible = filteredMessages().length;
    els.feedSummary.textContent = `${visible} visible / ${total} captured`;
  }
  if (els.unreadCount) els.unreadCount.textContent = String(state.unread);
  if (els.duplicateCount) els.duplicateCount.textContent = String(state.stats.duplicatesDropped || 0);
}

function renderSourceCards() {
  if (!els.sourceCards) return;
  els.sourceCards.innerHTML = ["twitch", "x", "kick"]
    .map((source) => {
      const meta = state.sources[source] || {};
      const status = state.status[source] || {};
      const sourceStats = state.stats.sources?.[source] || {};
      return `
        <article class="source-card">
          <div class="source-card-head">
            <strong><span class="status-dot" style="background:${escapeAttr(meta.color || "#888")}"></span>${escapeHtml(meta.label || source)}</strong>
            <span class="metric-value">${sourceStats.count || 0}</span>
          </div>
          <p>${escapeHtml(status.detail || "idle")}</p>
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
    target.innerHTML = `<li class="empty-state">No matching messages</li>`;
    return;
  }

  target.innerHTML = messages.slice(0, isOverlay ? 6 : 80).map((message) => {
    return isOverlay ? overlayMarkup(message) : messageMarkup(message);
  }).join("");

  if (!isOverlay) {
    target.querySelectorAll("[data-message-id]").forEach((item) => {
      item.addEventListener("click", () => selectMessage(item.dataset.messageId));
    });
    target.querySelectorAll("[data-pin-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePin(button.dataset.pinId);
      });
    });
  }
}

function messageMarkup(message) {
  const selected = state.selectedId === message.id ? " selected" : "";
  const pinned = state.pinned.has(message.id) ? "Unpin" : "Pin";
  return `
    <li class="message${selected}" data-message-id="${escapeAttr(message.id)}">
      <span class="message-source" style="background:${escapeAttr(message.sourceColor)}">${escapeHtml(message.sourceLabel)}</span>
      <div class="message-main">
        <div class="message-meta">
          <span class="author" style="color:${escapeAttr(message.author.color || message.sourceColor)}">${escapeHtml(message.author.name)}</span>
          <span class="handle">${escapeHtml(formatHandle(message.author.handle))}</span>
          <span class="channel">${escapeHtml(message.channel)}</span>
          <time class="message-time">${escapeHtml(formatTime(message.receivedAt))}</time>
          <span class="mode">${escapeHtml(message.mode)}</span>
        </div>
        <p class="message-content">${linkify(message.content)}</p>
      </div>
      <div class="message-actions">
        <span class="heat">${message.heat || 0}</span>
        <button type="button" data-pin-id="${escapeAttr(message.id)}" title="${pinned} message">${pinned}</button>
      </div>
    </li>
  `;
}

function overlayMarkup(message) {
  return `
    <li class="overlay-item">
      <span class="message-source" style="background:${escapeAttr(message.sourceColor)}">${escapeHtml(message.sourceLabel)}</span>
      <div>
        <strong style="color:${escapeAttr(message.author.color || message.sourceColor)}">${escapeHtml(message.author.name)}</strong>
        <p class="message-content">${linkify(message.content)}</p>
      </div>
    </li>
  `;
}

function selectMessage(id) {
  state.selectedId = id;
  const message = state.messages.find((item) => item.id === id);
  if (els.rawPayload && message) {
    els.rawPayload.textContent = JSON.stringify(message, null, 2);
  }
  renderFeed();
}

function togglePin(id) {
  const message = state.messages.find((item) => item.id === id);
  if (!message) return;
  if (state.pinned.has(id)) state.pinned.delete(id);
  else state.pinned.set(id, message);
  renderPinned();
  renderFeed();
}

function renderPinned() {
  if (!els.pinnedList) return;
  const pinned = [...state.pinned.values()];
  if (pinned.length === 0) {
    els.pinnedList.innerHTML = `<div class="pinned-item"><p>No pinned messages</p></div>`;
    return;
  }
  els.pinnedList.innerHTML = pinned
    .map((message) => `
      <article class="pinned-item">
        <strong>${escapeHtml(message.sourceLabel)} / ${escapeHtml(message.author.name)}</strong>
        <p>${escapeHtml(message.content)}</p>
      </article>
    `)
    .join("");
}

function filteredMessages() {
  return state.messages.filter((message) => {
    if (state.filter !== "all" && message.source !== state.filter) return false;
    if (state.priorityOnly && (message.heat || 0) < 18) return false;
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
  });
}

function drawRadar() {
  const canvas = els.radarCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050504";
  ctx.fillRect(0, 0, width, height);

  const buckets = new Array(24).fill(0);
  const now = Date.now();
  for (const message of state.messages) {
    const age = Math.max(0, now - new Date(message.receivedAt).getTime());
    const bucket = Math.floor(age / 5000);
    if (bucket < buckets.length) buckets[buckets.length - 1 - bucket] += 1;
  }

  const max = Math.max(1, ...buckets);
  buckets.forEach((count, index) => {
    const barWidth = width / buckets.length - 3;
    const barHeight = Math.max(4, (count / max) * (height - 24));
    const x = index * (width / buckets.length) + 2;
    const y = height - barHeight - 10;
    ctx.fillStyle = index % 3 === 0 ? "#53fc18" : index % 3 === 1 ? "#9146ff" : "#d8a84a";
    ctx.fillRect(x, y, barWidth, barHeight);
  });
}

async function postJson(url, body = {}) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatHandle(handle) {
  return handle ? `@${handle}` : "";
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
