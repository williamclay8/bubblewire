import { createHash } from "node:crypto";

const SOURCES = ["twitch", "x", "kick"];
const LIVE_EVIDENCE = new Set(["live", "webhook-proof", "signed"]);
const DEFAULT_RULES = {
  approvedOnly: false,
  approvedIds: [],
  blockedTerms: [],
  redactLinks: false
};

export function createSessionSnapshot({ snapshot = {}, setup = {}, routes = {}, now = () => new Date() } = {}) {
  const generatedAt = toIso(now());
  const stats = snapshot.stats || {};
  const analysis = snapshot.analysis || {};
  const startedAt = stats.startedAt || generatedAt;
  const durationSeconds = Math.max(0, Math.round((toMs(generatedAt) - toMs(startedAt)) / 1000));
  const phase = snapshot.runtime?.liveOnly ? "live" : "demo";

  return {
    kind: "stream-session",
    generatedAt,
    phase,
    startedAt,
    durationSeconds,
    routes,
    metrics: {
      totalMessages: Number(stats.totalMessages || 0),
      duplicatesDropped: Number(stats.duplicatesDropped || 0),
      liveSources: liveSourceCount(snapshot),
      moments: analysis.moments?.length || 0,
      questions: analysis.questions?.length || 0,
      trends: analysis.trends?.length || 0,
      crossPlatformTrends: (analysis.trends || []).filter((trend) => trend.crossPlatform).length,
      watching: Number(snapshot.runtime?.watching || 0)
    },
    preflight: buildPreflight({ snapshot, setup }),
    headline: buildSessionHeadline({ snapshot, analysis })
  };
}

export function createProofPacket({ snapshot = {}, setup = {}, routes = {}, now = () => new Date() } = {}) {
  const generatedAt = toIso(now());
  const recentMessages = (snapshot.messages || []).slice(0, 80);
  const recentEventIds = recentMessages.map((message) => message.id).filter(Boolean);
  const sources = {};

  for (const source of SOURCES) {
    const proof = snapshot.proof?.sources?.[source] || {};
    const status = snapshot.status?.[source] || {};
    const sourceStats = snapshot.stats?.sources?.[source] || {};
    sources[source] = {
      label: snapshot.sources?.[source]?.label || source,
      count: Number(proof.count ?? sourceStats.count ?? 0),
      evidenceLevel: proof.evidenceLevel || (sourceStats.count ? "live" : "waiting"),
      status: status.state || "idle",
      detail: status.detail || "",
      lastMessageAt: proof.lastMessageAt || sourceStats.lastMessageAt || null,
      lastMessageId: proof.lastMessageId || null,
      rawType: proof.rawType || null,
      setup: proofSetupSummary(source, setup.sources?.[source])
    };
  }

  return {
    schema: "bubblewire-proof-packet/v1",
    generatedAt,
    routes,
    runtime: {
      demoEnabled: Boolean(snapshot.runtime?.demoEnabled),
      demoMode: snapshot.runtime?.demoMode || "unknown",
      liveOnly: Boolean(snapshot.runtime?.liveOnly)
    },
    metrics: {
      totalMessages: Number(snapshot.stats?.totalMessages || 0),
      duplicatesDropped: Number(snapshot.stats?.duplicatesDropped || 0),
      bufferMessages: (snapshot.messages || []).length,
      liveSources: liveSourceCount(snapshot),
      moments: snapshot.analysis?.moments?.length || 0,
      questions: snapshot.analysis?.questions?.length || 0,
      crossPlatformTrends: (snapshot.analysis?.trends || []).filter((trend) => trend.crossPlatform).length
    },
    sources,
    analysis: {
      mood: snapshot.analysis?.overall || null,
      latestMoments: (snapshot.analysis?.moments || []).slice(0, 5).map(sanitizeMoment),
      topQuestions: (snapshot.analysis?.questions || []).slice(0, 5).map(sanitizeMoment),
      trends: (snapshot.analysis?.trends || []).slice(0, 8).map((trend) => ({
        term: trend.term,
        count: trend.count,
        sources: Array.isArray(trend.sources) ? trend.sources.slice(0, 3) : [],
        crossPlatform: Boolean(trend.crossPlatform)
      }))
    },
    recentEventIds,
    eventHash: hashEvents(recentMessages)
  };
}

