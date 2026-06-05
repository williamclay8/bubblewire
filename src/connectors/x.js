import { normalizeXStreamEvent } from "../core/messages.js";

const X_STREAM_URL = "https://api.x.com/2/tweets/search/stream";
const X_RULES_URL = `${X_STREAM_URL}/rules`;

export function startXConnector(hub, env = process.env) {
  const bearerToken = env.X_BEARER_TOKEN;
  let rules = resolveXRulesFromEnv(env);
  let diagnostics = null;

  if (!bearerToken) {
    hub.setSourceStatus("x", {
      state: "missing",
      detail: "missing X_BEARER_TOKEN for filtered stream",
      diagnostics: null
    });
    return {
      stop() {},
      snapshot() {
        return { rules: clone(rules), diagnostics: clone(diagnostics) };
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
      detail: xStatusDetail("opening filtered stream", rules),
      diagnostics: null
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
        throw new XStreamDiagnosticError(
          await summarizeXStreamFailure(response, {
            bearerToken,
            phase: "stream"
          })
        );
      }

      reconnectMs = 1000;
      diagnostics = null;
      hub.setSourceStatus("x", {
        state: "connected",
        detail: xStatusDetail("filtered stream online", rules),
        diagnostics: null
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
      diagnostics = error.diagnostics || summarizeXRuntimeFailure(error, { bearerToken, phase: "stream" });
      console.warn("[bubblewire:x]", JSON.stringify(diagnostics));
      hub.setSourceStatus("x", {
        state: "error",
        detail: diagnostics.summary,
        diagnostics: clone(diagnostics)
      });
    }

    if (!stopped) {
      const last = diagnostics?.summary ? ` · last ${diagnostics.summary}` : "";
      hub.setSourceStatus("x", {
        state: "reconnecting",
        detail: `retrying in ${Math.round(reconnectMs / 1000)}s${last}`,
        diagnostics: diagnostics ? clone(diagnostics) : null
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
      return { rules: clone(rules), diagnostics: clone(diagnostics) };
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

export async function summarizeXStreamFailure(response, options = {}) {
  const phase = cleanDiagnosticText(options.phase || "stream", { maxLength: 32 }) || "stream";
  const rawBody = await safeResponseText(response);
  const parsed = parseDiagnosticBody(rawBody);
  const secrets = [options.bearerToken, ...(options.secrets || [])].filter(Boolean);
  const bodySnippet = cleanDiagnosticText(rawBody, { secrets, maxLength: 420 });
  const problemTitle = firstDiagnosticText(parsed?.title, parsed?.errors?.[0]?.title, parsed?.errors?.[0]?.code);
  const problemType = firstDiagnosticText(parsed?.type, parsed?.errors?.[0]?.type);
  const problemDetail = firstDiagnosticText(
    parsed?.detail,
    parsed?.errors?.[0]?.detail,
    parsed?.errors?.[0]?.message,
    parsed?.errors?.map?.((error) => error.message || error.detail || error.title).filter(Boolean).join("; ")
  );
  const diagnostic = pruneDiagnostic({
    phase,
    httpStatus: response?.status || 0,
    statusText: cleanDiagnosticText(response?.statusText || "", { secrets, maxLength: 80 }),
    problemTitle: cleanDiagnosticText(problemTitle, { secrets, maxLength: 120 }),
    problemType: cleanDiagnosticText(problemType, { secrets, maxLength: 180 }),
    problemDetail: cleanDiagnosticText(problemDetail, { secrets, maxLength: 260 }),
    bodySnippet,
    rateLimit: {
      limit: headerValue(response, "x-rate-limit-limit"),
      remaining: headerValue(response, "x-rate-limit-remaining"),
      reset: headerValue(response, "x-rate-limit-reset")
    }
  });

  diagnostic.summary = buildXDiagnosticSummary(diagnostic);
  return diagnostic;
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

class XStreamDiagnosticError extends Error {
  constructor(diagnostics) {
    super(diagnostics.summary);
    this.name = "XStreamDiagnosticError";
    this.diagnostics = diagnostics;
  }
}

function summarizeXRuntimeFailure(error, options = {}) {
  const secrets = [options.bearerToken, ...(options.secrets || [])].filter(Boolean);
  const diagnostic = pruneDiagnostic({
    phase: cleanDiagnosticText(options.phase || "stream", { maxLength: 32 }) || "stream",
    errorName: cleanDiagnosticText(error?.name || "Error", { secrets, maxLength: 80 }),
    problemDetail: cleanDiagnosticText(error?.message || "stream failed", { secrets, maxLength: 260 })
  });
  diagnostic.summary = buildXDiagnosticSummary(diagnostic);
  return diagnostic;
}

async function safeResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function parseDiagnosticBody(rawBody) {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function firstDiagnosticText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || "";
}

function cleanDiagnosticText(value, options = {}) {
  const secrets = options.secrets || [];
  const maxLength = options.maxLength || 260;
  let text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  for (const secret of secrets) {
    const token = String(secret || "").trim();
    if (token.length >= 4) {
      text = text.split(token).join("[redacted]");
    }
  }

  text = text
    .replace(/Authorization:\s*Bearer\s+\S+/gi, "Authorization: [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(access_token|bearer_token|oauth_token)=([^&\s]+)/gi, "$1=[redacted]");

  return text.slice(0, maxLength);
}

function headerValue(response, name) {
  const value = response?.headers?.get?.(name);
  return value ? cleanDiagnosticText(value, { maxLength: 80 }) : "";
}

function pruneDiagnostic(diagnostic) {
  const next = {};
  for (const [key, value] of Object.entries(diagnostic)) {
    if (key === "rateLimit") {
      const rateLimit = Object.fromEntries(
        Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")
      );
      if (Object.keys(rateLimit).length) next[key] = rateLimit;
    } else if (value !== undefined && value !== null && value !== "") {
      next[key] = value;
    }
  }
  return next;
}

function buildXDiagnosticSummary(diagnostic) {
  const phase = diagnostic.phase || "stream";
  const first = diagnostic.httpStatus
    ? `X ${phase} HTTP ${diagnostic.httpStatus}${diagnostic.statusText ? ` ${diagnostic.statusText}` : ""}`
    : `X ${phase} ${diagnostic.errorName || "error"}`;
  const parts = [first];
  if (diagnostic.problemTitle) parts.push(diagnostic.problemTitle);
  else if (diagnostic.problemDetail) parts.push(diagnostic.problemDetail);
  if (diagnostic.rateLimit?.remaining === "0") parts.push("rate-limit remaining 0");
  return parts.join(" · ");
}

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}
