const isOverlay = location.pathname === "/overlay" || location.pathname === "/overlay.html";

const MAX_RENDERED = 80;
const MAX_TOTAL_RENDERED = 360;
const OVERLAY_RENDERED = 6;
const PRIORITY_HEAT = 18;
const PIN_STORAGE_KEY = "bubblewire:pins:v1";
const WATCH_STORAGE_KEY = "bubblewire:watchlist:v1";
const WATCH_SOUND_KEY = "bubblewire:watchsound:v1";
const HISTORY_PAGE = 60;
const RADAR_BUCKETS = 30;
const RADAR_BUCKET_MS = 2000;
const SOURCE_ORDER = ["twitch", "x", "kick"];
const FALLBACK_COLORS = { twitch: "#9146ff", x: "#f4f2ea", kick: "#53fc18", demo: "#d8a84a" };

const overlayConfig = parseOverlayConfig();

const state = {
  messages: [],
  status: {},
  stats: { totalMessages: 0, duplicatesDropped: 0, sources: {} },
  sources: {},
  runtime: { demoEnabled: true, demoMode: "on", demoRunning: false, liveOnly: false },
  filter: "all",
  query: "",
  priorityOnly: false,
  paused: false,
  unread: 0,
  newWhileAway: 0,
  selectedId: null,
  linkSeen: false,
  linkState: "connecting",
  pinned: loadPins(),
  watchlist: loadWatchlist(),
  watchSound: loadWatchSound(),
  watchToastAt: {},
  older: [],
  olderExhausted: false,
  loadingOlder: false,
  setup: null
};

