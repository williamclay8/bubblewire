const isJudgeRoute = location.pathname === "/judge";
const isOverlay = location.pathname === "/overlay" || location.pathname === "/overlay.html";

const MAX_RENDERED = 80;
const MAX_TOTAL_RENDERED = 360;
const OVERLAY_RENDERED = 6;
const PRIORITY_HEAT = 18;
const PIN_STORAGE_KEY = "bubblewire:pins:v1";
const WATCH_STORAGE_KEY = "bubblewire:watchlist:v1";
const WATCH_SOUND_KEY = "bubblewire:watchsound:v1";
const WATCH_NOTIFY_KEY = "bubblewire:watchnotify:v1";
const THEME_KEY = "bubblewire:theme:v1";
const DENSITY_KEY = "bubblewire:density:v1";
const PREFS_KEY = "bubblewire:prefs:v1";
const ACTIVATION_STORAGE_KEY = "bubblewire:activation:v1";
const WORKSPACE_STORAGE_KEY = "bubblewire:workspace:v1";
const SESSION_STORAGE_KEY = "bubblewire:session:v1";
const MOD_QUEUE_STORAGE_KEY = "bubblewire:modqueue:v1";
const SAFETY_STORAGE_KEY = "bubblewire:safety:v1";
const SIGNAL_PRESET_KEY = "bubblewire:signal-preset:v1";
const HERO_KEY = "bubblewire:hero-dismissed:v1";
const BOOT_KEY = "bubblewire:booted";
const COMMAND_KEY = "bubblewire:command:v1";
const THEMES = ["gold", "matrix", "ice", "synthwave"];
const HISTORY_PAGE = 60;
const RADAR_BUCKETS = 30;
const RADAR_BUCKET_MS = 2000;
const SOURCE_ORDER = ["twitch", "x", "kick", "xlive"];
const OVERLAY_PRESETS = {
  broadcast: { mode: "feed", max: OVERLAY_RENDERED, fade: 0, scale: 1, align: "top", sources: SOURCE_ORDER },
  ticker: { mode: "feed", max: 3, fade: 35, scale: 0.8, align: "bottom", sources: ["x", "kick", "twitch"] },
  approved: { mode: "approved", approvedOnly: true, max: 8, fade: 0, scale: 1.05, align: "top", sources: SOURCE_ORDER },
  moments: { mode: "moments", max: 5, fade: 0, scale: 1.08, align: "top", sources: SOURCE_ORDER },
  questions: { mode: "questions", max: 9, fade: 0, scale: 1.1, align: "bottom", sources: ["twitch", "kick", "x"] }
};
const SIGNAL_PRESETS = {
  balanced: { label: "Balanced", heat: 18, watch: [] },
  market: { label: "Market", heat: 16, watch: ["$btc", "$eth", "fed", "polymarket", "odds"] },
  qna: { label: "Q&A", heat: 10, watch: ["?", "question", "explain", "what", "how"] },
  launch: { label: "Launch", heat: 14, watch: ["ship", "bug", "pricing", "signup", "demo"] },
  highSignal: { label: "High Signal", heat: 32, watch: ["alpha", "leak", "breaking", "confirmed"] }
};
const FALLBACK_COLORS = { twitch: "#9146ff", x: "#f4f2ea", kick: "#53fc18", xlive: "#ff5c5c", demo: "#d8a84a" };

const overlayConfig = parseOverlayConfig();
const stream = { particles: [], running: false };

const state = {
  messages: [],
  status: {},
  stats: { totalMessages: 0, duplicatesDropped: 0, sources: {} },
  proof: { sources: {} },
  analysis: null,
  lastMoodTone: null,
  sources: {},
  runtime: { demoEnabled: true, demoMode: "on", demoRunning: false, liveOnly: false },
  judgeMode: isJudgeRoute,
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
  setup: null,
  serverSession: null,
  workspace: loadWorkspace(),
  sessionDesk: loadSessionDesk(),
  modQueue: loadModeratorQueue(),
  safety: loadSafetyRules(),
  signalPreset: loadSignalPreset(),
  watchNotify: loadFlag(WATCH_NOTIFY_KEY),
  activation: loadActivation(),
  theme: "gold",
  density: "comfortable",
  watching: 0,
  hiddenUnseen: 0,
  spikeUntil: 0,
  lastSpikeAt: 0,
  session: {
    peakRate: 0,
    hottest: null,
    watchHits: 0,
    authors: new Map(),
    startedAt: Date.now()
  }
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
  proofReceipt: document.querySelector("#proofReceipt"),
  momentRail: document.querySelector("#momentRail"),
  momentRailList: document.querySelector("#momentRailList"),
  momentShareLatest: document.querySelector("#momentShareLatest"),
  moodReadout: document.querySelector("#moodReadout"),
  moodBadge: document.querySelector("#moodBadge"),
  moodBadgeLabel: document.querySelector("#moodBadgeLabel"),
  momentsList: document.querySelector("#momentsList"),
  momentCount: document.querySelector("#momentCount"),
  trendChips: document.querySelector("#trendChips"),
  questionsList: document.querySelector("#questionsList"),
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
  setupClose: document.querySelector("#setupClose"),
  proofConsole: document.querySelector("#proofConsole"),
  proofConsoleBody: document.querySelector("#proofConsoleBody"),
  proofRefreshButton: document.querySelector("#proofRefreshButton"),
  workspacePanel: document.querySelector("#workspacePanel"),
  workspaceName: document.querySelector("#workspaceName"),
  workspaceSaveButton: document.querySelector("#workspaceSaveButton"),
  workspaceLoadButton: document.querySelector("#workspaceLoadButton"),
  workspaceCopyOverlayButton: document.querySelector("#workspaceCopyOverlayButton"),
  workspaceSummary: document.querySelector("#workspaceSummary"),
  sessionDesk: document.querySelector("#sessionDesk"),
  sessionPreflight: document.querySelector("#sessionPreflight"),
  sessionProofButton: document.querySelector("#sessionProofButton"),
  sessionStartButton: document.querySelector("#sessionStartButton"),
  sessionEndButton: document.querySelector("#sessionEndButton"),
  moderatorQueue: document.querySelector("#moderatorQueue"),
  moderatorQueueList: document.querySelector("#moderatorQueueList"),
  moderatorQueueClearButton: document.querySelector("#moderatorQueueClearButton"),
  replayStudio: document.querySelector("#replayStudio"),
  replayExportButton: document.querySelector("#replayExportButton"),
  replaySummary: document.querySelector("#replaySummary"),
  guidedSetupPanel: document.querySelector("#guidedSetupPanel"),
  guidedSetupList: document.querySelector("#guidedSetupList"),
  safetyPanel: document.querySelector("#safetyPanel"),
  safetyBlockedInput: document.querySelector("#safetyBlockedInput"),
  safetySaveButton: document.querySelector("#safetySaveButton"),
  safetyApprovedOnly: document.querySelector("#safetyApprovedOnly"),
  signalPresetSelect: document.querySelector("#signalPresetSelect"),
  judgeBrief: document.querySelector("#judgeBrief"),
  judgeBriefMetrics: document.querySelector("#judgeBriefMetrics"),
  judgeDemoButton: document.querySelector("#judgeDemoButton"),
  signalStream: document.querySelector("#signalStream"),
  productCommand: document.querySelector("#productCommand"),
  commandToggle: document.querySelector("#commandToggle"),
  productDemoButton: document.querySelector("#productDemoButton"),
  connectSourcesButton: document.querySelector("#connectSourcesButton"),
  focusFeedButton: document.querySelector("#focusFeedButton"),
  overlaySetupLink: document.querySelector("#overlaySetupLink"),
  proofMetrics: document.querySelector("#proofMetrics"),
  launchChecklist: document.querySelector("#launchChecklist"),
  channelHero: document.querySelector("#channelHero"),
  heroChannelInput: document.querySelector("#heroChannelInput"),
  heroWatchButton: document.querySelector("#heroWatchButton"),
  heroDismiss: document.querySelector("#heroDismiss"),
  watchingChip: document.querySelector("#watchingChip"),
  watchingCount: document.querySelector("#watchingCount"),
  densityToggle: document.querySelector("#densityToggle"),
  watchNotifyToggle: document.querySelector("#watchNotify"),
  recapButton: document.querySelector("#recapButton"),
  shareViewButton: document.querySelector("#shareViewButton"),
  spikeChip: document.querySelector("#spikeChip"),
  bootScreen: document.querySelector("#bootScreen"),
  bootLog: document.querySelector("#bootLog"),
  favicon: document.querySelector('link[rel="icon"]')
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

applyStoredPrefs();
bindControls();
renderProductSurface();
applyUrlState();
connectEvents();
loadSnapshot();
loadSetupSnapshot().catch(() => {});
loadSessionSnapshot().catch(() => {});
startTicker();
registerServiceWorker();
if (!isOverlay) {
  runBootSequence();
  startSignalStream();
  watchTabVisibility();
  maybeShowChannelHero();
}

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
    savePrefs();
    renderFeed();
    renderStats();
    toast(state.priorityOnly ? `priority only — heat ≥ ${currentHeatThreshold()}` : "showing all heat levels");
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
    const queue = event.target.closest("[data-queue-id]");
    if (queue) {
      event.stopPropagation();
      queueMessageForReview(queue.dataset.queueId);
      return;
    }
    const feature = event.target.closest("[data-feature-id]");
    if (feature) {
      event.stopPropagation();
      featureMessageForOverlay(feature.dataset.featureId);
      return;
    }
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

  els.momentsList?.addEventListener("click", (event) => {
    const moment = event.target.closest("[data-moment-id]");
    if (moment) jumpToMessage(moment.dataset.momentId);
  });

  els.momentRailList?.addEventListener("click", (event) => {
    const share = event.target.closest("[data-moment-share]");
    if (share) {
      event.stopPropagation();
      shareMoment(share.dataset.momentShare);
      return;
    }
    const replay = event.target.closest("[data-moment-replay]");
    if (replay) {
      event.stopPropagation();
      jumpToMessage(replay.dataset.momentReplay);
      return;
    }
    const moment = event.target.closest("[data-moment-id]");
    if (moment) jumpToMessage(moment.dataset.momentId);
  });

  els.momentShareLatest?.addEventListener("click", () => {
    const latest = state.analysis?.moments?.[0];
    if (!latest) {
      toast("no moment to share yet", "warn");
      return;
    }
    shareMoment(latest.id);
  });

  els.questionsList?.addEventListener("click", (event) => {
    const question = event.target.closest("[data-question-id]");
    if (question) jumpToMessage(question.dataset.questionId);
  });

  els.trendChips?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-trend]");
    if (chip) {
      els.searchInput.value = chip.dataset.trend;
      state.query = chip.dataset.trend.toLowerCase();
      renderFeed();
      renderStats();
      toast(`filtering "${chip.dataset.trend}"`);
    }
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

  // Theme + density + share + recap
  document.querySelectorAll("[data-theme-pick]").forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.themePick));
  });
  els.densityToggle?.addEventListener("change", (event) => {
    setDensity(event.target.checked ? "compact" : "comfortable");
  });
  els.shareViewButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildViewUrl());
      trackActivation("share");
      toast("view link copied");
    } catch {
      toast("clipboard unavailable", "err");
    }
  });
  els.recapButton?.addEventListener("click", downloadRecap);
  els.judgeDemoButton?.addEventListener("click", runProductDemo);
  els.productDemoButton?.addEventListener("click", runProductDemo);
  els.connectSourcesButton?.addEventListener("click", () => {
    trackActivation("setup");
    openSetup();
  });
  els.focusFeedButton?.addEventListener("click", () => {
    trackActivation("feed");
    setCommandCollapsed(true);
    els.feedPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    els.feedList?.focus?.();
  });
  els.commandToggle?.addEventListener("click", () => {
    setCommandCollapsed(!els.productCommand?.classList.contains("collapsed"));
  });
  initCommandCollapse();
  els.overlaySetupLink?.addEventListener("click", () => trackActivation("overlay"));
  els.launchChecklist?.addEventListener("click", onLaunchChecklistClick);
  document.querySelectorAll("[data-copy-overlay-mode]").forEach((button) => {
    button.addEventListener("click", () => copyOverlayModeUrl(button.dataset.copyOverlayMode));
  });

  // Channel hero
  els.heroWatchButton?.addEventListener("click", () => heroWatch());
  els.heroChannelInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      heroWatch();
    }
  });
  els.heroDismiss?.addEventListener("click", () => {
    hideChannelHero();
    saveFlag(HERO_KEY, true);
  });

  // Avatar load failures → initial fallback chip.
  els.feedList?.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains("avatar")) return;
      const fallback = document.createElement("span");
      fallback.className = "avatar avatar-fallback";
      fallback.style.setProperty("--src", img.dataset.src || "var(--gold)");
      fallback.textContent = img.dataset.initial || "?";
      img.replaceWith(fallback);
    },
    true
  );

  // Watchlist
  renderWatchlist();
  if (els.watchSoundToggle) els.watchSoundToggle.checked = state.watchSound;
  if (els.watchNotifyToggle) els.watchNotifyToggle.checked = state.watchNotify && notificationsGranted();
  els.watchNotifyToggle?.addEventListener("change", onNotifyToggle);
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
  els.proofRefreshButton?.addEventListener("click", () => loadSetupSnapshot({ announce: true }));
  els.workspaceSaveButton?.addEventListener("click", saveWorkspaceSnapshot);
  els.workspaceLoadButton?.addEventListener("click", applyWorkspaceSnapshot);
  els.workspaceCopyOverlayButton?.addEventListener("click", copyWorkspaceOverlayUrl);
  els.sessionProofButton?.addEventListener("click", copyProofPacketUrl);
  els.sessionStartButton?.addEventListener("click", startSessionDesk);
  els.sessionEndButton?.addEventListener("click", endSessionDesk);
  els.moderatorQueueList?.addEventListener("click", onModeratorQueueClick);
  els.moderatorQueueClearButton?.addEventListener("click", clearModeratorQueue);
  els.replayExportButton?.addEventListener("click", exportReplayBundle);
  els.safetySaveButton?.addEventListener("click", saveSafetyFromControls);
  els.safetyApprovedOnly?.addEventListener("change", (event) => {
    state.safety.approvedOnly = event.target.checked;
    saveSafetyRules();
    renderSafetyPanel();
    renderFeed();
    toast(state.safety.approvedOnly ? "overlay approval gate on" : "overlay approval gate off");
  });
  els.signalPresetSelect?.addEventListener("change", (event) => applySignalPreset(event.target.value));
  els.setupBody?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "channelInput") {
      event.preventDefault();
      submitChannel("add", event.target.value);
    }
    if (event.key === "Enter" && event.target.id === "xliveInput") {
      event.preventDefault();
      submitXLiveBroadcast(event.target.value);
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
    } else if (["1", "2", "3", "4", "5"].includes(event.key)) {
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
  savePrefs();
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

async function loadSessionSnapshot() {
  try {
    const response = await fetch("/session.json");
    state.serverSession = await response.json();
    renderSessionDesk();
  } catch {
    throw new Error("session unavailable");
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
    state.proof = payload.proof || state.proof;
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
  events.addEventListener("presence", (event) => {
    const payload = JSON.parse(event.data);
    state.watching = payload.watching || 0;
    renderWatching();
  });
  events.addEventListener("analysis", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.analysis) {
      state.analysis = payload.analysis;
      renderAnalysis();
    }
  });
}

