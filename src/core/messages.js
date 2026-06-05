import { createHash } from "node:crypto";

export const SOURCE_META = {
  twitch: {
    label: "Twitch",
    color: "#9146ff",
    home: "https://www.twitch.tv"
  },
  x: {
    label: "X",
    color: "#f4f2ea",
    home: "https://x.com"
  },
  kick: {
    label: "Kick",
    color: "#53fc18",
    home: "https://kick.com"
  },
  demo: {
    label: "Demo",
    color: "#d8a84a",
    home: ""
  }
};

const MAX_CONTENT_LENGTH = 1000;

export function parseIrcTags(rawTags = "") {
  const source = rawTags.startsWith("@") ? rawTags.slice(1) : rawTags;
  if (!source) return {};

  return Object.fromEntries(
    source.split(";").map((part) => {
      const [key, value = ""] = part.split("=");
      return [key, decodeIrcTagValue(value)];
    })
  );
}

export function normalizeTwitchLine(line) {
  if (!line.includes(" PRIVMSG ")) return null;

  const tagsMatch = line.match(/^(@\S+)\s+/);
  const tags = tagsMatch ? parseIrcTags(tagsMatch[1]) : {};
  const withoutTags = tagsMatch ? line.slice(tagsMatch[0].length) : line;
  const match = withoutTags.match(
    /^:([^!]+)![^\s]+\s+PRIVMSG\s+#([^\s]+)\s+:(.*)$/
  );

  if (!match) return null;

  const [, login, channel, content] = match;
  const id = tags.id || stableHash(["twitch", login, channel, content, Date.now()].join(":"));
  const receivedAt = coerceDate(tags["tmi-sent-ts"]);
  const displayName = tags["display-name"] || login;

  return createUnifiedMessage({
    id: `twitch:${id}`,
    source: "twitch",
    rawType: "PRIVMSG",
    author: {
      id: tags["user-id"] || "",
      name: displayName,
      handle: login,
      color: tags.color || SOURCE_META.twitch.color,
      verified: hasBadge(tags.badges, "broadcaster")
    },
    channel,
    content,
    receivedAt,
    url: `${SOURCE_META.twitch.home}/${encodeURIComponent(channel)}`,
    badges: splitBadges(tags.badges),
    mode: "live",
    raw: { tags }
  });
}

export function normalizeTwitchEventSubNotification(payload) {
  if (payload?.subscription?.type !== "channel.chat.message" || !payload.event) return null;

  const event = payload.event;
  const messageId = event.message_id || stableHash(JSON.stringify(event));
  const channel = event.broadcaster_user_login || event.broadcaster_user_name || "twitch";
  const content = event.message?.text || fragmentsToText(event.message?.fragments) || "";

  return createUnifiedMessage({
    id: `twitch:${messageId}`,
    source: "twitch",
    rawType: "channel.chat.message",
    author: {
      id: event.chatter_user_id || "",
      name: event.chatter_user_name || event.chatter_user_login || "Twitch user",
      handle: event.chatter_user_login || "",
      color: event.color || SOURCE_META.twitch.color,
      verified: hasEventSubBadge(event.badges, "broadcaster")
    },
    channel,
    content,
    receivedAt: coerceDate(payload.metadata?.message_timestamp || payload.subscription?.created_at),
    url: `${SOURCE_META.twitch.home}/${encodeURIComponent(channel)}`,
    badges: formatEventSubBadges(event.badges),
    mode: "live",
    raw: {
      subscriptionType: payload.subscription.type,
      messageType: event.message_type || "text"
    }
  });
}

export function normalizeKickWebhook(payload, headers = {}, options = {}) {
  if (!payload || typeof payload !== "object") return null;

  const normalizedHeaders = normalizeHeaders(headers);
  const eventType = normalizedHeaders["kick-event-type"] || "chat.message.sent";
  if (eventType !== "chat.message.sent") return null;

  const sender = payload.sender || {};
  const broadcaster = payload.broadcaster || {};
  const channel = broadcaster.channel_slug || broadcaster.username || "kick";
  const messageId = payload.message_id || stableHash(JSON.stringify(payload));
  const signatureStatus = options.signatureStatus || kickSignatureStatus(normalizedHeaders);

  return createUnifiedMessage({
    id: `kick:${messageId}`,
    source: "kick",
    rawType: eventType,
    author: {
      id: sender.user_id ? String(sender.user_id) : "",
      name: sender.username || "kick-user",
      handle: sender.channel_slug || sender.username || "",
      color: sender.identity?.username_color || SOURCE_META.kick.color,
      avatar: sender.profile_picture || "",
      verified: Boolean(sender.is_verified)
    },
    channel,
    content: payload.content || "",
    receivedAt: coerceDate(payload.created_at),
    url: `${SOURCE_META.kick.home}/${encodeURIComponent(channel)}`,
    badges: formatKickBadges(sender.identity?.badges),
    mode: "live",
    evidenceLevel: options.evidenceLevel || (signatureStatus === "verified" ? "signed" : "webhook-proof"),
    raw: { eventType, signature: signatureStatus }
  });
}