const els = {
  shell: document.querySelector("#appShell"),
  overlayRoot: document.querySelector("#overlayRoot"),
  statusStrip: document.querySelector("#statusStrip"),
  linkState: document.querySelector("#linkState"),
  linkLabel: document.querySelector("#linkLabel"),
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
  copyRawButton: document.querySelector("#copyRawButton"),
  pinnedList: document.querySelector("#pinnedList"),
  pinnedCount: document.querySelector("#pinnedCount"),
  radarCanvas: document.querySelector("#radarCanvas"),
  radarPeak: document.querySelector("#radarPeak"),
  jumpPill: document.querySelector("#jumpPill"),
  jumpCount: document.querySelector("#jumpCount"),
  pausedBanner: document.querySelector("#pausedBanner"),
  pausedBannerCount: document.querySelector("#pausedBannerCount"),
  toastRoot: document.querySelector("#toastRoot"),
  watchInput: document.querySelector("#watchInput"),
  watchAddButton: document.querySelector("#watchAddButton"),
  watchChips: document.querySelector("#watchChips"),
  watchSoundToggle: document.querySelector("#watchSound"),
  loadOlderButton: document.querySelector("#loadOlderButton"),
  setupButton: document.querySelector("#setupButton"),
  setupDrawer: document.querySelector("#setupDrawer"),
  setupBackdrop: document.querySelector("#setupBackdrop"),
  setupBody: document.querySelector("#setupBody"),
  setupClose: document.querySelector("#setupClose")
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

let searchTimer = null;

if (isOverlay) {
  els.shell.hidden = true;
  els.overlayRoot.hidden = false;
  document.body.style.background = "transparent";
  applyOverlayConfig();
}

bindControls();
connectEvents();
loadSnapshot();
startTicker();
registerServiceWorker();

/* ---------- wiring ---------- */

function bindControls() {
  if (isOverlay) return;

  document.querySelectorAll("[data-source-filter]").forEach((button) => {
    button.addEventListener("click", () => setFilter(button.dataset.sourceFilter));
  });

  els.searchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderFeed();
      renderStats();
    }, 90);
  });

  els.priorityOnly?.addEventListener("change", (event) => {
    state.priorityOnly = event.target.checked;
    renderFeed();
    renderStats();
    toast(state.priorityOnly ? `priority only — heat ≥ ${PRIORITY_HEAT}` : "showing all heat levels");
  });

  els.pauseButton?.addEventListener("click", togglePause);
  els.spikeButton?.addEventListener("click", async () => {
    if (state.runtime.demoEnabled === false) {
      toast("demo disabled — live-only feed", "warn");
      return;
    }
    try {
      await postJson("/demo-spike.json");
      toast("spike injected ×18");
    } catch {
      toast("demo spike rejected", "err");
    }
  });
  els.exportButton?.addEventListener("click", () => {
    toast("exporting feed.ndjson");
    location.href = "/export.ndjson";
  });
  els.clearSearchButton?.addEventListener("click", () => {
    clearSearch();
    els.searchInput?.focus();
  });

  els.copyRawButton?.addEventListener("click", async () => {
    const text = els.rawPayload?.textContent || "";
    if (!text || text.startsWith("//")) {
      toast("select a message first", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("raw payload copied");
    } catch {
      toast("clipboard unavailable", "err");
    }
  });

  // One delegated listener for the whole feed instead of per-row bindings.
  els.feedList?.addEventListener("click", (event) => {
    const pin = event.target.closest("[data-pin-id]");
    if (pin) {
      event.stopPropagation();
      togglePin(pin.dataset.pinId);
      return;
    }
    const author = event.target.closest("[data-author-q]");
    if (author) {
      event.stopPropagation();
      filterByAuthor(author.dataset.authorQ);
      return;
    }
    const row = event.target.closest("[data-message-id]");
    if (row) selectMessage(row.dataset.messageId);
  });

  els.pinnedList?.addEventListener("click", (event) => {
    const unpin = event.target.closest("[data-unpin-id]");
    if (unpin) togglePin(unpin.dataset.unpinId);
  });

  els.feedList?.addEventListener("scroll", () => {
    if (els.feedList.scrollTop < 40) hideJumpPill();
  }, { passive: true });

  els.feedList?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const author = event.target.closest?.("[data-author-q]");
    if (author) {
      event.preventDefault();
      filterByAuthor(author.dataset.authorQ);
    }
  });

  els.jumpPill?.addEventListener("click", () => {
    els.feedList?.scrollTo({ top: 0, behavior: "smooth" });
    hideJumpPill();
  });

  // Watchlist
  renderWatchlist();
  if (els.watchSoundToggle) els.watchSoundToggle.checked = state.watchSound;
  els.watchAddButton?.addEventListener("click", addWatchTerm);
  els.watchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addWatchTerm();
    }
  });
  els.watchChips?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-watch-term]");
    if (chip) removeWatchTerm(chip.dataset.watchTerm);
  });
  els.watchSoundToggle?.addEventListener("change", (event) => {
    state.watchSound = event.target.checked;
    saveWatchSound();
    if (state.watchSound) beep();
    toast(state.watchSound ? "watch alerts will beep" : "watch alerts silent");
  });

  // History
  els.loadOlderButton?.addEventListener("click", loadOlder);

  // Setup drawer
  els.setupButton?.addEventListener("click", openSetup);
  els.setupClose?.addEventListener("click", closeSetup);
  els.setupBackdrop?.addEventListener("click", closeSetup);
  els.setupBody?.addEventListener("click", onSetupClick);
  els.setupBody?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "channelInput") {
      event.preventDefault();
      submitChannel("add", event.target.value);
    }
  });

  document.addEventListener("keydown", (event) => {
    const typing = /^(input|textarea|select)$/i.test(event.target.tagName);
    if (event.key === "Escape" && isSetupOpen()) {
      closeSetup();
      return;
    }
    if (typing) {
      if (event.key === "Escape") {
        clearSearch();
        event.target.blur();
      }
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      els.searchInput?.focus();
    } else if (event.key === "p" || event.key === "P") {
      togglePause();
    } else if (event.key === "s" || event.key === "S") {
      if (isSetupOpen()) closeSetup();
      else openSetup();
    } else if (["1", "2", "3", "4"].includes(event.key)) {
      setFilter(["all", ...SOURCE_ORDER][Number(event.key) - 1]);
    }
  });
}