function renderWatching() {
  if (!els.watchingChip) return;
  const show = state.watching >= 1;
  els.watchingChip.hidden = !show;
  if (show && els.watchingCount) els.watchingCount.textContent = String(state.watching);
}

/* ---------- intelligence layer ---------- */

const MOOD_GLYPH = { hyped: "▲▲", positive: "▲", neutral: "▬", restless: "▽", negative: "▼▼", quiet: "··" };

function renderAnalysis() {
  if (isOverlay) return;
  renderMood();
  renderMomentRail();
  renderMoments();
  renderTrends();
  renderQuestions();
}

function renderMood() {
  const analysis = state.analysis;
  if (els.moodBadge) {
    if (!analysis || !analysis.overall?.samples) {
      els.moodBadge.hidden = true;
    } else {
      const overall = analysis.overall;
      els.moodBadge.hidden = false;
      els.moodBadge.dataset.tone = overall.tone;
      if (els.moodBadgeLabel) els.moodBadgeLabel.textContent = overall.mood;
      // Announce a tone flip once, as a toast — the headline demo beat.
      if (state.lastMoodTone && state.lastMoodTone !== overall.tone && overall.samples >= 5) {
        const verb = overall.tone === "pos" ? "lifting" : overall.tone === "neg" ? "turning negative" : "leveling out";
        toast(`chat mood ${verb} — ${overall.mood}`, overall.tone === "neg" ? "warn" : "ok");
      }
      state.lastMoodTone = overall.tone;
    }
  }

  if (!els.moodReadout) return;
  if (!analysis) {
    els.moodReadout.innerHTML = `<p class="intel-empty">listening…</p>`;
    return;
  }

  const overall = analysis.overall || { mood: "quiet", tone: "neutral", score: 0, samples: 0 };
  const rows = SOURCE_ORDER.map((source) => {
    const data = analysis.sources?.[source] || { mood: "quiet", tone: "neutral", score: 0, samples: 0 };
    const pct = Math.round(((data.score + 1) / 2) * 100);
    return `
      <div class="mood-row" data-tone="${escapeAttr(data.tone)}" style="--src:${escapeAttr(sourceColor(source))}">
        <span class="mood-src">${escapeHtml(source)}</span>
        <span class="mood-track"><span class="mood-fill" style="left:${pct}%"></span></span>
        <span class="mood-label">${escapeHtml(data.mood)}</span>
      </div>
    `;
  }).join("");

  els.moodReadout.innerHTML = `
    <div class="mood-overall" data-tone="${escapeAttr(overall.tone)}">
      <span class="mood-overall-glyph">${MOOD_GLYPH[overall.mood] || "▬"}</span>
      <span class="mood-overall-label">${escapeHtml(overall.mood)}</span>
      <span class="mood-overall-meta">${overall.samples} msgs · ${analysis.windowSeconds}s</span>
    </div>
    ${rows}
  `;
}

function renderMoments() {
  if (!els.momentsList) return;
  const moments = state.analysis?.moments || [];
  if (els.momentCount) els.momentCount.textContent = String(moments.length);
  if (moments.length === 0) {
    els.momentsList.innerHTML = `<p class="intel-empty">no standout moments yet — spikes and charged messages land here</p>`;
    return;
  }
  els.momentsList.innerHTML = moments
    .map((moment) => `
      <button type="button" class="moment" data-moment-id="${escapeAttr(moment.id)}" data-tone="${escapeAttr(moment.tone)}" style="--src:${escapeAttr(sourceColor(moment.source))}" title="Jump to this message">
        <span class="moment-head">
          <span class="src-tag">${escapeHtml(moment.sourceLabel || moment.source)}</span>
          <span class="moment-reason">${escapeHtml(moment.reason)}</span>
          <span class="moment-time">${escapeHtml(formatTime(moment.at))}</span>
        </span>
        <span class="moment-text">${escapeHtml(moment.content)}</span>
      </button>
    `)
    .join("");
}

function renderMomentRail() {
  if (!els.momentRailList) return;
  const moments = state.analysis?.moments || [];
  if (moments.length === 0) {
    const trends = state.analysis?.trends || [];
    const questions = state.analysis?.questions || [];
    const fallback = [
      trends[0] ? `watching "${trends[0].term}" across ${trends[0].sources.length} source${trends[0].sources.length === 1 ? "" : "s"}` : "",
      questions[0] ? `latest question: ${questions[0].content}` : ""
    ].filter(Boolean)[0];
    els.momentRailList.innerHTML = `<p class="intel-empty">${escapeHtml(fallback || "waiting for a spike, charged message, or cross-platform trend")}</p>`;
    return;
  }

  els.momentRailList.innerHTML = moments
    .slice(0, 5)
    .map((moment, index) => `
      <article class="moment-card" data-moment-id="${escapeAttr(moment.id)}" data-tone="${escapeAttr(moment.tone)}" style="--src:${escapeAttr(sourceColor(moment.source))}">
        <button type="button" class="moment-card-main" data-moment-replay="${escapeAttr(moment.id)}" title="Replay this moment in the feed">
          <span class="moment-rank">${String(index + 1).padStart(2, "0")}</span>
          <span class="moment-card-copy">
            <span class="moment-head">
              <span class="src-tag">${escapeHtml(moment.sourceLabel || moment.source)}</span>
              <span class="moment-reason">${escapeHtml(moment.reason)}</span>
              <span class="moment-time">${escapeHtml(formatTime(moment.at))}</span>
            </span>
            <span class="moment-text">${escapeHtml(moment.content)}</span>
          </span>
        </button>
        <span class="moment-action-row">
          <button type="button" data-moment-replay="${escapeAttr(moment.id)}">Replay</button>
          <button type="button" data-moment-share="${escapeAttr(moment.id)}">Share</button>
        </span>
      </article>
    `)
    .join("");
}

function renderTrends() {
  if (!els.trendChips) return;
  const trends = state.analysis?.trends || [];
  if (trends.length === 0) {
    els.trendChips.innerHTML = `<p class="intel-empty">no trending terms yet</p>`;
    return;
  }
  els.trendChips.innerHTML = trends
    .map((trend) => `
      <button type="button" class="trend-chip${trend.crossPlatform ? " cross" : ""}" data-trend="${escapeAttr(trend.term)}" title="${trend.crossPlatform ? "Across " + trend.sources.join(", ") : trend.sources.join(", ")} · ${trend.count} mentions">
        ${trend.crossPlatform ? "✦ " : ""}${escapeHtml(trend.term)}<b>${trend.count}</b>
      </button>
    `)
    .join("");
}

