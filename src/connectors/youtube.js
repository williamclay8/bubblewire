import { normalizeYouTubeLiveChatMessage } from "../core/messages.js";

const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_MESSAGES_URL = "https://www.googleapis.com/youtube/v3/liveChat/messages";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const MIN_POLL_INTERVAL_MS = 2000;
const MAX_POLL_INTERVAL_MS = 60000;
const DEFAULT_MAX_RESULTS = 200;
const MIN_MAX_RESULTS = 200;
const MAX_MAX_RESULTS = 2000;

export function startYouTubeConnector(hub, env = process.env, options = {}) {
  const config = resolveYouTubeConfig(env);
  const fetchImpl = options.fetch || fetch;
  const timers = {
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout
  };
  let stopped = false;
  let timer = null;
  let liveChatId = config.liveChatId;
  let videoId = config.videoId;
  let channelId = config.channelId;
  let channelHandle = config.channelHandle;
  let channel = config.channel || "";
  let nextPageToken = "";
  let diagnostics = null;

  if (config.error) {
    hub.setSourceStatus("youtube", {
      state: "missing",
      detail: config.error,
      diagnostics: null
    });
    return {
      stop() {},
      snapshot: () => snapshot()
    };
  }

  poll();

  return {
    stop() {
      stopped = true;
      if (timer) timers.clearTimeout(timer);
      hub.setSourceStatus("youtube", {
        state: "stopped",
        detail: "connector stopped"
      });
    },
    snapshot: () => snapshot()
  };

  async function poll() {
    if (stopped) return;
    try {
      if (!liveChatId && !videoId && (channelId || channelHandle)) await resolveActiveVideoFromChannel();
      if (!liveChatId) await resolveActiveLiveChat();
      await pollMessages();
    } catch (error) {
      if (stopped) return;
      diagnostics = error.diagnostics || runtimeDiagnostic(error);
      hub.setSourceStatus("youtube", {
        state: diagnostics.state || "error",
        detail: diagnostics.summary,
        diagnostics
      });
      schedule(config.pollIntervalMs);
    }
  }

  async function resolveActiveVideoFromChannel() {
    if (!channelId) await resolveChannelIdFromHandle();
    if (!channelId) {
      throw new YouTubeDiagnosticError({
        state: "missing",
        phase: "search",
        summary: "missing YouTube channel id or handle"
      });
    }

    const target = channel || (channelHandle ? `@${channelHandle}` : channelId);
    hub.setSourceStatus("youtube", {
      state: "connecting",
      detail: `searching active live video for ${target}`
    });

    const url = new URL(YOUTUBE_SEARCH_URL);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("channelId", channelId);
    url.searchParams.set("eventType", "live");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("order", "date");
    url.searchParams.set("key", config.apiKey);

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new YouTubeDiagnosticError(await summarizeYouTubeFailure(response, {
        apiKey: config.apiKey,
        phase: "search"
      }));
    }

    const body = await response.json();
    const item = Array.isArray(body.items) ? body.items[0] : null;
    const activeVideoId = cleanVideoId(item?.id?.videoId || "");
    if (!activeVideoId) {
      throw new YouTubeDiagnosticError({
        state: "missing",
        phase: "search",
        summary: `${target} has no active YouTube live broadcast`
      });
    }

    videoId = activeVideoId;
    channel = item?.snippet?.channelTitle || channel;
  }

  async function resolveChannelIdFromHandle() {
    if (!channelHandle) return;
    hub.setSourceStatus("youtube", {
      state: "connecting",
      detail: `resolving YouTube handle @${channelHandle}`
    });

    const url = new URL(YOUTUBE_CHANNELS_URL);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("forHandle", `@${channelHandle}`);
    url.searchParams.set("key", config.apiKey);

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new YouTubeDiagnosticError(await summarizeYouTubeFailure(response, {
        apiKey: config.apiKey,
        phase: "channels"
      }));
    }

    const body = await response.json();
    const item = Array.isArray(body.items) ? body.items[0] : null;
    const id = cleanYouTubeChannelId(item?.id || "");
    if (!id) {
      throw new YouTubeDiagnosticError({
        state: "missing",
        phase: "channels",
        summary: `YouTube handle @${channelHandle} was not found`
      });
    }
    channelId = id;
    channel = item?.snippet?.title || channel;
  }

  async function resolveActiveLiveChat() {
    if (!videoId) return;
    hub.setSourceStatus("youtube", {
      state: "connecting",
      detail: `resolving live chat for video ${videoId}`
    });

    const url = new URL(YOUTUBE_VIDEOS_URL);
    url.searchParams.set("part", "snippet,liveStreamingDetails");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", config.apiKey);

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new YouTubeDiagnosticError(await summarizeYouTubeFailure(response, {
        apiKey: config.apiKey,
        phase: "videos"
      }));
    }

    const body = await response.json();
    const item = Array.isArray(body.items) ? body.items[0] : null;
    const activeLiveChatId = item?.liveStreamingDetails?.activeLiveChatId || "";
    channel = item?.snippet?.channelTitle || item?.snippet?.title || channel;
    if (!activeLiveChatId) {
      throw new YouTubeDiagnosticError({
        state: "missing",
        phase: "videos",
        summary: `video ${videoId} has no active live chat`
      });
    }
    liveChatId = activeLiveChatId;
  }

  async function pollMessages() {
    if (!liveChatId) {
      throw new YouTubeDiagnosticError({
        state: "missing",
        phase: "messages",
        summary: "missing YouTube live chat id"
      });
    }

    hub.setSourceStatus("youtube", {
      state: "connecting",
      detail: "polling live chat messages"
    });

    const url = new URL(YOUTUBE_MESSAGES_URL);
    url.searchParams.set("part", "snippet,authorDetails");
    url.searchParams.set("liveChatId", liveChatId);
    url.searchParams.set("maxResults", String(config.maxResults));
    url.searchParams.set("profileImageSize", "88");
    url.searchParams.set("key", config.apiKey);
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new YouTubeDiagnosticError(await summarizeYouTubeFailure(response, {
        apiKey: config.apiKey,
        phase: "messages"
      }));
    }

    const body = await response.json();
    diagnostics = null;
    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      const message = normalizeYouTubeLiveChatMessage(item, { videoId, liveChatId, channel });
      if (message) hub.addMessage(message);
    }
    nextPageToken = body.nextPageToken || nextPageToken;

    if (body.offlineAt) {
      stopped = true;
      hub.setSourceStatus("youtube", {
        state: "ended",
        detail: `live chat ended at ${body.offlineAt}`,
        diagnostics: null
      });
      return;
    }

    hub.setSourceStatus("youtube", {
      state: "connected",
      detail: youtubeStatusDetail(items.length),
      diagnostics: null
    });
    schedule(positiveInteger(body.pollingIntervalMillis, config.pollIntervalMs));
  }

  function schedule(ms) {
    if (stopped) return;
    timer = timers.setTimeout(poll, clamp(ms, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS));
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function youtubeStatusDetail(count) {
    const target = channel || videoId || liveChatId;
    const suffix = count === 1 ? "1 message" : `${count} messages`;
    return `watching ${target} · ${suffix} in latest poll`;
  }

  function snapshot() {
    return {
      videoId: videoId || null,
      liveChatId: liveChatId || null,
      channelId: channelId || null,
      channelHandle: channelHandle || null,
      channel: channel || null,
      nextPageToken: nextPageToken || null,
      diagnostics: diagnostics ? clone(diagnostics) : null,
      pollIntervalMs: config.pollIntervalMs,
      maxResults: config.maxResults
    };
  }
}

