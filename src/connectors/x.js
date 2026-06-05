import { normalizeXStreamEvent } from "../core/messages.js";

const X_STREAM_URL = "https://api.x.com/2/tweets/search/stream";
const X_RULES_URL = `${X_STREAM_URL}/rules`;

export function startXConnector(hub, env = process.env) {
  const bearerToken = env.X_BEARER_TOKEN;
  let rules = resolveXRulesFromEnv(env);

  if (!bearerToken) {
    hub.setSourceStatus("x", {
      state: "missing",
      detail: "missing X_BEARER_TOKEN for filtered stream"
    });
    return {
      stop() {},
      snapshot() {
        return { rules: clone(rules) };
      }
    };
  }

  let stopped = false;
  let controller = null;
  let reconnectMs = 1000;

  async function connect() {
    if (stopped) return;
    controller = new AbortController();
    await refreshRules();
    hub.setSourceStatus("x", {
      state: "connecting",
      detail: xStatusDetail("opening filtered stream", rules)
    });

    const url = new URL(X_STREAM_URL);
    url.searchParams.set("tweet.fields", "author_id,created_at,public_metrics");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "name,username,verified,profile_image_url");

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${bearerToken}`
        }
      });

      if (!response.ok || !response.body) {
        throw new Error(`X stream returned HTTP ${response.status}`);
      }

      reconnectMs = 1000;
      hub.setSourceStatus("x", {
        state: "connected",
        detail: xStatusDetail("filtered stream online", rules)
      });

      await readJsonLines(response.body, (payload) => {
        const message = normalizeXStreamEvent(payload);
        if (message) {
          rememberMatchingRules(payload.matching_rules);
          hub.addMessage(message);
        }
      });
    } catch (error) {
      if (stopped || error.name === "AbortError") return;
      hub.setSourceStatus("x", {
        state: "error",
        detail: error.message
      });
    }

    if (!stopped) {
      hub.setSourceStatus("x", {
        state: "reconnecting",
        detail: `retrying in ${Math.round(reconnectMs / 1000)}s`
      });
      setTimeout(connect, reconnectMs);
      reconnectMs = Math.min(reconnectMs * 1.8, 45000);
    }
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (controller) controller.abort();
      hub.setSourceStatus("x", {
        state: "stopped",
        detail: "connector stopped"
      });
    },
    snapshot() {
      return { rules: clone(rules) };
    }
  };

  async function refreshRules() {
    try {
      const response = await fetch(X_RULES_URL, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${bearerToken}`
        }
      });

      if (!response.ok) {
        rules = {
          ...rules,
          status: "error",
          error: `X rules returned HTTP ${response.status}`,
          checkedAt: new Date().toISOString()
        };
        return;
      }

      rules = summarizeXRules(await response.json());
    } catch (error) {
      if (stopped || error.name === "AbortError") return;
      rules = {
        ...rules,
        status: "error",
        error: error.message,
        checkedAt: new Date().toISOString()
      };
    }
  }

  function rememberMatchingRules(matchingRules = []) {
    if (!Array.isArray(matchingRules) || matchingRules.length === 0) return;
    const previous = new Map((rules.rules || []).map((rule) => [rule.id || rule.tag, rule]));
    const visible = matchingRules.map((rule, index) => {
      const id = cleanRuleText(rule.id || "", 60);
      const tag = cleanRuleText(rule.tag || "", 80) || `rule-${index + 1}`;
      const previousRule = previous.get(id) || previous.get(tag) || {};
      return {
        id,
        tag,
        value: previousRule.value || ""
      };
    });

    rules = {
      ...rules,
      status: rules.status === "unknown" ? "observed" : rules.status,
      count: Math.max(rules.count || 0, visible.length),
      rules: mergeRules(rules.rules || [], visible)
    };
  }
}

export function resolveXRulesFromEnv(env = process.env) {
  const raw = String(env.X_STREAM_RULES || env.X_RULES || "").trim();
  if (!raw) {
    return {
      status: "unknown",
      count: 0,
      checkedAt: null,
      rules: []
    };
  }

  const parsed = parseRuleSnapshot(raw);
  const rules = sanitizeRuleRows(parsed);
  return {
    status: "configured",
    count: rules.length,
    checkedAt: null,
    rules
  };
}

export function summarizeXRules(payload = {}, { checkedAt = new Date().toISOString() } = {}) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const rules = sanitizeRuleRows(rows);
  return {
    status: "fetched",
    count: rules.length,
    checkedAt,
    rules
  };
}

async function readJsonLines(stream, onPayload) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onPayload(JSON.parse(trimmed));
    }
  }
}

function parseRuleSnapshot(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.data)) return parsed.data;
  } catch {
    /* parse as tag:value list below */
  }

  return raw
    .split(/[;\n]+/)
    .map((entry, index) => {
      const trimmed = entry.trim();
      if (!trimmed) return null;
      const separator = trimmed.includes(":") ? ":" : trimmed.includes("=") ? "=" : "";
      if (!separator) return { tag: `rule-${index + 1}`, value: trimmed };
      const at = trimmed.indexOf(separator);
      return {
        tag: trimmed.slice(0, at),
        value: trimmed.slice(at + 1)
      };
    })
    .filter(Boolean);
}

function sanitizeRuleRows(rows) {
  return rows.slice(0, 12).map((rule, index) => ({
    id: cleanRuleText(rule.id || "", 60),
    tag: cleanRuleText(rule.tag || "", 80) || `rule-${index + 1}`,
    value: cleanRuleText(rule.value || "", 180)
  }));
}

function cleanRuleText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function mergeRules(current, observed) {
  const byKey = new Map(current.map((rule) => [rule.id || rule.tag, rule]));
  observed.forEach((rule) => {
    const key = rule.id || rule.tag;
    byKey.set(key, { ...byKey.get(key), ...rule });
  });
  return [...byKey.values()].slice(0, 12);
}

function xStatusDetail(base, ruleSnapshot) {
  const tags = (ruleSnapshot.rules || [])
    .map((rule) => rule.tag)
    .filter(Boolean)
    .slice(0, 3);
  if (tags.length) return `${base} · ${ruleSnapshot.count || tags.length} rules: ${tags.join(", ")}`;
  if (ruleSnapshot.status === "error") return `${base} · rules unavailable`;
  return base;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