function setFilter(filter) {
  if (state.filter === filter) return;
  state.filter = filter;
  document.querySelectorAll("[data-source-filter]").forEach((item) => {
    const active = item.dataset.sourceFilter === filter;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  renderFeed();
  renderStats();
}

function togglePause() {
  state.paused = !state.paused;
  els.pauseButton?.setAttribute("aria-pressed", String(state.paused));
  els.feedPanel?.classList.toggle("paused", state.paused);
  if (els.pausedBanner) els.pausedBanner.hidden = !state.paused;
  if (!state.paused) {
    state.unread = 0;
    renderFeed();
    toast("feed resumed");
  } else {
    toast("feed paused — buffering", "warn");
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
  const changed = state.linkState !== value;
  state.linkState = value;
  els.linkState?.setAttribute("data-state", value);
  if (els.linkLabel) els.linkLabel.textContent = value === "live" ? "LINK LIVE" : "LINK RETRY";
  if (!isOverlay && changed && state.linkSeen) {
    toast(value === "live" ? "event stream restored" : "event stream lost — retrying", value === "live" ? "ok" : "err");
  }
  if (value === "live") state.linkSeen = true;
}

function applySnapshot(snapshot) {
  state.messages = snapshot.messages || [];
  state.status = snapshot.status || {};
  state.stats = snapshot.stats || state.stats;
  state.sources = snapshot.sources || {};
  state.runtime = snapshot.runtime || state.runtime;
  renderAll();
}

function ingestMessage(message) {
  if (!message) return;
  if (isOverlay && overlayConfig.sources && !overlayConfig.sources.includes(message.source)) return;
  state.messages = [message, ...state.messages.filter((item) => item.id !== message.id)].slice(0, 250);

  if (state.paused && !isOverlay) {
    state.unread += 1;
    renderStats();
    return;
  }

  prependMessage(message);
  renderStats();
  if (!isOverlay) {
    renderSourceCards();
    alertWatchHit(message);
  }
}

function alertWatchHit(message) {
  const term = matchWatchlist(message);
  if (!term) return;
  const now = Date.now();
  if (now - (state.watchToastAt[term] || 0) < 8000) return;
  state.watchToastAt[term] = now;
  toast(`⚑ watch "${term}" — ${message.author.name}`, "warn");
  if (state.watchSound) beep();
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
    let summary = `${visible} visible / ${total} captured`;
    if (state.filter !== "all") summary += ` · ${state.filter}`;
    if (state.query) summary += ` · "${state.query.slice(0, 14)}"`;
    if (state.paused) summary += " · paused";
    if (state.runtime.liveOnly) summary += " · live-only";
    els.feedSummary.textContent = summary;
  }

  setNum(els.unreadCount, state.unread, true);
  setNum(els.duplicateCount, state.stats.duplicatesDropped || 0, true);
  setNum(els.bufferCount, state.messages.length, false);
  if (els.pausedBannerCount) els.pausedBannerCount.textContent = String(state.unread);
  if (els.pauseButton) {
    els.pauseButton.textContent = state.paused
      ? `Resume${state.unread ? ` (${state.unread})` : ""}`
      : "Pause";
  }
  renderDemoControls();

  document.querySelectorAll("[data-source-filter]").forEach((button) => {
    const target = button.querySelector("[data-count]");
    if (!target) return;
    const source = button.dataset.sourceFilter;
    const count = source === "all" ? total : state.stats.sources?.[source]?.count || 0;
    target.textContent = String(count);
  });

  renderTape(total, visible);
}

function renderDemoControls() {
  if (!els.spikeButton) return;
  const enabled = state.runtime.demoEnabled !== false;
  els.spikeButton.disabled = !enabled;
  els.spikeButton.textContent = enabled ? "Spike" : "Live only";
  els.spikeButton.title = enabled ? "Inject a demo burst" : "Demo disabled by DEMO_MODE=off";
  els.spikeButton.setAttribute("aria-disabled", String(!enabled));
}

function renderTape(total, visible) {
  if (!els.tape) return;
  const rate = messageRate();
  const sourceSegments = SOURCE_ORDER.map((source) => {
    const count = state.stats.sources?.[source]?.count || 0;
    return `<span class="src" style="--src:${escapeAttr(sourceColor(source))}">${escapeHtml(source)} <b>${pad(count)}</b></span>`;
  }).join("");
  els.tape.innerHTML = `
    <span>captured <b>${pad(total)}</b></span>
    <span>visible <b>${pad(visible)}</b></span>
    <span>rate <b>${rate}/min</b></span>
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
            <canvas class="spark" data-spark="${escapeAttr(source)}" aria-hidden="true"></canvas>
            <span class="metric-value">${sourceStats.count || 0}</span>
          </div>
          <p>${escapeHtml(status.detail || "idle")}</p>
          ${lastAt}
        </article>
      `;
    })
    .join("");
  drawSparks();
}

function renderFeed() {
  const target = isOverlay ? els.overlayFeed : els.feedList;
  if (!target) return;

  hideJumpPill();
  const messages = filteredMessages();
  if (messages.length === 0) {
    const copy = state.query ? "no matches — [esc] to clear" : "awaiting signal";
    target.innerHTML = `<li class="empty-state">${copy}</li>`;
    renderLoadOlder();
    return;
  }

  if (isOverlay) {
    const slice = messages
      .filter((message) => !overlayConfig.sources || overlayConfig.sources.includes(message.source))
      .slice(0, overlayConfig.max);
    const ordered = overlayConfig.align === "bottom" ? slice.slice().reverse() : slice;
    target.innerHTML = ordered.map((message) => overlayMarkup(message)).join("");
    if (overlayConfig.fade) {
      [...target.children].forEach((node) => scheduleOverlayFade(node));
    }
    return;
  }

  const cap = Math.min(MAX_TOTAL_RENDERED, MAX_RENDERED + state.older.length);
  target.innerHTML = collapseRuns(messages.slice(0, cap))
    .map(({ message, dupes }) => messageMarkup(message, dupes))
    .join("");
  target.scrollTop = 0;
  renderLoadOlder();
}