export function resolveYouTubeConfig(env = process.env) {
  const apiKey = String(env.YOUTUBE_API_KEY || env.GOOGLE_API_KEY || "").trim();
  const liveChatId = cleanYouTubeLiveChatId(env.YOUTUBE_LIVE_CHAT_ID || "");
  const rawVideoTarget = env.YOUTUBE_VIDEO_ID || env.YOUTUBE_LIVE_VIDEO_ID || env.YOUTUBE_URL || env.YOUTUBE_LIVE_URL || "";
  const videoId = extractYouTubeVideoId(
    rawVideoTarget
  );
  const explicitHandle = env.YOUTUBE_CHANNEL_HANDLE || env.YOUTUBE_HANDLE || env.YOUTUBE_CHANNEL_URL || "";
  const channelHandle = extractYouTubeChannelHandle(explicitHandle) ||
    (!videoId ? extractYouTubeChannelHandle(env.YOUTUBE_URL || env.YOUTUBE_LIVE_URL || "") : "");
  const channelId = cleanYouTubeChannelId(env.YOUTUBE_CHANNEL_ID || "");
  const channel = cleanText(env.YOUTUBE_CHANNEL || env.YOUTUBE_CHANNEL_TITLE || "", 120);
  const pollIntervalMs = clamp(
    positiveInteger(env.YOUTUBE_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    MIN_POLL_INTERVAL_MS,
    MAX_POLL_INTERVAL_MS
  );
  const maxResults = clamp(
    positiveInteger(env.YOUTUBE_MAX_RESULTS, DEFAULT_MAX_RESULTS),
    MIN_MAX_RESULTS,
    MAX_MAX_RESULTS
  );

  let error = "";
  if (!apiKey) error = "missing YOUTUBE_API_KEY";
  else if (!liveChatId && !videoId && !channelId && !channelHandle) {
    error = "missing YOUTUBE_LIVE_CHAT_ID, YOUTUBE_VIDEO_ID, or YOUTUBE_CHANNEL_HANDLE";
  }

  return {
    apiKey,
    liveChatId,
    videoId,
    channelId,
    channelHandle,
    channel,
    pollIntervalMs,
    maxResults,
    error
  };
}

export function extractYouTubeVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return cleanVideoId(url.pathname.split("/").filter(Boolean)[0]);
  if (!["youtube.com", "youtube-nocookie.com"].includes(host)) return "";

  const watchId = cleanVideoId(url.searchParams.get("v"));
  if (watchId) return watchId;

  const parts = url.pathname.split("/").filter(Boolean);
  const idHosts = new Set(["live", "embed", "shorts", "v"]);
  if (idHosts.has(parts[0])) return cleanVideoId(parts[1]);
  return "";
}