export function normalizeXStreamEvent(payload) {
  if (!payload?.data?.id) return null;

  const post = payload.data;
  const user = findXUser(payload.includes?.users, post.author_id);
  const rule = payload.matching_rules?.[0];
  const username = user?.username || post.username || "";
  const publicMetrics = post.public_metrics || {};

  return createUnifiedMessage({
    id: `x:${post.id}`,
    source: "x",
    rawType: "filtered-stream",
    author: {
      id: post.author_id || user?.id || "",
      name: user?.name || username || "X user",
      handle: username,
      avatar: user?.profile_image_url || "",
      verified: Boolean(user?.verified)
    },
    channel: rule?.tag || "filtered-stream",
    content: post.text || "",
    receivedAt: coerceDate(post.created_at),
    url: username
      ? `${SOURCE_META.x.home}/${encodeURIComponent(username)}/status/${post.id}`
      : `${SOURCE_META.x.home}/i/web/status/${post.id}`,
    badges: rule?.tag ? [`rule:${rule.tag}`] : [],
    metrics: {
      likes: publicMetrics.like_count || 0,
      replies: publicMetrics.reply_count || 0,
      reposts: publicMetrics.repost_count || publicMetrics.retweet_count || 0
    },
    mode: "live",
    raw: { matchingRules: payload.matching_rules || [] }
  });
}

export function createInjectedMessage(input = {}) {
  const source = SOURCE_META[input.source] ? input.source : "demo";
  const channel = cleanText(input.channel || `${source}-demo`, 80);
  const content = cleanText(input.content || "Manual signal", MAX_CONTENT_LENGTH);
  const authorName = cleanText(input.author || `${SOURCE_META[source].label} tester`, 80);
  const id = input.id || stableHash([source, authorName, channel, content, Date.now()].join(":"));

  return createUnifiedMessage({
    id: `${source}:${id}`,
    source,
    rawType: "manual-injection",
    author: {
      name: authorName,
      handle: authorName.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      color: SOURCE_META[source].color,
      verified: false
    },
    channel,
    content,
    receivedAt: new Date().toISOString(),
    url: SOURCE_META[source].home,
    badges: ["manual"],
    mode: "demo",
    raw: { injected: true }
  });
}

export function createUnifiedMessage(input) {
  const source = input.source || "demo";
  const meta = SOURCE_META[source] || SOURCE_META.demo;
  const content = cleanText(input.content || "", MAX_CONTENT_LENGTH);
  const receivedAt = coerceDate(input.receivedAt);
  const heat = calculateHeat(content, input.metrics || {});

  return {
    id: input.id,
    source,
    sourceLabel: meta.label,
    sourceColor: meta.color,
    rawType: input.rawType || "message",
    author: {
      id: input.author?.id || "",
      name: cleanText(input.author?.name || input.author?.handle || "unknown", 80),
      handle: cleanText(input.author?.handle || "", 80),
      color: input.author?.color || meta.color,
      avatar: input.author?.avatar || "",
      verified: Boolean(input.author?.verified)
    },
    channel: cleanText(input.channel || "", 120),
    content,
    receivedAt,
    url: input.url || meta.home,
    badges: Array.isArray(input.badges) ? input.badges.filter(Boolean).slice(0, 8) : [],
    metrics: input.metrics || {},
    heat,
    mode: input.mode || "live",
    evidenceLevel: input.evidenceLevel || "",
    raw: input.raw || {}
  };
}

function kickSignatureStatus(headers) {
  return headers["kick-event-signature"] ? "present-unverified" : "not-required";
}

function decodeIrcTagValue(value) {
  return value
    .replaceAll("\\s", " ")
    .replaceAll("\\:", ";")
    .replaceAll("\\r", "\r")
    .replaceAll("\\n", "\n")
    .replaceAll("\\\\", "\\");
}

function coerceDate(value) {
  if (!value) return new Date().toISOString();
  if (/^\d+$/.test(String(value))) return new Date(Number(value)).toISOString();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function cleanText(value, maxLength) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function splitBadges(value = "") {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

function hasBadge(value = "", badgeName) {
  return splitBadges(value).some((badge) => badge.startsWith(`${badgeName}/`));
}

function formatKickBadges(badges = []) {
  return badges
    .filter((badge) => badge?.text)
    .map((badge) => (badge.count ? `${badge.text} x${badge.count}` : badge.text));
}

function fragmentsToText(fragments = []) {
  return fragments.map((fragment) => fragment.text || "").join("");
}

function formatEventSubBadges(badges = []) {
  return badges.map((badge) => `${badge.set_id}/${badge.id}`).filter(Boolean);
}

function hasEventSubBadge(badges = [], badgeName) {
  return badges.some((badge) => badge.set_id === badgeName);
}

function findXUser(users = [], authorId) {
  return users.find((user) => user.id === authorId) || users[0] || null;
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
}

function calculateHeat(content, metrics) {
  const uppercaseWords = content.split(/\s+/).filter((word) => word.length > 2 && word === word.toUpperCase());
  const punctuation = (content.match(/[!?]/g) || []).length;
  const metricScore = (metrics.likes || 0) + (metrics.replies || 0) * 2 + (metrics.reposts || 0) * 3;
  return Math.min(99, uppercaseWords.length * 8 + punctuation * 5 + metricScore);
}