function renderQuestions() {
  if (!els.questionsList) return;
  const questions = state.analysis?.questions || [];
  if (questions.length === 0) {
    els.questionsList.innerHTML = `<p class="intel-empty">no open questions detected</p>`;
    return;
  }
  els.questionsList.innerHTML = questions
    .map((question) => `
      <button type="button" class="question" data-question-id="${escapeAttr(question.id)}" style="--src:${escapeAttr(sourceColor(question.source))}" title="Jump to this message">
        <span class="question-meta">${escapeHtml(question.author)} · ${escapeHtml(question.sourceLabel || question.source)}</span>
        <span class="question-text">${escapeHtml(question.content)}</span>
      </button>
    `)
    .join("");
}

function jumpToMessage(id) {
  const inFeed = state.messages.some((message) => message.id === id);
  if (inFeed) {
    if (state.query || state.filter !== "all") {
      // Clear filters so the target is guaranteed visible, then select.
      state.query = "";
      if (els.searchInput) els.searchInput.value = "";
      setFilter("all");
    }
    const row = els.feedList?.querySelector(`[data-message-id="${cssEscape(id)}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      selectMessage(id);
      row.classList.remove("moment-flash");
      void row.offsetWidth;
      row.classList.add("moment-flash");
      return;
    }
  }
  toast("message aged out of the live buffer", "warn");
}

async function shareMoment(id) {
  const moment = findMoment(id);
  if (!moment) {
    toast("moment unavailable", "warn");
    return;
  }
  const text = [
    `Bubblewire moment: ${moment.reason}`,
    `${moment.sourceLabel || moment.source} / ${moment.author || "unknown"} / heat ${moment.heat || 0}`,
    `"${moment.content}"`,
    buildViewUrl()
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    trackActivation("moment_share");
    toast("moment card copied");
  } catch {
    toast("clipboard unavailable", "err");
  }
}

function findMoment(id) {
  return (state.analysis?.moments || []).find((moment) => moment.id === id);
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
  state.proof = snapshot.proof || state.proof;
  if (snapshot.analysis) state.analysis = snapshot.analysis;
  state.sources = snapshot.sources || {};
  state.runtime = snapshot.runtime || state.runtime;
  if (typeof state.runtime.watching === "number") {
    state.watching = state.runtime.watching;
    renderWatching();
  }
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
    spawnStreamParticle(message);
    trackSession(message);
    trackHiddenUnseen();
  }
}

function alertWatchHit(message) {
  const term = matchWatchlist(message);
  if (!term) return;
  state.session.watchHits += 1;
  const now = Date.now();
  if (now - (state.watchToastAt[term] || 0) < 8000) return;
  state.watchToastAt[term] = now;
  toast(`⚑ watch "${term}" — ${message.author.name}`, "warn");
  if (state.watchSound) beep();
  if (state.watchNotify && document.hidden && notificationsGranted()) {
    try {
      new Notification(`⚑ "${term}" — ${message.author.name}`, {
        body: String(message.content).slice(0, 110),
        icon: "/assets/icons/icon-192.png",
        tag: "bubblewire-watch"
      });
    } catch {
      /* notifications unavailable */
    }
  }
}

function trackSession(message) {
  const name = message.author?.name || "unknown";
  state.session.authors.set(name, (state.session.authors.get(name) || 0) + 1);
  if (!state.session.hottest || (message.heat || 0) > (state.session.hottest.heat || 0)) {
    state.session.hottest = message;
  }
}

function trackHiddenUnseen() {
  if (!document.hidden) return;
  state.hiddenUnseen += 1;
  updateTabBadge();
}

/* ---------- rendering ---------- */

function renderAll() {
  renderStatus();
  renderStats();
  renderProofReceipt();
  renderProductSurface();
  renderFeed();
  if (!isOverlay) {
    renderSourceCards();
    renderPinned();
    renderAnalysis();
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
  renderProofReceipt();
  renderProductSurface();
}

function renderProofReceipt() {
  if (!els.proofReceipt || isOverlay) return;
  const proofSources = state.proof?.sources || {};
  const receipt = SOURCE_ORDER.map((source) => {
    const proof = proofSources[source] || {};
    const sourceStats = state.stats.sources?.[source] || {};
    const status = state.status[source] || {};
    const label = state.sources[source]?.label || source;
    const count = proof.count ?? sourceStats.count ?? 0;
    const level = proof.evidenceLevel || (count ? "live" : status.state || "waiting");
    const last = proof.lastMessageAt
      ? `last ${formatTime(proof.lastMessageAt)}`
      : status.state || "waiting";
    const rawType = proof.rawType ? ` · ${proof.rawType}` : "";

    return `
      <span data-source="${escapeAttr(source)}" data-proof="${escapeAttr(level)}" style="--src:${escapeAttr(sourceColor(source))}">
        <b>${escapeHtml(label)}</b> ${escapeHtml(level)} · ${escapeHtml(String(count))} · ${escapeHtml(last)}${escapeHtml(rawType)}
      </span>
    `;
  }).join("");

  els.proofReceipt.innerHTML = `<strong>LIVE PROOF</strong>${receipt}`;
}

function renderProofConsole() {
  if (!els.proofConsoleBody || isOverlay) return;
  const setup = state.setup?.sources || {};
  const rows = SOURCE_ORDER.map((source) => {
    const meta = state.sources[source] || {};
    const proof = state.proof?.sources?.[source] || {};
    const sourceStats = state.stats.sources?.[source] || {};
    const status = state.status[source] || {};
    const setupSource = setup[source] || {};
    const label = meta.label || source;
    const count = proof.count ?? sourceStats.count ?? 0;
    const evidence = proof.evidenceLevel || (count ? "live" : status.state || "waiting");
    const last = proof.lastMessageAt || sourceStats.lastMessageAt;
    const detail = status.detail || setupSource.note || "waiting for source evidence";
    const xDiag = source === "x" ? diagnosticsRows(setupSource.diagnostics || status.diagnostics) : "";
    const xRules = source === "x" && setupSource.rules
      ? `<span class="proof-meta">rules ${escapeHtml(setupSource.rules.status || "unknown")} · ${escapeHtml(String(setupSource.rules.count || 0))}</span>`
      : "";
    const kickWebhook = source === "kick" && setupSource.webhookUrl
      ? `<code class="proof-url">${escapeHtml(maskPublicUrl(setupSource.webhookUrl))}</code>`
      : "";
    return `
      <article class="proof-console-row" data-source="${escapeAttr(source)}" data-proof="${escapeAttr(evidence)}" style="--src:${escapeAttr(sourceColor(source))}">
        <header>
          <span class="src-tag">${escapeHtml(label)}</span>
          <strong>${escapeHtml(evidence)}</strong>
          <span>${escapeHtml(String(count))} seen</span>
        </header>
        <p>${escapeHtml(detail)}</p>
        <div class="proof-meta-row">
          <span class="proof-meta">${last ? `last ${escapeHtml(formatTime(last))}` : "no live message yet"}</span>
          <span class="proof-meta">${escapeHtml(status.state || "idle")}</span>
          ${xRules}
        </div>
        ${kickWebhook}
        ${xDiag}
      </article>
    `;
  }).join("");

  els.proofConsoleBody.innerHTML = rows;
}

function diagnosticsRows(diagnostics) {
  if (!diagnostics) return "";
  const status = diagnostics.httpStatus
    ? `HTTP ${diagnostics.httpStatus}${diagnostics.statusText ? ` ${diagnostics.statusText}` : ""}`
    : diagnostics.errorName || "runtime error";
  const fields = [
    ["status", status],
    ["problem", diagnostics.problemTitle || diagnostics.problemDetail || diagnostics.summary || ""],
    ["body", diagnostics.bodySnippet || ""]
  ].filter(([, value]) => value);
  if (!fields.length) return "";
  return `
    <div class="proof-diagnostics" aria-label="Redacted X diagnostics">
      ${fields.map(([label, value]) => `
        <span><b>${escapeHtml(label)}</b><code>${escapeHtml(value)}</code></span>
      `).join("")}
    </div>
  `;
}

function renderProductSurface() {
  if (isOverlay) return;
  renderProofMetrics();
  renderLaunchChecklist();
  renderProofConsole();
  renderWorkspaceSummary();
  renderSessionDesk();
  renderModeratorQueue();
  renderReplayStudio();
  renderGuidedSetup();
  renderSafetyPanel();
  renderSignalPreset();
  renderJudgeBrief();
}

function renderWorkspaceSummary() {
  if (!els.workspaceSummary || isOverlay) return;
  const saved = state.workspace;
  const activeSources = SOURCE_ORDER.filter((source) => sourceHasProof(source) || sourceIsConfigured(source)).length;
  const topAuthor = [...state.session.authors.entries()].sort((a, b) => b[1] - a[1])[0];
  const savedName = saved?.name || "No saved setup";
  const savedAt = saved?.savedAt ? `saved ${formatTime(saved.savedAt)}` : "save this stream setup";
  if (els.workspaceName && saved?.name && !els.workspaceName.value) els.workspaceName.value = saved.name;

  els.workspaceSummary.innerHTML = `
    <div class="workspace-stat">
      <span>Saved</span>
      <b>${escapeHtml(savedName)}</b>
      <small>${escapeHtml(savedAt)}</small>
    </div>
    <div class="workspace-stat">
      <span>Sources</span>
      <b>${activeSources}/3 active</b>
      <small>${escapeHtml(state.runtime.liveOnly ? "live-only" : "demo/live")}</small>
    </div>
    <div class="workspace-stat">
      <span>Watch terms</span>
      <b>${state.watchlist.length}</b>
      <small>${escapeHtml(state.watchlist.slice(0, 3).join(", ") || "none")}</small>
    </div>
    <div class="workspace-stat">
      <span>Top author</span>
      <b>${escapeHtml(topAuthor?.[0] || "listening")}</b>
      <small>${topAuthor ? `${topAuthor[1]} messages` : "session not warm yet"}</small>
    </div>
  `;
}

function saveWorkspaceSnapshot() {
  const name = (els.workspaceName?.value || "").trim() || "Stream desk";
  state.workspace = {
    name,
    savedAt: new Date().toISOString(),
    filter: state.filter,
    priorityOnly: state.priorityOnly,
    watchlist: state.watchlist.slice(),
    watchSound: state.watchSound,
    watchNotify: state.watchNotify,
    theme: state.theme,
    density: state.density
  };
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state.workspace));
  } catch {
    /* in-memory only */
  }
  trackActivation("workspace");
  renderWorkspaceSummary();
  toast("workspace saved");
}

function applyWorkspaceSnapshot() {
  const saved = state.workspace || loadWorkspace();
  if (!saved) {
    toast("no saved workspace yet", "warn");
    return;
  }
  if (saved.filter && ["all", ...SOURCE_ORDER].includes(saved.filter)) state.filter = saved.filter;
  if (typeof saved.priorityOnly === "boolean") state.priorityOnly = saved.priorityOnly;
  if (Array.isArray(saved.watchlist)) state.watchlist = saved.watchlist.slice(0, 12);
  if (typeof saved.watchSound === "boolean") state.watchSound = saved.watchSound;
  if (typeof saved.watchNotify === "boolean") state.watchNotify = saved.watchNotify;
  if (saved.theme) setTheme(saved.theme, { silent: true });
  setDensity(saved.density || "comfortable");
  savePrefs();
  saveWatchlist();
  saveWatchSound();
  syncControlsToState();
  renderWatchlist();
  renderFeed();
  renderStats();
  renderWorkspaceSummary();
  toast(`workspace loaded: ${saved.name || "stream desk"}`);
}

async function copyWorkspaceOverlayUrl() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/overlay.html?preset=broadcast&max=8&scale=1.1`);
    trackActivation("overlay");
    toast("OBS URL copied");
  } catch {
    toast("clipboard unavailable", "err");
  }
}