export function createReplayBundle({ snapshot = {}, momentId = "", windowSeconds = 90, now = () => new Date() } = {}) {
  const generatedAt = toIso(now());
  const messages = (snapshot.messages || []).slice().sort((a, b) => toMs(a.receivedAt) - toMs(b.receivedAt));
  const target =
    messages.find((message) => message.id === momentId) ||
    messages.find((message) => message.id === snapshot.analysis?.moments?.[0]?.id) ||
    messages[0] ||
    null;

  if (!target) {
    return {
      kind: "replay-bundle",
      generatedAt,
      windowSeconds: Number(windowSeconds) || 90,
      target: null,
      context: [],
      summary: { sources: [], messageCount: 0, startedAt: null, endedAt: null }
    };
  }

  const windowMs = Math.max(1, Number(windowSeconds) || 90) * 1000;
  const targetMs = toMs(target.receivedAt);
  const context = messages
    .filter((message) => Math.abs(toMs(message.receivedAt) - targetMs) <= windowMs)
    .map(sanitizeMessage);
  const sources = [...new Set(context.map((message) => message.source))].sort();

  return {
    kind: "replay-bundle",
    generatedAt,
    windowSeconds: Math.max(1, Number(windowSeconds) || 90),
    target: sanitizeMessage(target),
    context,
    summary: {
      sources,
      messageCount: context.length,
      startedAt: context[0]?.receivedAt || target.receivedAt,
      endedAt: context[context.length - 1]?.receivedAt || target.receivedAt,
      heatPeak: context.reduce((peak, message) => Math.max(peak, Number(message.heat || 0)), 0)
    }
  };
}

export function applySafetyRules(message, rules = {}) {
  const config = { ...DEFAULT_RULES, ...(rules || {}) };
  const approvedIds = new Set(Array.isArray(config.approvedIds) ? config.approvedIds.map(String) : []);
  const next = {
    ...message,
    content: String(message?.content || ""),
    hidden: false,
    safety: { ...(message?.safety || {}) }
  };

  if (config.approvedOnly && !approvedIds.has(String(message?.id || ""))) {
    next.hidden = true;
    next.reason = "not approved for broadcast";
    next.safety.blocked = true;
    return { ...next, message: next };
  }

  let content = next.content;
  const blockedTerms = Array.isArray(config.blockedTerms) ? config.blockedTerms : [];
  for (const term of blockedTerms) {
    const cleaned = String(term || "").trim();
    if (!cleaned) continue;
    content = content.replace(new RegExp(escapeRegex(cleaned), "gi"), "[redacted]");
  }
  if (config.redactLinks) {
    content = content.replace(/https?:\/\/\S+/gi, "[redacted-link]");
  }

  if (content !== next.content) {
    next.content = content;
    next.safety.redacted = true;
  }

  return { ...next, message: next };
}

function buildPreflight({ snapshot, setup }) {
  return [
    preflightItem(
      "runtime",
      snapshot.runtime?.liveOnly ? "pass" : "warn",
      snapshot.runtime?.liveOnly ? "live-only runtime" : "demo mode available"
    ),
    preflightItem(
      "history",
      setup.history?.enabled ? "pass" : "warn",
      setup.history?.enabled ? "history export enabled" : "history export disabled"
    ),
    ...SOURCES.map((source) => sourcePreflight(source, snapshot, setup)),
    preflightItem("overlay", "pass", routesReady(setup) ? "broadcast routes ready" : "overlay route available")
  ];
}

function sourcePreflight(source, snapshot, setup) {
  const proof = snapshot.proof?.sources?.[source] || {};
  const status = snapshot.status?.[source] || {};
  const count = Number(proof.count ?? snapshot.stats?.sources?.[source]?.count ?? 0);
  const evidence = proof.evidenceLevel || "";
  const live = count > 0 || LIVE_EVIDENCE.has(evidence);
  const setupSource = setup.sources?.[source] || {};
  if (source === "x") {
    return preflightItem(source, live || xLooksConfigured(setupSource) ? "warn" : "fail", xDiagnosticDetail(setupSource, status));
  }
  if (live) return preflightItem(source, "pass", `${proof.evidenceLevel || "live"} · ${count} seen`);

  if (source === "twitch") {
    return preflightItem(source, twitchLooksConfigured(setupSource) ? "warn" : "fail", twitchDetail(setupSource, status));
  }
  if (source === "kick") {
    return preflightItem(source, kickLooksConfigured(setupSource) ? "warn" : "fail", status.detail || setupSource.webhookUrl || setupSource.note || "waiting");
  }
  return preflightItem(source, "warn", status.detail || "waiting");
}