function collapseRuns(messages) {
  const rows = [];
  for (const message of messages) {
    const key = collapseKey(message);
    const last = rows[rows.length - 1];
    if (last && last.key === key) {
      last.dupes += 1;
      continue;
    }
    rows.push({ key, message, dupes: 1 });
  }
  return rows;
}

function collapseKey(message) {
  return `${message.source}|${String(message.content).trim().toLowerCase()}`;
}

function renderLoadOlder() {
  if (!els.loadOlderButton) return;
  if (state.loadingOlder) {
    els.loadOlderButton.textContent = "Loading…";
    els.loadOlderButton.disabled = true;
    return;
  }
  els.loadOlderButton.disabled = state.olderExhausted;
  els.loadOlderButton.textContent = state.olderExhausted
    ? "No older messages"
    : `Load older ⌄${state.older.length ? ` (${state.older.length} loaded)` : ""}`;
}

function prependMessage(message) {
  const target = isOverlay ? els.overlayFeed : els.feedList;
  if (!target) return;
  if (!passesFilter(message)) return;

  const empty = target.querySelector(".empty-state");
  if (empty) empty.remove();

  if (isOverlay) {
    const bottom = overlayConfig.align === "bottom";
    target.insertAdjacentHTML(bottom ? "beforeend" : "afterbegin", overlayMarkup(message));
    const node = bottom ? target.lastElementChild : target.firstElementChild;
    node?.classList.add("msg-enter");
    if (overlayConfig.fade && node) scheduleOverlayFade(node);
    while (target.children.length > overlayConfig.max) {
      (bottom ? target.firstElementChild : target.lastElementChild).remove();
    }
    return;
  }

  const atTop = target.scrollTop < 40;

  // Collapse repeats: if the newest rendered row is the same source+content, bump its badge.
  const first = target.firstElementChild;
  if (atTop && first && first.dataset.collapseKey === collapseKey(message)) {
    bumpCollapsedRow(first, message);
    return;
  }

  target.insertAdjacentHTML("afterbegin", messageMarkup(message));
  const node = target.firstElementChild;
  node?.classList.add("msg-enter");

  if (!atTop && node) {
    // Keep the viewport stable and offer a jump pill instead of yanking the scroll.
    const styles = getComputedStyle(target);
    const gap = parseFloat(styles.rowGap || "0") || 0;
    target.scrollTop += node.getBoundingClientRect().height + gap;
    state.newWhileAway += 1;
    showJumpPill();
  }

  const cap = Math.min(MAX_TOTAL_RENDERED, MAX_RENDERED + state.older.length);
  while (target.children.length > cap) {
    target.lastElementChild.remove();
  }
}

function bumpCollapsedRow(row, message) {
  const dupes = (Number(row.dataset.dupes) || 1) + 1;
  row.dataset.dupes = String(dupes);
  let badge = row.querySelector(".dupe-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "dupe-badge";
    row.querySelector(".msg-head .msg-spacer")?.before(badge);
  }
  badge.textContent = `×${dupes}`;
  const time = row.querySelector(".msg-time");
  if (time) time.textContent = formatTime(message.receivedAt);
  row.classList.remove("msg-enter");
  void row.offsetWidth;
  row.classList.add("msg-enter");
}

function showJumpPill() {
  if (!els.jumpPill) return;
  els.jumpPill.hidden = false;
  if (els.jumpCount) els.jumpCount.textContent = String(state.newWhileAway);
}

function hideJumpPill() {
  if (!els.jumpPill || els.jumpPill.hidden) {
    state.newWhileAway = 0;
    return;
  }
  state.newWhileAway = 0;
  els.jumpPill.hidden = true;
}