async function copyOverlayModeUrl(mode) {
  const safeMode = ["approved", "moments", "questions", "feed"].includes(mode) ? mode : "approved";
  const preset = safeMode === "feed" ? "broadcast" : safeMode;
  try {
    await navigator.clipboard.writeText(`${location.origin}/overlay.html?preset=${preset}&mode=${safeMode}`);
    trackActivation("overlay");
    toast(`${safeMode} overlay URL copied`);
  } catch {
    toast("clipboard unavailable", "err");
  }
}

function loadWorkspace() {
  try {
    const value = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function loadSessionDesk() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function saveSessionDesk() {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.sessionDesk));
  } catch {
    /* in-memory only */
  }
}

function startSessionDesk() {
  state.sessionDesk = {
    name: state.workspace?.name || "Live stream session",
    startedAt: new Date().toISOString(),
    endedAt: null
  };
  state.session.startedAt = Date.now();
  saveSessionDesk();
  renderSessionDesk();
  toast("session started");
}

function endSessionDesk() {
  state.sessionDesk = {
    ...(state.sessionDesk || { name: "Live stream session", startedAt: new Date(state.session.startedAt).toISOString() }),
    endedAt: new Date().toISOString()
  };
  saveSessionDesk();
  renderSessionDesk();
  toast("session closed");
}