function preflightItem(key, status, detail) {
  return { key, status, detail };
}

function liveSourceCount(snapshot) {
  return SOURCES.filter((source) => {
    const proof = snapshot.proof?.sources?.[source] || {};
    const stats = snapshot.stats?.sources?.[source] || {};
    const status = snapshot.status?.[source] || {};
    return Number(proof.count || stats.count || 0) > 0 ||
      LIVE_EVIDENCE.has(proof.evidenceLevel) ||
      ["connected", "live", "webhook-ready"].includes(status.state);
  }).length;
}

function proofSetupSummary(source, setupSource = {}) {
  if (!setupSource || typeof setupSource !== "object") return { configured: false };
  if (source === "twitch") {
    return {
      configured: twitchLooksConfigured(setupSource),
      path: setupSource.path || "unknown",
      channels: Array.isArray(setupSource.channels) ? setupSource.channels.slice(0, 10) : []
    };
  }
  if (source === "x") {
    return {
      configured: xLooksConfigured(setupSource),
      rules: setupSource.rules?.count || 0,
      stream: setupSource.stream?.enabled ? "enabled" : setupSource.stream?.paused ? "paused" : "disabled"
    };
  }
  if (source === "kick") {
    return {
      configured: kickLooksConfigured(setupSource),
      signatureRequired: Boolean(setupSource.vars?.KICK_REQUIRE_SIGNATURE),
      webhookPath: setupSource.webhookUrl ? "/kick.webhook" : ""
    };
  }
  return { configured: false };
}

function twitchLooksConfigured(setupSource = {}) {
  return setupSource.path && setupSource.path !== "none";
}

function xLooksConfigured(setupSource = {}) {
  return Boolean(setupSource.vars?.X_BEARER_TOKEN || setupSource.rules?.count || setupSource.stream?.enabled);
}

function kickLooksConfigured(setupSource = {}) {
  return Boolean(setupSource.webhookUrl || setupSource.vars?.KICK_WEBHOOK_PUBLIC_URL);
}

function xDiagnosticDetail(setupSource = {}, status = {}) {
  const diagnostics = setupSource.diagnostics || status.diagnostics || {};
  if (diagnostics.httpStatus) {
    const bits = [`HTTP ${diagnostics.httpStatus}`];
    if (diagnostics.statusText) bits.push(diagnostics.statusText);
    if (diagnostics.problemTitle) bits.push(diagnostics.problemTitle);
    return bits.join(" · ");
  }
  if (status.detail && /^HTTP\s+\d{3}/i.test(status.detail)) return status.detail;
  if (diagnostics.summary) return diagnostics.summary;
  return status.detail || setupSource.note || "waiting for filtered stream evidence";
}

function twitchDetail(setupSource = {}, status = {}) {
  if (setupSource.channels?.length) return `watching ${setupSource.channels.map((channel) => `#${channel}`).join(", ")}`;
  return status.detail || setupSource.note || "waiting for Twitch evidence";
}

function routesReady(setup = {}) {
  return Boolean(setup?.sources?.kick?.webhookUrl);
}

function buildSessionHeadline({ snapshot, analysis }) {
  const total = Number(snapshot.stats?.totalMessages || 0);
  const topMoment = analysis?.moments?.[0];
  if (topMoment) return `${topMoment.sourceLabel || topMoment.source} moment: ${topMoment.content}`;
  return total ? `${total} source-labeled messages captured` : "waiting for live audience signal";
}

function sanitizeMessage(message) {
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
    receivedAt: message.receivedAt,
    url: message.url || "",
    heat: Number(message.heat || 0),
    mode: message.mode || "live",
    evidenceLevel: message.evidenceLevel || ""
  };
}

function sanitizeMoment(moment) {
  return {
    id: moment.id,
    at: moment.at,
    source: moment.source,
    sourceLabel: moment.sourceLabel,
    author: moment.author,
    content: String(moment.content || "").slice(0, 220),
    heat: Number(moment.heat || 0),
    reason: moment.reason || ""
  };
}

function hashEvents(messages) {
  const input = messages
    .map((message) => [message.id, message.source, message.receivedAt, message.rawType || ""].join("|"))
    .join("\n");
  return createHash("sha256").update(input).digest("hex");
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toMs(value) {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