function messageMarkup(message, dupes = 1) {
  const selected = state.selectedId === message.id ? " selected" : "";
  const pinnedState = state.pinned.has(message.id);
  const watchTerm = matchWatchlist(message);
  const heat = message.heat || 0;
  const tier = heat >= 75 ? 3 : heat >= 50 ? 2 : heat >= PRIORITY_HEAT ? 1 : 0;
  const heatLevel = Math.min(4, Math.ceil(heat / 25));
  const heatBars = [1, 2, 3, 4]
    .map((step) => `<i${step <= heatLevel ? ' class="on"' : ""}></i>`)
    .join("");
  const verified = message.author.verified ? `<span class="verified" title="Verified">✓</span>` : "";
  const mode = message.mode && message.mode !== "live"
    ? `<span class="mode-tag">${escapeHtml(message.mode)}</span>`
    : "";
  const channel = message.channel ? `<span class="channel">#${escapeHtml(message.channel)}</span>` : "";
  const authorQ = message.author.handle || message.author.name;
  const watchTag = watchTerm ? `<span class="watch-tag" title="Watchlist hit">⚑ ${escapeHtml(watchTerm)}</span>` : "";
  const dupeBadge = dupes > 1 ? `<span class="dupe-badge" title="${dupes} repeats collapsed">×${dupes}</span>` : "";

  return `
    <li class="message${selected}${pinnedState ? " pinned-state" : ""}${watchTerm ? " watch-hit" : ""}" data-message-id="${escapeAttr(message.id)}" data-collapse-key="${escapeAttr(collapseKey(message))}" data-dupes="${dupes}" style="--src:${escapeAttr(message.sourceColor)}">
      <div class="msg-head">
        <span class="src-tag">${escapeHtml(message.sourceLabel)}</span>
        <span class="author" role="button" tabindex="0" data-author-q="${escapeAttr(authorQ)}" title="Filter feed to ${escapeAttr(authorQ)}" style="color:${escapeAttr(visibleColor(message.author.color || message.sourceColor))}">${escapeHtml(message.author.name)}</span>
        ${verified}
        <span class="handle">${escapeHtml(formatHandle(message.author.handle))}</span>
        ${channel}
        ${mode}
        ${watchTag}
        ${dupeBadge}
        <span class="msg-spacer"></span>
        <span class="heat" data-tier="${tier}" title="Heat ${heat}"><span class="heat-bar">${heatBars}</span>${heat}</span>
        <time class="msg-time">${escapeHtml(formatTime(message.receivedAt))}</time>
        <button type="button" class="pin-btn" data-pin-id="${escapeAttr(message.id)}">${pinnedState ? "Unpin" : "Pin"}</button>
      </div>
      <p class="msg-content">${enrichContent(message.content, state.query)}</p>
    </li>
  `;
}