async function copyProofPacketUrl() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/proof-packet.json`);
    trackActivation("proof_packet");
    toast("proof packet url copied");
  } catch {
    toast("clipboard unavailable", "err");
  }
}

function renderSessionDesk() {
  if (!els.sessionDesk || isOverlay) return;
  const session = state.serverSession;
  const local = state.sessionDesk || {};
  const duration = session?.durationSeconds ?? Math.max(0, Math.round((Date.now() - state.session.startedAt) / 1000));
  const metrics = session?.metrics || {
    totalMessages: state.stats.totalMessages || 0,
    liveSources: SOURCE_ORDER.filter(sourceHasProof).length,
    moments: state.analysis?.moments?.length || 0,
    questions: state.analysis?.questions?.length || 0,
    watching: state.watching || 0
  };

  els.sessionDesk.dataset.phase = session?.phase || (state.runtime.liveOnly ? "live" : "demo");
  const metricHtml = [
    ["Msgs", metrics.totalMessages || 0],
    ["Sources", `${metrics.liveSources || 0}/3`],
    ["Moments", metrics.moments || 0],
    ["Q", metrics.questions || 0],
    ["Time", formatDuration(duration * 1000)]
  ].map(([label, value]) => `
    <article>
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(String(value))}</b>
    </article>
  `).join("");

  const preflight = session?.preflight || fallbackPreflight();
  if (els.sessionPreflight) {
    els.sessionPreflight.innerHTML = preflight
      .map((item) => `
        <li data-status="${escapeAttr(item.status)}">
          <b>${escapeHtml(item.key)}</b>
          <span>${escapeHtml(item.detail || item.status)}</span>
        </li>
      `)
      .join("");
  }

  const title = local.name || state.workspace?.name || "Live stream session";
  const stateLabel = local.endedAt ? "closed" : local.startedAt ? "live" : "ready";
  els.sessionDesk.querySelector("[data-session-title]")?.replaceChildren(document.createTextNode(title));
  els.sessionDesk.querySelector("[data-session-state]")?.replaceChildren(document.createTextNode(stateLabel));
  const metricsRoot = els.sessionDesk.querySelector("[data-session-metrics]");
  if (metricsRoot) metricsRoot.innerHTML = metricHtml;
}

function fallbackPreflight() {
  return [
    { key: "runtime", status: state.runtime.liveOnly ? "pass" : "warn", detail: state.runtime.liveOnly ? "live-only" : "demo/live" },
    { key: "history", status: state.setup?.history?.enabled ? "pass" : "warn", detail: state.setup?.history?.enabled ? "enabled" : "not confirmed" },
    ...SOURCE_ORDER.map((source) => ({
      key: source,
      status: sourceHasProof(source) ? "pass" : sourceIsConfigured(source) ? "warn" : "fail",
      detail: state.status[source]?.detail || "waiting"
    }))
  ];
}

function loadModeratorQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(MOD_QUEUE_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 60) : [];
  } catch {
    return [];
  }
}

function saveModeratorQueue() {
  try {
    localStorage.setItem(MOD_QUEUE_STORAGE_KEY, JSON.stringify(state.modQueue));
  } catch {
    /* in-memory only */
  }
}

function queueMessageForReview(id) {
  const message = state.messages.find((item) => item.id === id) || state.pinned.get(id);
  if (!message) return;
  const existing = state.modQueue.find((item) => item.id === id);
  if (existing) {
    existing.status = "pending";
    existing.updatedAt = new Date().toISOString();
  } else {
    state.modQueue.unshift({
      id,
      status: "pending",
      queuedAt: new Date().toISOString(),
      message: snapshotMessage(message)
    });
    state.modQueue.splice(60);
  }
  saveModeratorQueue();
  renderModeratorQueue();
  trackActivation("moderation");
  toast("queued for review");
}

function featureMessageForOverlay(id) {
  const message = state.messages.find((item) => item.id === id) || state.pinned.get(id);
  if (!message) return;
  const approved = new Set(state.safety.approvedIds || []);
  approved.add(id);
  state.safety.approvedIds = [...approved].slice(-80);
  saveSafetyRules();
  const queued = state.modQueue.find((item) => item.id === id);
  if (queued) {
    queued.status = "approved";
    queued.updatedAt = new Date().toISOString();
  } else {
    state.modQueue.unshift({
      id,
      status: "approved",
      queuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      message: snapshotMessage(message)
    });
  }
  saveModeratorQueue();
  renderModeratorQueue();
  renderSafetyPanel();
  toast("approved for overlay");
}

function onModeratorQueueClick(event) {
  const action = event.target.closest("[data-mod-action]");
  if (!action) return;
  const id = action.dataset.modId;
  const item = state.modQueue.find((entry) => entry.id === id);
  if (!item) return;
  const value = action.dataset.modAction;
  if (value === "approve") {
    featureMessageForOverlay(id);
  } else if (value === "escalate") {
    item.status = "escalated";
    item.updatedAt = new Date().toISOString();
    saveModeratorQueue();
    renderModeratorQueue();
    toast("message escalated", "warn");
  } else if (value === "remove") {
    state.modQueue = state.modQueue.filter((entry) => entry.id !== id);
    saveModeratorQueue();
    renderModeratorQueue();
  }
}

function clearModeratorQueue() {
  state.modQueue = [];
  saveModeratorQueue();
  renderModeratorQueue();
  toast("moderator queue cleared");
}

function renderModeratorQueue() {
  if (!els.moderatorQueueList || isOverlay) return;
  if (els.moderatorQueue) els.moderatorQueue.dataset.count = String(state.modQueue.length);
  if (state.modQueue.length === 0) {
    els.moderatorQueueList.innerHTML = `<div class="queue-empty">No messages waiting.</div>`;
    return;
  }
  els.moderatorQueueList.innerHTML = state.modQueue.slice(0, 8)
    .map((item) => `
      <article class="queue-item" data-status="${escapeAttr(item.status)}">
        <header>
          <span class="src-tag">${escapeHtml(item.message.sourceLabel || item.message.source)}</span>
          <strong>${escapeHtml(item.message.author?.name || "unknown")}</strong>
          <small>${escapeHtml(item.status)}</small>
        </header>
        <p>${escapeHtml(item.message.content || "")}</p>
        <div class="queue-actions">
          <button type="button" data-mod-action="approve" data-mod-id="${escapeAttr(item.id)}">Approve</button>
          <button type="button" data-mod-action="escalate" data-mod-id="${escapeAttr(item.id)}">Flag</button>
          <button type="button" data-mod-action="remove" data-mod-id="${escapeAttr(item.id)}">Done</button>
        </div>
      </article>
    `)
    .join("");
}

function renderReplayStudio() {
  if (!els.replayStudio || isOverlay) return;
  const moment = state.analysis?.moments?.[0];
  const target = moment || state.messages[0] || null;
  if (els.replayExportButton) els.replayExportButton.disabled = !target;
  if (!els.replaySummary) return;
  if (!target) {
    els.replaySummary.innerHTML = `<span>No replay target yet</span>`;
    return;
  }
  const context = replayContext(target.id, 45);
  els.replaySummary.innerHTML = `
    <strong>${escapeHtml(moment?.reason || "latest message")}</strong>
    <span>${escapeHtml(target.sourceLabel || target.source)} · ${context.length} rows · ${escapeHtml(formatTime(target.at || target.receivedAt))}</span>
    <p>${escapeHtml(target.content || "")}</p>
  `;
}

async function exportReplayBundle() {
  const target = state.analysis?.moments?.[0] || state.messages[0];
  if (!target) {
    toast("no replay target yet", "warn");
    return;
  }
  try {
    const response = await fetch(`/replay.json?moment=${encodeURIComponent(target.id)}&window=45`);
    const bundle = await response.json();
    downloadJson(`bubblewire-replay-${safeFilePart(target.id)}.json`, bundle);
    trackActivation("replay");
    toast("replay bundle exported");
  } catch {
    const local = {
      kind: "replay-bundle",
      generatedAt: new Date().toISOString(),
      target: snapshotMessage(target),
      context: replayContext(target.id, 45).map(snapshotMessage)
    };
    downloadJson(`bubblewire-replay-${safeFilePart(target.id)}.json`, local);
    toast("local replay exported", "warn");
  }
}

function replayContext(id, windowSeconds) {
  const target = state.messages.find((message) => message.id === id) || state.messages[0];
  if (!target) return [];
  const targetMs = new Date(target.receivedAt || target.at).getTime();
  const windowMs = windowSeconds * 1000;
  return state.messages
    .slice()
    .reverse()
    .filter((message) => Math.abs(new Date(message.receivedAt).getTime() - targetMs) <= windowMs);
}

function renderGuidedSetup() {
  if (!els.guidedSetupList || isOverlay) return;
  const setup = state.setup?.sources || {};
  const rows = SOURCE_ORDER.map((source) => {
    const status = sourceHasProof(source) ? "pass" : sourceIsConfigured(source) ? "warn" : "fail";
    const detail = setup[source]?.note || state.status[source]?.detail || "waiting";
    const action = source === "kick" ? "webhook" : source === "x" ? "rules" : "channel";
    return `
      <li data-status="${escapeAttr(status)}">
        <b>${escapeHtml(source)}</b>
        <span>${escapeHtml(action)}</span>
        <small>${escapeHtml(detail)}</small>
      </li>
    `;
  }).join("");
  els.guidedSetupList.innerHTML = rows;
}

function loadSafetyRules() {
  try {
    const value = JSON.parse(localStorage.getItem(SAFETY_STORAGE_KEY) || "{}");
    return normalizeSafetyRules(value);
  } catch {
    return normalizeSafetyRules();
  }
}

function saveSafetyRules() {
  state.safety = normalizeSafetyRules(state.safety);
  try {
    localStorage.setItem(SAFETY_STORAGE_KEY, JSON.stringify(state.safety));
  } catch {
    /* in-memory only */
  }
}

function normalizeSafetyRules(value = {}) {
  return {
    approvedOnly: Boolean(value.approvedOnly),
    approvedIds: Array.isArray(value.approvedIds) ? [...new Set(value.approvedIds.map(String))].slice(-80) : [],
    blockedTerms: Array.isArray(value.blockedTerms) ? value.blockedTerms.filter(Boolean).slice(0, 40) : [],
    redactLinks: value.redactLinks !== false
  };
}

function saveSafetyFromControls() {
  const terms = String(els.safetyBlockedInput?.value || "")
    .split(/[\n,]/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 40);
  state.safety.blockedTerms = [...new Set(terms)];
  state.safety.approvedOnly = Boolean(els.safetyApprovedOnly?.checked);
  saveSafetyRules();
  renderSafetyPanel();
  renderFeed();
  toast("safety rules saved");
}

function renderSafetyPanel() {
  if (!els.safetyPanel || isOverlay) return;
  if (els.safetyBlockedInput && document.activeElement !== els.safetyBlockedInput) {
    els.safetyBlockedInput.value = (state.safety.blockedTerms || []).join(", ");
  }
  if (els.safetyApprovedOnly) els.safetyApprovedOnly.checked = Boolean(state.safety.approvedOnly);
  const summary = els.safetyPanel.querySelector("[data-safety-summary]");
  if (summary) {
    summary.textContent = `${state.safety.approvedIds?.length || 0} approved · ${state.safety.blockedTerms?.length || 0} blocked`;
  }
}

function applySafetyToMessage(message, options = {}) {
  const rules = normalizeSafetyRules({ ...state.safety, ...(options.rules || {}) });
  const approvedOnly = Boolean(options.approvedOnly ?? rules.approvedOnly);
  const approved = new Set([...(rules.approvedIds || []), ...(overlayConfig.featuredIds || [])].map(String));
  const next = {
    ...message,
    content: String(message?.content || ""),
    hidden: false
  };

  if (approvedOnly && !approved.has(String(message?.id || ""))) {
    return { hidden: true, reason: "not approved for broadcast", message: next };
  }

  let content = next.content;
  for (const term of rules.blockedTerms || []) {
    const cleaned = String(term || "").trim();
    if (!cleaned) continue;
    content = content.replace(new RegExp(escapeRegex(cleaned), "gi"), "[redacted]");
  }
  if (rules.redactLinks) content = content.replace(/https?:\/\/\S+/gi, "[redacted-link]");
  next.content = content;
  return { hidden: false, message: next };
}

function loadSignalPreset() {
  try {
    const value = localStorage.getItem(SIGNAL_PRESET_KEY) || "balanced";
    return SIGNAL_PRESETS[value] ? value : "balanced";
  } catch {
    return "balanced";
  }
}

function saveSignalPreset() {
  try {
    localStorage.setItem(SIGNAL_PRESET_KEY, state.signalPreset);
  } catch {
    /* in-memory only */
  }
}

function renderSignalPreset() {
  if (!els.signalPresetSelect || isOverlay) return;
  els.signalPresetSelect.value = state.signalPreset;
  const summary = els.signalPresetSelect.closest(".signal-preset-panel")?.querySelector("[data-signal-summary]");
  const preset = SIGNAL_PRESETS[state.signalPreset] || SIGNAL_PRESETS.balanced;
  if (summary) summary.textContent = `heat >= ${preset.heat} · ${preset.watch.length || state.watchlist.length} hints`;
}

function applySignalPreset(name) {
  const next = SIGNAL_PRESETS[name] ? name : "balanced";
  state.signalPreset = next;
  const preset = SIGNAL_PRESETS[next];
  const merged = [...new Set([...state.watchlist, ...preset.watch])].slice(0, 12);
  state.watchlist = merged;
  saveSignalPreset();
  saveWatchlist();
  renderSignalPreset();
  renderWatchlist();
  renderFeed();
  renderStats();
  toast(`${preset.label} signal preset`);
}

function currentHeatThreshold() {
  return SIGNAL_PRESETS[state.signalPreset]?.heat || PRIORITY_HEAT;
}

function renderJudgeBrief() {
  if (!els.judgeBrief || !els.judgeBriefMetrics) return;
  els.judgeBrief.hidden = !state.judgeMode;
  if (!state.judgeMode) return;
  const proofReady = SOURCE_ORDER.filter((source) => sourceHasProof(source)).length;
  const moments = state.analysis?.moments?.length || 0;
  const questions = state.analysis?.questions?.length || 0;
  const trends = state.analysis?.trends?.filter((trend) => trend.crossPlatform).length || 0;
  const metrics = [
    ["Sources proven", `${proofReady}/3`],
    ["Messages", String(state.stats.totalMessages || 0)],
    ["Moments", String(moments)],
    ["Cross trends", String(trends)],
    ["Questions", String(questions)]
  ];
  els.judgeBriefMetrics.innerHTML = metrics
    .map(([label, value]) => `
      <article>
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(value)}</b>
      </article>
    `)
    .join("");
}

function renderProofMetrics() {
  if (!els.proofMetrics) return;
  const total = state.stats.totalMessages || 0;
  const rate = messageRate();
  const proofReady = SOURCE_ORDER.filter((source) => sourceHasProof(source)).length;
  const watchHits = state.session.watchHits || 0;
  const readyCount = SOURCE_ORDER.filter((source) => !sourceHasProof(source) && sourceIsConfigured(source)).length;
  const sourcesLabel = proofReady < SOURCE_ORDER.length && readyCount > 0 ? `Sources · ${readyCount} ready` : "Sources";
  const metrics = [
    ["Captured", pad(total)],
    [sourcesLabel, `${proofReady} live`],
    ["Rate", `${rate}/min`],
    ["Watch hits", String(watchHits)]
  ];

  els.proofMetrics.innerHTML = metrics
    .map(([label, value]) => `
      <article>
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(value)}</b>
      </article>
    `)
    .join("");
}

function renderLaunchChecklist() {
  if (!els.launchChecklist) return;
  const activeSources = SOURCE_ORDER.filter((source) => sourceHasProof(source) || sourceIsConfigured(source)).length;
  const steps = [
    {
      key: "demo",
      label: "Try the feed",
      body: "Inject a labeled Twitch, X, and Kick burst or watch live traffic.",
      action: "demo",
      cta: state.runtime.demoEnabled === false ? "Live only" : "Run demo",
      done: Boolean(state.activation.demo || state.stats.totalMessages > 0)
    },
    {
      key: "setup",
      label: "Connect sources",
      body: "Check Twitch channels, X rules, and the Kick webhook from one drawer.",
      action: "setup",
      cta: "Open setup",
      done: Boolean(state.activation.setup || activeSources > 0)
    },
    {
      key: "watch",
      label: "Add an alert",
      body: "Track a keyword or ticker so the stream team catches the moment.",
      action: "watch",
      cta: "Add term",
      done: state.watchlist.length > 0
    },
    {
      key: "overlay",
      label: "Go on air",
      body: "Configure a transparent OBS overlay with source filters and fade timing.",
      action: "overlay",
      cta: "Overlay",
      done: Boolean(state.activation.overlay)
    }
  ];

  els.launchChecklist.innerHTML = steps
    .map((step, index) => `
      <article class="launch-step" data-done="${step.done}" data-step="${escapeAttr(step.key)}">
        <span class="step-index">${step.done ? "✓" : String(index + 1)}</span>
        <div>
          <strong>${escapeHtml(step.label)}</strong>
          <p>${escapeHtml(step.body)}</p>
        </div>
        <button type="button" data-onboard-action="${escapeAttr(step.action)}">${escapeHtml(step.cta)}</button>
      </article>
    `)
    .join("");
}

function sourceHasProof(source) {
  const proof = state.proof?.sources?.[source] || {};
  const stats = state.stats.sources?.[source] || {};
  const level = proof.evidenceLevel || "";
  return Boolean(
    proof.count > 0 ||
    stats.count > 0 ||
    ["live", "webhook-proof", "signed"].includes(level)
  );
}

function sourceIsConfigured(source) {
  const status = state.status[source] || {};
  return ["connected", "live", "webhook-ready", "demo"].includes(status.state);
}

function onLaunchChecklistClick(event) {
  const button = event.target.closest("[data-onboard-action]");
  if (!button) return;
  const action = button.dataset.onboardAction;
  if (action === "demo") {
    runProductDemo();
  } else if (action === "setup") {
    trackActivation("setup");
    openSetup();
  } else if (action === "watch") {
    trackActivation("watch_prompt");
    els.watchInput?.focus();
  } else if (action === "overlay") {
    trackActivation("overlay");
    location.href = "/overlay-setup.html";
  }
}

async function runProductDemo() {
  trackActivation("demo");
  setFilter("all");
  if (state.runtime.demoEnabled === false) {
    toast("live-only mode — watching real sources", "warn");
    els.feedPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  try {
    await postJson("/demo-spike.json");
    toast("demo burst injected across sources");
    els.feedPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    toast("demo burst rejected", "err");
  }
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
    const slice = overlayMessages(messages).slice(0, overlayConfig.max);
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
    renderFeed();
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
  const tier = heat >= 75 ? 3 : heat >= 50 ? 2 : heat >= currentHeatThreshold() ? 1 : 0;
  const heatLevel = Math.min(4, Math.ceil(heat / 25));
  const heatBars = [1, 2, 3, 4]
    .map((step) => `<i${step <= heatLevel ? ' class="on"' : ""}></i>`)
    .join("");
  const verified = message.author.verified ? `<span class="verified" title="Verified">✓</span>` : "";
  const mode = message.mode && message.mode !== "live"
    ? `<span class="mode-tag">${escapeHtml(message.mode)}</span>`
    : "";
  const evidence = message.evidenceLevel && message.evidenceLevel !== message.mode
    ? `<span class="mode-tag evidence-tag">${escapeHtml(message.evidenceLevel)}</span>`
    : "";
  const channel = message.channel ? `<span class="channel">#${escapeHtml(message.channel)}</span>` : "";
  const authorQ = message.author.handle || message.author.name;
  const watchTag = watchTerm ? `<span class="watch-tag" title="Watchlist hit">⚑ ${escapeHtml(watchTerm)}</span>` : "";
  const dupeBadge = dupes > 1 ? `<span class="dupe-badge" title="${dupes} repeats collapsed">×${dupes}</span>` : "";

  const initial = (message.author.name || "?").trim().charAt(0).toUpperCase() || "?";
  const avatar = message.author.avatar
    ? `<img class="avatar" src="${escapeAttr(message.author.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-initial="${escapeAttr(initial)}" data-src="${escapeAttr(message.sourceColor)}">`
    : `<span class="avatar avatar-fallback" style="--src:${escapeAttr(message.sourceColor)}">${escapeHtml(initial)}</span>`;

  return `
    <li class="message${selected}${pinnedState ? " pinned-state" : ""}${watchTerm ? " watch-hit" : ""}" data-message-id="${escapeAttr(message.id)}" data-collapse-key="${escapeAttr(collapseKey(message))}" data-dupes="${dupes}" style="--src:${escapeAttr(message.sourceColor)}">
      <div class="msg-head">
        <span class="src-tag">${escapeHtml(message.sourceLabel)}</span>
        ${avatar}
        <span class="author" role="button" tabindex="0" data-author-q="${escapeAttr(authorQ)}" title="Filter feed to ${escapeAttr(authorQ)}" style="color:${escapeAttr(visibleColor(message.author.color || message.sourceColor))}">${escapeHtml(message.author.name)}</span>
        ${verified}
        <span class="handle">${escapeHtml(formatHandle(message.author.handle))}</span>
        ${channel}
        ${mode}
        ${evidence}
        ${watchTag}
        ${dupeBadge}
        <span class="msg-spacer"></span>
        <span class="heat" data-tier="${tier}" title="Heat ${heat}"><span class="heat-bar">${heatBars}</span>${heat}</span>
        <time class="msg-time">${escapeHtml(formatTime(message.receivedAt))}</time>
        <button type="button" class="pin-btn queue-btn" data-queue-id="${escapeAttr(message.id)}">Review</button>
        <button type="button" class="pin-btn feature-btn" data-feature-id="${escapeAttr(message.id)}">Feature</button>
        <button type="button" class="pin-btn" data-pin-id="${escapeAttr(message.id)}">${pinnedState ? "Unpin" : "Pin"}</button>
      </div>
      <p class="msg-content">${enrichContent(message.content, state.query)}</p>
    </li>
  `;
}