export function extractYouTubeChannelHandle(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const direct = raw.match(/^@?([a-zA-Z0-9._-]{3,30})$/);
  if (direct) return direct[1];

  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (!["youtube.com", "youtube-nocookie.com"].includes(host)) return "";

  const parts = url.pathname.split("/").filter(Boolean);
  const handle = parts.find((part) => part.startsWith("@"));
  return handle ? extractYouTubeChannelHandle(handle) : "";
}

export function cleanYouTubeLiveChatId(value) {
  const raw = String(value || "").trim();
  if (!raw || /\s/.test(raw)) return "";
  return raw.slice(0, 200);
}

export function cleanYouTubeChannelId(value) {
  const raw = String(value || "").trim();
  if (!raw || /\s/.test(raw)) return "";
  return raw.slice(0, 120);
}

async function summarizeYouTubeFailure(response, options = {}) {
  const rawBody = await safeResponseText(response);
  const body = parseJson(rawBody);
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || "";
  const detail = body?.error?.message || response.statusText || "YouTube request failed";
  const summary = `YouTube ${options.phase || "api"} HTTP ${response.status}${reason ? ` · ${reason}` : ""}`;

  return prune({
    state: reason === "liveChatEnded" || reason === "liveChatDisabled" ? "ended" : "error",
    phase: cleanText(options.phase || "api", 32),
    httpStatus: response.status,
    reason: cleanText(reason, 120),
    detail: cleanText(cleanSecrets(detail, [options.apiKey]), 260),
    summary: cleanText(cleanSecrets(summary, [options.apiKey]), 220)
  });
}

function runtimeDiagnostic(error) {
  return {
    phase: "runtime",
    summary: cleanText(error?.message || "YouTube connector failed", 220)
  };
}

class YouTubeDiagnosticError extends Error {
  constructor(diagnostics) {
    super(diagnostics.summary);
    this.diagnostics = diagnostics;
  }
}

function cleanVideoId(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^[a-zA-Z0-9_-]{11}$/);
  return match ? raw : "";
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function cleanSecrets(value, secrets = []) {
  let text = String(value || "");
  for (const secret of secrets.filter(Boolean)) {
    text = text.replaceAll(secret, "[redacted]");
  }
  return text;
}

async function safeResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function prune(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== "" && entry !== null && entry !== undefined));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