function overlayMarkup(message) {
  return `
    <li class="overlay-item" style="--src:${escapeAttr(message.sourceColor)}">
      <span class="src-tag">${escapeHtml(message.sourceLabel)}</span>
      <div>
        <strong style="color:${escapeAttr(visibleColor(message.author.color || message.sourceColor))}">${escapeHtml(message.author.name)}</strong>
        <p class="msg-content">${enrichContent(message.content, "")}</p>
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
  if (previous) {
    els.feedList?.querySelector(`[data-message-id="${cssEscape(previous)}"]`)?.classList.remove("selected");
  }
  els.feedList?.querySelector(`[data-message-id="${cssEscape(id)}"]`)?.classList.add("selected");
}

function togglePin(id) {
  const message = state.pinned.get(id) || state.messages.find((item) => item.id === id);
  if (!message) return;
  const pinnedNow = !state.pinned.has(id);
  if (pinnedNow) state.pinned.set(id, message);
  else state.pinned.delete(id);
  savePins();
  renderPinned();
  toast(pinnedNow ? "pinned" : "unpinned");

  const row = els.feedList?.querySelector(`[data-message-id="${cssEscape(id)}"]`);
  if (row) {
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

/* ---------- toasts ---------- */

function toast(text, tone = "ok") {
  if (!els.toastRoot) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.dataset.tone = tone;
  node.textContent = text;
  els.toastRoot.append(node);
  while (els.toastRoot.children.length > 4) {
    els.toastRoot.firstElementChild.remove();
  }
  setTimeout(() => node.classList.add("out"), 2200);
  setTimeout(() => node.remove(), 2600);
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
  const liveIds = new Set(state.messages.map((message) => message.id));
  const older = state.older.filter((message) => !liveIds.has(message.id));
  return [...state.messages, ...older].filter(passesFilter);
}

function filterByAuthor(query) {
  const value = String(query || "").trim();
  if (!value) return;
  state.query = value.toLowerCase();
  if (els.searchInput) els.searchInput.value = value;
  renderFeed();
  renderStats();
  toast(`filtering "${value}" — [esc] to clear`);
}

/* ---------- watchlist ---------- */

function loadWatchlist() {
  try {
    const items = JSON.parse(localStorage.getItem(WATCH_STORAGE_KEY) || "[]");
    return Array.isArray(items) ? items.filter((term) => typeof term === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(state.watchlist));
  } catch {
    /* in-memory only */
  }
}

function loadWatchSound() {
  try {
    return localStorage.getItem(WATCH_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

function saveWatchSound() {
  try {
    localStorage.setItem(WATCH_SOUND_KEY, state.watchSound ? "1" : "0");
  } catch {
    /* in-memory only */
  }
}

function addWatchTerm() {
  const term = (els.watchInput?.value || "").trim().toLowerCase();
  if (!term) return;
  if (state.watchlist.includes(term)) {
    toast("already watching that term", "warn");
    return;
  }
  if (state.watchlist.length >= 12) {
    toast("watchlist capped at 12 terms", "warn");
    return;
  }
  state.watchlist.push(term);
  if (els.watchInput) els.watchInput.value = "";
  saveWatchlist();
  renderWatchlist();
  renderFeed();
  toast(`watching "${term}"`);
}

function removeWatchTerm(term) {
  state.watchlist = state.watchlist.filter((item) => item !== term);
  saveWatchlist();
  renderWatchlist();
  renderFeed();
}

function renderWatchlist() {
  if (!els.watchChips) return;
  if (state.watchlist.length === 0) {
    els.watchChips.innerHTML = `<span class="watch-empty">no terms — alerts off</span>`;
    return;
  }
  els.watchChips.innerHTML = state.watchlist
    .map((term) => `<button type="button" class="watch-chip" data-watch-term="${escapeAttr(term)}" title="Remove ${escapeAttr(term)}">${escapeHtml(term)} ×</button>`)
    .join("");
}

function matchWatchlist(message) {
  if (state.watchlist.length === 0) return null;
  const haystack = `${message.content} ${message.author.name} ${message.author.handle}`.toLowerCase();
  return state.watchlist.find((term) => haystack.includes(term)) || null;
}

let audioContext = null;

function beep() {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.04, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.13);
  } catch {
    /* audio unavailable */
  }
}

/* ---------- history ---------- */

async function loadOlder() {
  if (state.loadingOlder || state.olderExhausted) return;
  state.loadingOlder = true;
  renderLoadOlder();

  try {
    const all = [...state.messages, ...state.older];
    const oldest = all.reduce(
      (min, message) => (new Date(message.receivedAt) < new Date(min) ? message.receivedAt : min),
      new Date().toISOString()
    );
    const response = await fetch(`/history.json?before=${encodeURIComponent(oldest)}&limit=${HISTORY_PAGE}`);
    const page = await response.json();
    const known = new Set(all.map((message) => message.id));
    const fresh = (page.messages || []).filter((message) => !known.has(message.id));
    state.older = [...state.older, ...fresh];
    state.olderExhausted = Boolean(page.exhausted) || fresh.length === 0;

    if (!page.historyEnabled) {
      toast("history disabled on this server", "warn");
    } else if (fresh.length > 0) {
      appendOlderRows(fresh);
      toast(`loaded ${fresh.length} older message${fresh.length === 1 ? "" : "s"}`);
    } else {
      toast("no older messages", "warn");
    }
  } catch {
    toast("history fetch failed", "err");
  } finally {
    state.loadingOlder = false;
    renderLoadOlder();
    renderStats();
  }
}

function appendOlderRows(messages) {
  const target = els.feedList;
  if (!target) return;
  const rows = collapseRuns(messages.filter(passesFilter));
  target.insertAdjacentHTML(
    "beforeend",
    rows.map(({ message, dupes }) => `${messageMarkup(message, dupes)}`).join("")
  );
  [...target.children].slice(-rows.length).forEach((node) => node.classList.add("older-row"));
}

/* ---------- setup drawer ---------- */

function isSetupOpen() {
  return Boolean(els.setupDrawer && !els.setupDrawer.hidden);
}

async function openSetup() {
  if (!els.setupDrawer) return;
  els.setupDrawer.hidden = false;
  if (els.setupBackdrop) els.setupBackdrop.hidden = false;
  await refreshSetup();
}

function closeSetup() {
  if (els.setupDrawer) els.setupDrawer.hidden = true;
  if (els.setupBackdrop) els.setupBackdrop.hidden = true;
}

async function refreshSetup() {
  try {
    const response = await fetch("/setup.json");
    state.setup = await response.json();
    renderSetup();
  } catch {
    if (els.setupBody) els.setupBody.innerHTML = `<p class="setup-loading">setup unavailable</p>`;
  }
}

function renderSetup() {
  if (!els.setupBody || !state.setup) return;
  const setup = state.setup;
  const twitch = setup.sources.twitch;
  const kick = setup.sources.kick;
  const x = setup.sources.x;

  const varRow = (name, present) => `
    <div class="env-row" data-present="${present}">
      <span class="env-dot"></span>
      <code>${escapeHtml(name)}</code>
      <span class="env-state">${present ? "set" : "missing"}</span>
    </div>
  `;
  const varRows = (vars) => Object.entries(vars).map(([name, present]) => varRow(name, present)).join("");

  const channelChips = twitch.channels.length
    ? twitch.channels
        .map((channel) => `<button type="button" class="watch-chip" data-channel-remove="${escapeAttr(channel)}" title="Remove #${escapeAttr(channel)}">#${escapeHtml(channel)} ×</button>`)
        .join("")
    : `<span class="watch-empty">no channels yet</span>`;

  const channelManager = twitch.channelsMutable
    ? `
      <div class="watch-add">
        <input id="channelInput" type="text" placeholder="twitch channel" autocomplete="off" spellcheck="false" maxlength="25">
        <button type="button" id="channelAddButton">Join</button>
      </div>
      <div class="watch-chips">${channelChips}</div>
      <p class="setup-note">Anonymous read-only IRC joins instantly — no credentials needed.${setup.adminLocked ? " Admin token required." : ""}</p>
    `
    : `<p class="setup-note">EventSub mode active — subscriptions follow TWITCH_BROADCASTER_USER_ID.</p>`;

  els.setupBody.innerHTML = `
    <section class="setup-section" style="--src:${escapeAttr(sourceColor("twitch"))}">
      <h3>Twitch <small>${escapeHtml(twitch.path)}</small></h3>
      ${channelManager}
      <details class="env-details">
        <summary>EventSub vars</summary>
        ${varRows(twitch.eventsubVars)}
      </details>
      <details class="env-details">
        <summary>IRC vars</summary>
        ${varRows(twitch.ircVars)}
      </details>
    </section>

    <section class="setup-section" style="--src:${escapeAttr(sourceColor("x"))}">
      <h3>X <small>filtered stream</small></h3>
      ${varRows(x.vars)}
      <p class="setup-note">${escapeHtml(x.note)}</p>
    </section>

    <section class="setup-section" style="--src:${escapeAttr(sourceColor("kick"))}">
      <h3>Kick <small>webhooks</small></h3>
      ${varRows(kick.vars)}
      <div class="webhook-row">
        <code id="webhookUrl">${escapeHtml(kick.webhookUrl)}</code>
        <button type="button" class="mini-btn" id="copyWebhookButton">Copy</button>
      </div>
      <p class="setup-note">${escapeHtml(kick.note)}</p>
    </section>

    <section class="setup-section">
      <h3>Runtime</h3>
      <div class="env-row" data-present="${setup.demo.enabled}">
        <span class="env-dot"></span><code>DEMO_MODE</code><span class="env-state">${escapeHtml(setup.demo.mode)}</span>
      </div>
      <div class="env-row" data-present="${setup.history.enabled}">
        <span class="env-dot"></span><code>HISTORY</code><span class="env-state">${setup.history.enabled ? "on" : "off"}</span>
      </div>
      <div class="env-row" data-present="${setup.adminLocked}">
        <span class="env-dot"></span><code>ADMIN_TOKEN</code><span class="env-state">${setup.adminLocked ? "locked" : "open"}</span>
      </div>
    </section>
  `;
}