function overlayMarkup(message) {
  const checked = applySafetyToMessage(message, { approvedOnly: overlayConfig.approvedOnly });
  if (checked.hidden) return "";
  const safeMessage = checked.message;
  return `
    <li class="overlay-item" style="--src:${escapeAttr(safeMessage.sourceColor)}">
      <span class="src-tag">${escapeHtml(safeMessage.sourceLabel)}</span>
      <div>
        <strong style="color:${escapeAttr(visibleColor(safeMessage.author.color || safeMessage.sourceColor))}">${escapeHtml(safeMessage.author.name)}</strong>
        <p class="msg-content">${enrichContent(safeMessage.content, "")}</p>
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
  if (state.priorityOnly && (message.heat || 0) < currentHeatThreshold()) return false;
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
  trackActivation("watch");
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
  trackActivation("setup");
  els.setupDrawer.hidden = false;
  if (els.setupBackdrop) els.setupBackdrop.hidden = false;
  await refreshSetup();
}

function closeSetup() {
  if (els.setupDrawer) els.setupDrawer.hidden = true;
  if (els.setupBackdrop) els.setupBackdrop.hidden = true;
}

async function loadSetupSnapshot({ renderDrawer = false, announce = false } = {}) {
  try {
    const response = await fetch("/setup.json");
    state.setup = await response.json();
    if (renderDrawer || isSetupOpen()) renderSetup();
    renderProofConsole();
    renderWorkspaceSummary();
    renderGuidedSetup();
    renderSessionDesk();
    if (announce) toast("source proof refreshed");
  } catch {
    if (announce) toast("setup refresh failed", "err");
    throw new Error("setup unavailable");
  }
}

async function refreshSetup() {
  try {
    await loadSetupSnapshot({ renderDrawer: true });
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
  const xlive = setup.sources.xlive;

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
      ${ruleRows(x.rules)}
      ${xStreamControl(x)}
      ${xDiagnostics(x.diagnostics)}
      <p class="setup-note">${escapeHtml(x.note)}</p>
    </section>

    ${xliveSection(xlive)}

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

function ruleRows(ruleSnapshot) {
  const rules = Array.isArray(ruleSnapshot?.rules) ? ruleSnapshot.rules : [];
  const status = ruleSnapshot?.status || "unknown";
  const count = Number(ruleSnapshot?.count || rules.length || 0);
  const checked = ruleSnapshot?.checkedAt ? ` · checked ${formatTime(ruleSnapshot.checkedAt)}` : "";
  const summary = `${count} visible ${count === 1 ? "rule" : "rules"} · ${status}${checked}`;

  if (!rules.length) {
    return `
      <div class="rule-stack" data-status="${escapeAttr(status)}">
        <span class="rule-summary">${escapeHtml(summary)}</span>
      </div>
    `;
  }

  return `
    <div class="rule-stack" data-status="${escapeAttr(status)}">
      <span class="rule-summary">${escapeHtml(summary)}</span>
      ${rules.map((rule) => `
        <div class="rule-row">
          <b>${escapeHtml(rule.tag || "rule")}</b>
          <code>${escapeHtml(rule.value || rule.id || "matching rule observed")}</code>
        </div>
      `).join("")}
    </div>
  `;
}

function xDiagnostics(diagnostics) {
  if (!diagnostics) return "";
  const status = diagnostics.httpStatus
    ? `HTTP ${diagnostics.httpStatus}${diagnostics.statusText ? ` ${diagnostics.statusText}` : ""}`
    : diagnostics.errorName || "runtime error";
  const rateLimit = diagnostics.rateLimit
    ? [
        diagnostics.rateLimit.remaining ? `remaining ${diagnostics.rateLimit.remaining}` : "",
        diagnostics.rateLimit.limit ? `limit ${diagnostics.rateLimit.limit}` : "",
        diagnostics.rateLimit.reset ? `reset ${diagnostics.rateLimit.reset}` : ""
      ].filter(Boolean).join(" · ")
    : "";
  const rows = [
    ["status", status],
    ["problem", diagnostics.problemTitle || diagnostics.problemDetail || diagnostics.summary || ""],
    ["type", diagnostics.problemType || ""],
    ["rate", rateLimit],
    ["body", diagnostics.bodySnippet || ""]
  ].filter(([, value]) => value);

  if (!rows.length) return "";

  return `
    <div class="x-diagnostics" aria-label="Redacted X stream diagnostics">
      <span class="x-diagnostic-title">Last stream diagnostic</span>
      ${rows.map(([label, value]) => `
        <div class="x-diagnostic-row">
          <b>${escapeHtml(label)}</b>
          <code>${escapeHtml(value)}</code>
        </div>
      `).join("")}
    </div>
  `;
}

function xStreamControl(x) {
  const stream = x.stream || {};
  const control = x.control || {};
  const paused = Boolean(control.paused || stream.paused);
  const enabled = Boolean(stream.enabled);
  const source = stream.source || "unknown";
  const state = paused ? "paused" : enabled ? "enabled" : "disabled";
  const action = paused ? "resume" : "pause";
  const disabled = control.adminLocked || (!enabled && !paused);
  const detail = stream.detail || x.status?.detail || "";

  return `
    <div class="x-control" data-state="${escapeAttr(state)}">
      <div>
        <span class="x-control-label">Stream control</span>
        <strong>${escapeHtml(state)}</strong>
        <code>${escapeHtml(source)}</code>
        ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
      </div>
      <div class="x-control-actions">
        <button type="button" class="mini-btn" data-x-control="${escapeAttr(action)}"${disabled ? " disabled" : ""}>
          ${paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  `;
}

function xliveSection(xlive) {
  if (!xlive) return "";
  const configured = Boolean(xlive.configured);
  const status = xlive.status?.state || "idle";
  const detail = xlive.status?.detail || "";
  const adminLocked = Boolean(xlive.control?.adminLocked);
  const current = configured
    ? `
      <div class="rule-stack" data-status="${escapeAttr(status)}">
        <span class="rule-summary">broadcast ${escapeHtml(xlive.broadcastId || "")} · ${escapeHtml(status)}</span>
        ${xlive.rule ? `<div class="rule-row"><b>${escapeHtml(xlive.rule.tag || "rule")}</b><code>${escapeHtml(xlive.rule.value || "")}</code></div>` : ""}
      </div>
    `
    : `<p class="setup-note">No live broadcast set. Paste the X live post URL when the stream starts — replies to it become Ansem's chat.</p>`;

  return `
    <section class="setup-section" style="--src:${escapeAttr(sourceColor("xlive"))}">
      <h3>X Live <small>ansem's chat</small></h3>
      ${current}
      <div class="watch-add">
        <input id="xliveInput" type="text" placeholder="x.com/.../status/… or post id" autocomplete="off" spellcheck="false" maxlength="160">
        <button type="button" id="xliveSetButton"${adminLocked ? " disabled" : ""}>Go live</button>
        ${configured ? `<button type="button" class="mini-btn" id="xliveClearButton"${adminLocked ? " disabled" : ""}>Clear</button>` : ""}
      </div>
      ${Object.entries(xlive.vars || {}).map(([name, present]) => `
        <div class="env-row" data-present="${present}">
          <span class="env-dot"></span><code>${escapeHtml(name)}</code><span class="env-state">${present ? "set" : "missing"}</span>
        </div>
      `).join("")}
      <p class="setup-note">${escapeHtml(xlive.note || "Rides the same X filtered stream — no extra connection.")}${adminLocked ? " Admin token required." : ""}</p>
      ${detail ? `<p class="setup-note">${escapeHtml(detail)}</p>` : ""}
    </section>
  `;
}

async function submitXLiveBroadcast(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return;
  try {
    await postJson("/api/xlive/broadcast", { url: value });
    trackActivation("xlive");
    toast("x live broadcast set — tracking replies");
    await refreshSetup();
  } catch {
    toast("x live broadcast update failed", "err");
  }
}

async function clearXLiveBroadcast() {
  try {
    await postJson("/api/xlive/broadcast", { action: "clear" });
    toast("x live broadcast cleared");
    await refreshSetup();
  } catch {
    toast("x live clear failed", "err");
  }
}

function onSetupClick(event) {
  const xControl = event.target.closest("[data-x-control]");
  if (xControl) {
    submitXControl(xControl.dataset.xControl);
    return;
  }
  const remove = event.target.closest("[data-channel-remove]");
  if (remove) {
    submitChannel("remove", remove.dataset.channelRemove);
    return;
  }
  if (event.target.id === "channelAddButton") {
    submitChannel("add", document.querySelector("#channelInput")?.value);
    return;
  }
  if (event.target.id === "xliveSetButton") {
    submitXLiveBroadcast(document.querySelector("#xliveInput")?.value);
    return;
  }
  if (event.target.id === "xliveClearButton") {
    clearXLiveBroadcast();
    return;
  }
  if (event.target.id === "copyWebhookButton") {
    const url = document.querySelector("#webhookUrl")?.textContent || "";
    navigator.clipboard
      .writeText(url)
      .then(() => {
        trackActivation("kick");
        toast("webhook url copied");
      })
      .catch(() => toast("clipboard unavailable", "err"));
  }
}

async function submitXControl(action) {
  try {
    await postJson("/api/x/control", { action });
    toast(action === "pause" ? "X stream paused" : "X stream resuming");
    await refreshSetup();
  } catch {
    toast("X stream control failed", "err");
  }
}

async function submitChannel(action, rawChannel) {
  const channel = String(rawChannel || "").trim().toLowerCase().replace(/^#/, "");
  if (!channel) return;
  try {
    await postJson("/api/twitch/channels", { action, channel });
    if (action === "add") trackActivation("twitch");
    toast(action === "add" ? `joining #${channel}` : `left #${channel}`);
    await refreshSetup();
  } catch {
    toast(`channel ${action} failed`, "err");
  }
}

/* ---------- overlay config ---------- */

function parseOverlayConfig() {
  const params = new URLSearchParams(location.search);
  const preset = OVERLAY_PRESETS[params.get("preset")] || OVERLAY_PRESETS.broadcast;
  const sources = (params.get("sources") || "")
    .split(",")
    .map((source) => source.trim().toLowerCase())
    .filter((source) => SOURCE_ORDER.includes(source));
  const featuredIds = (params.get("featured") || params.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const mode = ["feed", "approved", "moments", "questions"].includes(params.get("mode"))
    ? params.get("mode")
    : preset.mode;
  return {
    mode,
    max: clampNumber(params.has("max") ? params.get("max") : preset.max, 1, 12, OVERLAY_RENDERED),
    fade: clampNumber(params.has("fade") ? params.get("fade") : preset.fade, 0, 600, 0),
    scale: clampNumber(params.has("scale") ? params.get("scale") : preset.scale, 0.6, 2, 1),
    align: params.has("align") ? (params.get("align") === "bottom" ? "bottom" : "top") : preset.align,
    sources: sources.length > 0 ? sources : preset.sources,
    approvedOnly: params.get("approvedOnly") === "1" || params.get("approved") === "1" || Boolean(preset.approvedOnly),
    featuredIds
  };
}

function overlayMessages(messages) {
  const mode = overlayConfig.mode;
  let candidates = messages.filter((message) => !overlayConfig.sources || overlayConfig.sources.includes(message.source));

  if (mode === "moments") {
    const momentIds = new Set((state.analysis?.moments || []).map((moment) => moment.id));
    candidates = candidates.filter((message) => momentIds.has(message.id) || (message.heat || 0) >= Math.max(45, currentHeatThreshold()));
  }

  if (mode === "questions") {
    const questionIds = new Set((state.analysis?.questions || []).map((question) => question.id));
    candidates = candidates.filter((message) => questionIds.has(message.id) || String(message.content || "").includes("?"));
  }

  if (mode === "approved" || overlayConfig.approvedOnly) {
    const approvedIds = new Set([...(state.safety.approvedIds || []), ...(overlayConfig.featuredIds || [])].map(String));
    candidates = candidates.filter((message) => approvedIds.has(String(message.id)));
  }

  return candidates
    .map((message) => applySafetyToMessage(message, { approvedOnly: mode === "approved" || overlayConfig.approvedOnly }))
    .filter((result) => !result.hidden)
    .map((result) => result.message);
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

/* ---------- prefs, themes, deep links ---------- */

function loadFlag(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function saveFlag(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* in-memory only */
  }
}

function loadActivation() {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVATION_STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function trackActivation(step) {
  if (!step) return;
  state.activation = {
    ...state.activation,
    [step]: new Date().toISOString()
  };
  try {
    localStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(state.activation));
  } catch {
    /* in-memory only */
  }
  renderLaunchChecklist();
}

function applyStoredPrefs() {
  if (isOverlay) return;
  try {
    setTheme(localStorage.getItem(THEME_KEY) || "gold", { silent: true, skipSave: true });
    setDensity(localStorage.getItem(DENSITY_KEY) || "comfortable", { skipSave: true });
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    if (prefs.filter && ["all", ...SOURCE_ORDER].includes(prefs.filter)) state.filter = prefs.filter;
    if (typeof prefs.priorityOnly === "boolean") state.priorityOnly = prefs.priorityOnly;
  } catch {
    /* defaults stand */
  }
  syncControlsToState();
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ filter: state.filter, priorityOnly: state.priorityOnly }));
  } catch {
    /* in-memory only */
  }
}