function onSetupClick(event) {
  const remove = event.target.closest("[data-channel-remove]");
  if (remove) {
    submitChannel("remove", remove.dataset.channelRemove);
    return;
  }
  if (event.target.id === "channelAddButton") {
    submitChannel("add", document.querySelector("#channelInput")?.value);
    return;
  }
  if (event.target.id === "copyWebhookButton") {
    const url = document.querySelector("#webhookUrl")?.textContent || "";
    navigator.clipboard
      .writeText(url)
      .then(() => toast("webhook url copied"))
      .catch(() => toast("clipboard unavailable", "err"));
  }
}

async function submitChannel(action, rawChannel) {
  const channel = String(rawChannel || "").trim().toLowerCase().replace(/^#/, "");
  if (!channel) return;
  try {
    await postJson("/api/twitch/channels", { action, channel });
    toast(action === "add" ? `joining #${channel}` : `left #${channel}`);
    await refreshSetup();
  } catch {
    toast(`channel ${action} failed`, "err");
  }
}

/* ---------- overlay config ---------- */

function parseOverlayConfig() {
  const params = new URLSearchParams(location.search);
  const sources = (params.get("sources") || "")
    .split(",")
    .map((source) => source.trim().toLowerCase())
    .filter((source) => SOURCE_ORDER.includes(source));
  return {
    max: clampNumber(params.get("max"), 1, 12, OVERLAY_RENDERED),
    fade: clampNumber(params.get("fade"), 0, 600, 0),
    scale: clampNumber(params.get("scale"), 0.6, 2, 1),
    align: params.get("align") === "bottom" ? "bottom" : "top",
    sources: sources.length > 0 ? sources : null
  };
}

function applyOverlayConfig() {
  if (!els.overlayRoot) return;
  if (overlayConfig.scale !== 1) els.overlayRoot.style.zoom = String(overlayConfig.scale);
  if (overlayConfig.align === "bottom") els.overlayRoot.classList.add("align-bottom");
}

function scheduleOverlayFade(node) {
  if (!overlayConfig.fade) return;
  setTimeout(() => {
    node.classList.add("overlay-out");
    setTimeout(() => node.remove(), 450);
  }, overlayConfig.fade * 1000);
}

function clampNumber(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/* ---------- service worker ---------- */

function registerServiceWorker() {
  if (isOverlay || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* PWA features unavailable */
    });
  });
}

/* ---------- ticker: clock, uptime, radar, sparks ---------- */

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
  drawSparks();
}

function bucketize(messages, buckets, bucketMs) {
  const counts = new Array(buckets).fill(0);
  const now = Date.now();
  for (const message of messages) {
    const age = Math.max(0, now - new Date(message.receivedAt).getTime());
    const bucket = Math.floor(age / bucketMs);
    if (bucket < buckets) counts[buckets - 1 - bucket] += 1;
  }
  return counts;
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

  ctx.strokeStyle = "rgba(236, 233, 223, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (cssHeight / 4) * i + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssWidth, y);
    ctx.stroke();
  }

  const perSource = Object.fromEntries(
    SOURCE_ORDER.map((source) => [
      source,
      bucketize(state.messages.filter((m) => m.source === source), RADAR_BUCKETS, RADAR_BUCKET_MS)
    ])
  );

  const totals = new Array(RADAR_BUCKETS).fill(0);
  for (const source of SOURCE_ORDER) {
    perSource[source].forEach((value, index) => {
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
      const value = perSource[source][index];
      if (!value) continue;
      const barHeight = (value / max) * (cssHeight - 14);
      ctx.fillStyle = sourceColor(source);
      ctx.fillRect(index * slot + 1, y - barHeight, barWidth, barHeight);
      y -= barHeight;
    }
  }

  if (els.radarPeak) {
    const peak = Math.max(0, ...totals);
    els.radarPeak.textContent = peak > 0 ? `peak ${peak}` : "";
  }
}

function drawSparks() {
  document.querySelectorAll("[data-spark]").forEach((canvas) => {
    const source = canvas.dataset.spark;
    if (!canvas.clientWidth) return;

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

    const counts = bucketize(state.messages.filter((m) => m.source === source), 20, 3000);
    const max = Math.max(1, ...counts);
    const step = cssWidth / (counts.length - 1);
    const color = sourceColor(source);

    ctx.beginPath();
    counts.forEach((value, index) => {
      const x = index * step;
      const y = cssHeight - 2 - (value / max) * (cssHeight - 5);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineTo(cssWidth, cssHeight);
    ctx.lineTo(0, cssHeight);
    ctx.closePath();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function messageRate() {
  const cutoff = Date.now() - 60000;
  return state.messages.filter((m) => new Date(m.receivedAt).getTime() >= cutoff).length;
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

/* ---------- content enrichment ---------- */

function enrichContent(content, query) {
  const parts = String(content).split(/(https?:\/\/[^\s]+)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        const href = escapeAttr(part);
        let label = part.replace(/^https?:\/\//, "");
        if (label.length > 42) label = `${label.slice(0, 40)}…`;
        return `<a href="${href}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
      }
      let html = escapeHtml(part);
      if (query) html = markMatches(html, query);
      html = html.replace(/\$([A-Za-z]{2,8})\b/g, `<span class="cashtag">$$$1</span>`);
      html = html.replace(/@(\w{2,30})\b/g, `<span class="mention">@$1</span>`);
      return html;
    })
    .join("");
}

function markMatches(escapedText, query) {
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escapedQuery) return escapedText;
  try {
    return escapedText.replace(new RegExp(`(${escapedQuery})`, "gi"), "<mark>$1</mark>");
  } catch {
    return escapedText;
  }
}

/* ---------- helpers ---------- */

async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function sourceColor(source) {
  return state.sources[source]?.color || FALLBACK_COLORS[source] || "#888";
}

function visibleColor(value) {
  // Clamp dark author colors (e.g. navy Twitch handles) to stay legible on the dark theme.
  const rgb = parseColor(value);
  if (!rgb) return value;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  if (luminance >= 0.45) return value;
  const lift = (channel) => Math.round(channel + (255 - channel) * 0.55);
  return `rgb(${lift(rgb.r)}, ${lift(rgb.g)}, ${lift(rgb.b)})`;
}

function parseColor(value) {
  const hex = String(value || "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16)
    };
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (long) {
    return {
      r: parseInt(long[1], 16),
      g: parseInt(long[2], 16),
      b: parseInt(long[3], 16)
    };
  }
  return null;
}

function setNum(el, value, flash) {
  if (!el) return;
  const next = String(value);
  if (el.textContent === next) return;
  el.textContent = next;
  if (!flash) return;
  el.classList.remove("tick");
  void el.offsetWidth;
  el.classList.add("tick");
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