function syncControlsToState() {
  document.querySelectorAll("[data-source-filter]").forEach((item) => {
    const active = item.dataset.sourceFilter === state.filter;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  if (els.priorityOnly) els.priorityOnly.checked = state.priorityOnly;
  if (els.densityToggle) els.densityToggle.checked = state.density === "compact";
}

function setTheme(theme, { silent = false, skipSave = false } = {}) {
  if (!THEMES.includes(theme)) theme = "gold";
  state.theme = theme;
  if (theme === "gold") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-pick]").forEach((button) => {
    const active = button.dataset.themePick === theme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!skipSave) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* in-memory only */
    }
  }
  if (!silent) toast(`theme: ${theme}`);
}

function setDensity(density, { skipSave = false } = {}) {
  state.density = density === "compact" ? "compact" : "comfortable";
  document.body.dataset.density = state.density;
  if (els.densityToggle) els.densityToggle.checked = state.density === "compact";
  if (!skipSave) {
    try {
      localStorage.setItem(DENSITY_KEY, state.density);
    } catch {
      /* in-memory only */
    }
  }
}

function applyUrlState() {
  if (isOverlay) return;
  const params = new URLSearchParams(location.search);
  state.judgeMode = params.get("judge") === "1";
  if (isJudgeRoute) state.judgeMode = true;
  document.body.dataset.judge = state.judgeMode ? "1" : "0";
  const src = params.get("src");
  if (src && ["all", ...SOURCE_ORDER].includes(src)) state.filter = src;
  const q = params.get("q");
  if (q) {
    state.query = q.trim().toLowerCase();
    if (els.searchInput) els.searchInput.value = q.trim();
  }
  if (params.get("priority") === "1") state.priorityOnly = true;
  const theme = params.get("theme");
  if (theme && THEMES.includes(theme)) setTheme(theme, { silent: true });
  syncControlsToState();
}

function buildViewUrl() {
  const params = new URLSearchParams();
  if (state.filter !== "all") params.set("src", state.filter);
  if (state.query) params.set("q", state.query);
  if (state.priorityOnly) params.set("priority", "1");
  if (state.theme !== "gold") params.set("theme", state.theme);
  const query = params.toString();
  const path = state.judgeMode ? "/judge" : "/";
  return `${location.origin}${path}${query ? `?${query}` : ""}`;
}

/* ---------- boot sequence ---------- */

function runBootSequence() {
  if (!els.bootScreen || !els.bootLog) return;
  if (state.judgeMode) return;
  let booted = false;
  try {
    booted = sessionStorage.getItem(BOOT_KEY) === "1";
  } catch {
    booted = true;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (booted || reducedMotion) return;

  els.bootScreen.hidden = false;
  const lines = [
    "BUBBLEWIRE RELAY v4",
    ">> establishing link ............. ok",
    ">> twitch / x / kick / x-live adapters .... armed",
    ">> normalizing feed .............. ok",
    ">> streaming"
  ];
  let index = 0;
  let dismissed = false;
  const timers = [];

  const finish = () => {
    if (dismissed) return;
    dismissed = true;
    timers.forEach(clearTimeout);
    els.bootScreen.classList.add("boot-done");
    setTimeout(() => {
      els.bootScreen.hidden = true;
    }, 380);
    try {
      sessionStorage.setItem(BOOT_KEY, "1");
    } catch {
      /* session only */
    }
    document.removeEventListener("keydown", finish, true);
  };

  els.bootScreen.addEventListener("click", finish);
  document.addEventListener("keydown", finish, true);

  const typeNext = () => {
    if (dismissed) return;
    index += 1;
    els.bootLog.textContent = lines.slice(0, index).join("\n");
    if (index < lines.length) timers.push(setTimeout(typeNext, 260));
    else timers.push(setTimeout(finish, 500));
  };
  typeNext();
}

/* ---------- signal stream ---------- */

function startSignalStream() {
  const canvas = els.signalStream;
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (canvas) canvas.hidden = true;
    return;
  }
  stream.running = true;
  // Seed from whatever is already in the buffer so the strip never starts empty.
  setTimeout(() => {
    state.messages.slice(0, 24).forEach((message, index) => {
      spawnStreamParticle(message, Math.random() * canvas.clientWidth);
    });
  }, 600);
  requestAnimationFrame(drawStream);
}

function spawnStreamParticle(message, atX = null) {
  if (!stream.running || !els.signalStream) return;
  const canvas = els.signalStream;
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 56;
  const lane = { twitch: 0.2, x: 0.4, kick: 0.6, xlive: 0.8 }[message.source] ?? 0.5;
  const heat = message.heat || 0;
  stream.particles.push({
    x: atX === null ? width + 8 : atX,
    y: height * lane + (Math.random() - 0.5) * height * 0.3,
    vx: -(0.9 + Math.random() * 0.5 + heat / 70),
    size: heat >= 50 ? 2.6 : 1.8,
    color: message.sourceColor || sourceColor(message.source),
    hot: heat >= 50
  });
  if (stream.particles.length > 140) stream.particles.splice(0, stream.particles.length - 140);
}

function drawStream() {
  if (!stream.running) return;
  const canvas = els.signalStream;
  if (!canvas) return;
  requestAnimationFrame(drawStream);
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

  // Center reference line.
  ctx.strokeStyle = "rgba(236, 233, 223, 0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cssHeight / 2 + 0.5);
  ctx.lineTo(cssWidth, cssHeight / 2 + 0.5);
  ctx.stroke();

  const spiking = Date.now() < state.spikeUntil;
  for (const particle of stream.particles) {
    particle.x += particle.vx * (spiking ? 1.9 : 1);
    const fade = Math.max(0, Math.min(1, particle.x / 60));
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = particle.color;
    const trail = particle.hot ? 26 : 14;
    const gradient = ctx.createLinearGradient(particle.x, 0, particle.x + trail, 0);
    gradient.addColorStop(0, particle.color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(particle.x, particle.y - particle.size / 2, trail, particle.size);
  }
  ctx.globalAlpha = 1;
  stream.particles = stream.particles.filter((particle) => particle.x > -30);
}

/* ---------- tab badge ---------- */

function watchTabVisibility() {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      state.hiddenUnseen = 0;
      updateTabBadge();
    }
  });
}

function updateTabBadge() {
  const base = "Bubblewire — Live Audience Signal Command Center";
  if (state.hiddenUnseen > 0 && document.hidden) {
    document.title = `(${Math.min(99, state.hiddenUnseen)}) ${base}`;
    if (els.favicon) els.favicon.href = "/assets/bubblewire-mark-alert.svg";
  } else {
    document.title = base;
    if (els.favicon) els.favicon.href = "/assets/bubblewire-mark.svg";
  }
}

/* ---------- notifications ---------- */

function notificationsGranted() {
  return "Notification" in window && Notification.permission === "granted";
}

async function onNotifyToggle(event) {
  if (!("Notification" in window)) {
    event.target.checked = false;
    toast("notifications unsupported here", "err");
    return;
  }
  if (event.target.checked) {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      event.target.checked = false;
      toast("notification permission denied", "err");
      return;
    }
    state.watchNotify = true;
    toast("background alerts on");
  } else {
    state.watchNotify = false;
    toast("background alerts off");
  }
  saveFlag(WATCH_NOTIFY_KEY, state.watchNotify);
}

/* ---------- channel hero ---------- */

async function maybeShowChannelHero() {
  if (!els.channelHero || loadFlag(HERO_KEY)) return;
  try {
    const response = await fetch("/setup.json");
    const setup = await response.json();
    const twitch = setup.sources?.twitch;
    if (twitch?.channelsMutable && (twitch.channels || []).length === 0 && !setup.adminLocked) {
      els.channelHero.hidden = false;
    }
  } catch {
    /* hero stays hidden */
  }
}

function hideChannelHero() {
  if (els.channelHero) els.channelHero.hidden = true;
}

async function heroWatch() {
  const channel = (els.heroChannelInput?.value || "").trim().toLowerCase().replace(/^#/, "");
  if (!/^[a-z0-9_]{1,25}$/.test(channel)) {
    toast("enter a valid twitch channel", "warn");
    return;
  }
  try {
    await postJson("/api/twitch/channels", { action: "add", channel });
    toast(`joining #${channel} — live chat incoming`);
    hideChannelHero();
    saveFlag(HERO_KEY, true);
    setFilter("twitch");
  } catch {
    toast("could not join channel", "err");
  }
}

/* ---------- session recap ---------- */

function downloadRecap() {
  trackActivation("recap");
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim() || "#d8a84a";

  ctx.fillStyle = "#0a0a09";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = "rgba(236, 233, 223, 0.06)";
  for (let x = 0; x < 1200; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 630);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(236, 233, 223, 0.18)";
  ctx.strokeRect(24.5, 24.5, 1151, 581);

  ctx.fillStyle = accent;
  ctx.font = "700 30px 'IBM Plex Mono', monospace";
  ctx.fillText("BUBBLEWIRE_", 64, 96);
  ctx.fillStyle = "rgba(236, 233, 223, 0.65)";
  ctx.font = "500 16px 'IBM Plex Mono', monospace";
  ctx.fillText(`SESSION RECAP — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, 64, 126);

  const topAuthor = [...state.session.authors.entries()].sort((a, b) => b[1] - a[1])[0];
  const stats = [
    ["CAPTURED", String(state.stats.totalMessages || 0)],
    ["PEAK RATE", `${state.session.peakRate}/min`],
    ["WATCH HITS", String(state.session.watchHits)],
    ["TOP AUTHOR", topAuthor ? `${topAuthor[0]} (${topAuthor[1]})` : "—"]
  ];
  stats.forEach(([label, value], index) => {
    const x = 64 + index * 280;
    ctx.fillStyle = "rgba(236, 233, 223, 0.55)";
    ctx.font = "600 14px 'IBM Plex Mono', monospace";
    ctx.fillText(label, x, 200);
    ctx.fillStyle = "#ece9df";
    ctx.font = "700 30px 'IBM Plex Mono', monospace";
    ctx.fillText(value.slice(0, 16), x, 240);
  });

  const hottest = state.session.hottest;
  ctx.fillStyle = "rgba(236, 233, 223, 0.55)";
  ctx.font = "600 14px 'IBM Plex Mono', monospace";
  ctx.fillText("HOTTEST SIGNAL", 64, 330);
  if (hottest) {
    ctx.fillStyle = hottest.sourceColor || accent;
    ctx.font = "700 20px 'IBM Plex Mono', monospace";
    ctx.fillText(`[${hottest.sourceLabel}] ${hottest.author.name} — heat ${hottest.heat}`, 64, 364);
    ctx.fillStyle = "#ece9df";
    ctx.font = "400 26px Inter, sans-serif";
    wrapText(ctx, String(hottest.content), 64, 404, 1072, 38, 3);
  } else {
    ctx.fillStyle = "#ece9df";
    ctx.font = "400 24px Inter, sans-serif";
    ctx.fillText("No messages this session yet.", 64, 370);
  }

  const sourceEntries = SOURCE_ORDER.map((source) => [source, state.stats.sources?.[source]?.count || 0]);
  const maxCount = Math.max(1, ...sourceEntries.map(([, count]) => count));
  sourceEntries.forEach(([source, count], index) => {
    const y = 520 + index * 26;
    ctx.fillStyle = "rgba(236, 233, 223, 0.6)";
    ctx.font = "600 13px 'IBM Plex Mono', monospace";
    ctx.fillText(source.toUpperCase(), 64, y + 11);
    ctx.fillStyle = sourceColor(source);
    ctx.fillRect(150, y, (count / maxCount) * 700, 14);
    ctx.fillStyle = "#ece9df";
    ctx.font = "600 13px 'IBM Plex Mono', monospace";
    ctx.fillText(String(count), 870, y + 12);
  });

  ctx.fillStyle = accent;
  ctx.font = "600 15px 'IBM Plex Mono', monospace";
  ctx.fillText(location.host || "bubblewire.xyz", 950, 580);

  canvas.toBlob((blob) => {
    if (!blob) {
      toast("recap render failed", "err");
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bubblewire-recap-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    toast("recap card downloaded");
  }, "image/png");
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines += 1;
      if (lines === maxLines) {
        ctx.fillText(`${line}…`, x, y);
        return;
      }
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

/* ---------- command center collapse ---------- */

function initCommandCollapse() {
  if (!els.productCommand) return;
  let stored = null;
  try {
    stored = localStorage.getItem(COMMAND_KEY);
  } catch {
    /* default expanded */
  }
  if (stored === null) {
    // First visit: show the full pitch once, auto-collapse on the next load.
    try {
      localStorage.setItem(COMMAND_KEY, "auto");
    } catch {
      /* session only */
    }
    applyCommandCollapsed(false);
    return;
  }
  applyCommandCollapsed(stored !== "expanded");
}

function setCommandCollapsed(collapsed) {
  applyCommandCollapsed(collapsed);
  try {
    localStorage.setItem(COMMAND_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* session only */
  }
}

function applyCommandCollapsed(collapsed) {
  if (!els.productCommand) return;
  els.productCommand.classList.toggle("collapsed", collapsed);
  if (els.commandToggle) {
    els.commandToggle.setAttribute("aria-expanded", String(!collapsed));
    els.commandToggle.textContent = collapsed ? "▾ intro" : "▴ intro";
    els.commandToggle.title = collapsed ? "Expand intro" : "Collapse intro";
  }
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
  const rate = messageRate();
  state.session.peakRate = Math.max(state.session.peakRate, rate);
  updateMeterSpeed(rate);
  detectSpike();
  drawRadar();
  drawSparks();
}

function updateMeterSpeed(rate) {
  if (!els.feedPanel) return;
  const duration = Math.max(280, Math.min(950, 950 - rate * 9));
  els.feedPanel.style.setProperty("--meter-ms", `${duration}ms`);
}

function detectSpike() {
  const now = Date.now();
  if (state.spikeUntil && now > state.spikeUntil) {
    state.spikeUntil = 0;
    document.body.classList.remove("spiking");
    if (els.spikeChip) els.spikeChip.hidden = true;
  }

  const last10 = countSince(now - 10000);
  const baselinePer10 = countSince(now - 120000) / 12;
  if (last10 >= 6 && last10 >= 3 * Math.max(1, baselinePer10) && now - state.lastSpikeAt > 30000) {
    state.lastSpikeAt = now;
    state.spikeUntil = now + 6000;
    document.body.classList.add("spiking");
    if (els.spikeChip) {
      els.spikeChip.textContent = `▲ volume spike — ${Math.round(last10 / Math.max(1, baselinePer10))}× baseline`;
      els.spikeChip.hidden = false;
    }
    toast("volume spike detected", "warn");
    if (state.watchSound) beep();
  }
}

function countSince(cutoffMs) {
  return state.messages.filter((m) => new Date(m.receivedAt).getTime() >= cutoffMs).length;
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

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function safeFilePart(value) {
  return String(value || "message").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "message";
}

function snapshotMessage(message) {
  return {
    id: message.id,
    source: message.source,
    sourceLabel: message.sourceLabel,
    author: {
      name: message.author?.name || "unknown",
      handle: message.author?.handle || ""
    },
    channel: message.channel || "",
    content: String(message.content || "").slice(0, 500),
    receivedAt: message.receivedAt || message.at || new Date().toISOString(),
    heat: Number(message.heat || 0),
    url: message.url || ""
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  tweenNumber(el, value);
  if (!flash) return;
  el.classList.remove("tick");
  void el.offsetWidth;
  el.classList.add("tick");
}

function tweenNumber(el, target) {
  const from = Number(el.dataset.tweenValue ?? el.textContent) || 0;
  const to = Number(target);
  if (!Number.isFinite(to) || from === to || Math.abs(to - from) > 500) {
    el.textContent = String(target);
    el.dataset.tweenValue = String(target);
    return;
  }
  el.dataset.tweenValue = String(to);
  const startedAt = performance.now();
  const duration = 280;
  const step = (now) => {
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1 && el.dataset.tweenValue === String(to)) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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

function maskPublicUrl(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/([^/]{4})[^/]*$/, "$1…");
    return `${url.origin}${path}`;
  } catch {
    const text = String(value || "");
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }
}

function escapeAttr(value) {
  return escapeHtml(value);
}
