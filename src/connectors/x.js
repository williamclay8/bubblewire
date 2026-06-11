import { normalizeXStreamEvent, X_LIVE_RULE_TAG_PREFIX } from "../core/messages.js";

const X_STREAM_URL = "https://api.x.com/2/tweets/search/stream";
const X_RULES_URL = `${X_STREAM_URL}/rules`;
const X_CONNECTIONS_URL = "https://api.x.com/2/connections";
const DEFAULT_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 45000;
const DEFAULT_X_TOO_MANY_CONNECTIONS_BACKOFF_MS = 5 * 60 * 1000;
const DEFAULT_X_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
const DEFAULT_X_USAGE_CAP_BACKOFF_MS = 30 * 60 * 1000;
const DEFAULT_X_AUTO_TERMINATE_RECONNECT_MS = 2000;

export function startXConnector(hub, env = process.env, options = {}) {
  const bearerToken = env.X_BEARER_TOKEN;
  let rules = resolveXRulesFromEnv(env);
  let diagnostics = null;
  const stream = resolveXStreamPolicy(env);
  let xliveBroadcastId = extractXLiveBroadcastTarget(env.X_LIVE_BROADCAST_ID || "");
  let lastXState = "idle";
  const timers = {
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout
  };

  function setStatuses(state, payload) {
    lastXState = state;
    hub.setSourceStatus("x", { state, ...payload });
    hub.setSourceStatus("xlive", xliveStatusForStreamState(state, xliveBroadcastId, payload));
  }

  function setXLiveBroadcast(id) {
    xliveBroadcastId = extractXLiveBroadcastTarget(id || "") || "";
    hub.setSourceStatus("xlive", xliveStatusForStreamState(lastXState, xliveBroadcastId));
    return xliveBroadcastId;
  }

  if (!stream.enabled) {
    setStatuses("disabled", {
      detail: stream.detail,
      diagnostics: null,
      stream
    });
    return {
      stop() {},
      setXLiveBroadcast,
      snapshot() {
        return {
          rules: clone(rules),
          diagnostics: clone(diagnostics),
          stream: clone(stream),
          xlive: { broadcastId: xliveBroadcastId || null }
        };
      }
    };
  }

  if (!bearerToken) {
    setStatuses("missing", {
      detail: "missing X_BEARER_TOKEN for filtered stream",
      diagnostics: null,
      stream
    });
    return {
      stop() {},
      setXLiveBroadcast,
      snapshot() {
        return {
          rules: clone(rules),
          diagnostics: clone(diagnostics),
          stream: clone(stream),
          xlive: { broadcastId: xliveBroadcastId || null }
        };
      }
    };
  }

  let stopped = false;
  let controller = null;
  let reconnectMs = DEFAULT_RECONNECT_MS;
  let reconnectTimer = null;
  let nextReconnectOverrideMs = 0;

  async function connect() {
    if (stopped) return;
    controller = new AbortController();
    await refreshRules();
    setStatuses("connecting", {
      detail: xStatusDetail("opening filtered stream", rules),
      diagnostics: null,
      stream
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

      reconnectMs = DEFAULT_RECONNECT_MS;
      diagnostics = null;
      setStatuses("connected", {
        detail: xStatusDetail("filtered stream online", rules),
        diagnostics: null,
        stream
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
      const cleanup = await maybeAutoTerminateXConnections(diagnostics, env);
      if (cleanup) {
        diagnostics = {
          ...diagnostics,
          connectionCleanup: cleanup
        };
        if (cleanup.terminated?.successfulKills > 0) {
          reconnectMs = DEFAULT_RECONNECT_MS;
          nextReconnectOverrideMs = positiveInteger(
            env.X_AUTO_TERMINATE_RECONNECT_MS,
            DEFAULT_X_AUTO_TERMINATE_RECONNECT_MS
          );
        }
      }
      console.warn("[bubblewire:x]", JSON.stringify(diagnostics));
      if (!isXUsageCapDiagnostic(diagnostics)) {
        setStatuses("error", {
          detail: diagnostics.summary,
          diagnostics: clone(diagnostics)
        });
      }
    }

    if (!stopped) {
      const delayMs = nextReconnectOverrideMs || reconnectDelayForDiagnostics(diagnostics, reconnectMs, env);
      nextReconnectOverrideMs = 0;
      const last = diagnostics?.summary ? ` · last ${diagnostics.summary}` : "";
      const blockedByUsageCap = isXUsageCapDiagnostic(diagnostics);
      setStatuses(blockedByUsageCap ? "blocked" : "reconnecting", {
        detail: blockedByUsageCap
          ? `X API credits depleted; retrying in ${formatReconnectDelay(delayMs)}${last}`
          : `retrying in ${formatReconnectDelay(delayMs)}${last}`,
        diagnostics: diagnostics ? clone(diagnostics) : null,
        stream
      });
      reconnectTimer = timers.setTimeout(connect, delayMs);
      reconnectMs = Math.min(reconnectMs * 1.8, MAX_RECONNECT_MS);
    }
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (controller) controller.abort();
      if (reconnectTimer) timers.clearTimeout(reconnectTimer);
      setStatuses("stopped", {
        detail: "connector stopped",
        stream
      });
    },
    setXLiveBroadcast,
    snapshot() {
      return {
        rules: clone(rules),
        diagnostics: clone(diagnostics),
        stream: clone(stream),
        xlive: { broadcastId: xliveBroadcastId || null }
      };
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

export function resolveXStreamPolicy(env = process.env) {
  const raw = String(env.X_STREAM_ENABLED || "").trim().toLowerCase();
  const explicit = raw !== "";
  const enabled = explicit ? isEnabledValue(raw) : isRenderProduction(env);
  const source = explicit ? "X_STREAM_ENABLED" : enabled ? "render-default" : "local-default";
  const detail = enabled
    ? "X filtered stream enabled"
    : explicit
      ? "X filtered stream disabled by X_STREAM_ENABLED"
      : "X filtered stream disabled by default outside Render production; set X_STREAM_ENABLED=on to stream";

  return {
    enabled,
    source,
    detail,
    paused: false
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

// --- X Live (live-broadcast comment) support -------------------------------
// X live video comments are replies to the broadcast post, so ingestion is a
// filtered-stream rule `conversation_id:<postId>` tagged `xlive:<postId>` on
// the SAME single stream connection (X allows one per app).

export function extractXPostId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^\d{5,25}$/.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^mobile\./, "");
  if (!["x.com", "twitter.com"].includes(host)) return "";

  const match = url.pathname.match(/\/(?:status|statuses)\/(\d{5,25})(?:\/|$)/);
  return match ? match[1] : "";
}

export function extractXLiveBroadcastTarget(input) {
  return extractXPostId(input) || extractXBroadcastId(input);
}

export function extractXBroadcastId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (isXBroadcastId(raw)) return raw;

  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^mobile\./, "");
  if (!["x.com", "twitter.com"].includes(host)) return "";

  const match = url.pathname.match(/^\/i\/broadcasts\/([A-Za-z0-9_-]{10,64})(?:\/|$)/);
  return match && isXBroadcastId(match[1]) ? match[1] : "";
}

export function isXLiveRuleTag(tag) {
  return String(tag || "").startsWith(X_LIVE_RULE_TAG_PREFIX);
}

export function xliveRuleForBroadcast(broadcastId) {
  const target = cleanXLiveTargetId(broadcastId);
  return {
    value: /^\d{5,25}$/.test(target) ? `conversation_id:${target}` : `url_contains:${target}`,
    tag: `${X_LIVE_RULE_TAG_PREFIX}${target}`
  };
}

export function xliveStatusForStreamState(state, broadcastId, extra = {}) {
  if (!broadcastId) {
    return {
      state: "idle",
      detail: "no live broadcast set",
      broadcastId: null,
      diagnostics: null
    };
  }

  const base = {
    broadcastId,
    ruleTag: `${X_LIVE_RULE_TAG_PREFIX}${broadcastId}`,
    diagnostics: extra.diagnostics || null
  };
  switch (state) {
    case "connected":
      return { ...base, state: "live", detail: `broadcast ${broadcastId} replies riding shared X stream` };
    case "connecting":
      return { ...base, state: "connecting", detail: `waiting for shared X stream · broadcast ${broadcastId}` };
    case "missing":
      return { ...base, state: "missing", detail: "missing X_BEARER_TOKEN for filtered stream" };
    case "disabled":
      return { ...base, state: "disabled", detail: `X stream disabled · broadcast ${broadcastId} queued` };
    case "paused":
      return { ...base, state: "paused", detail: `shared X stream paused · broadcast ${broadcastId} queued` };
    case "blocked":
      return { ...base, state: "blocked", detail: extra.detail || `shared X stream blocked · broadcast ${broadcastId}` };
    case "stopped":
      return { ...base, state: "stopped", detail: "connector stopped" };
    case "error":
    case "reconnecting":
      return { ...base, state, detail: extra.detail || `shared X stream ${state}` };
    default:
      return { ...base, state: "connecting", detail: `broadcast ${broadcastId} configured` };
  }
}

async function fetchXLiveRuleIds(bearerToken, fetchImpl) {
  const response = await fetchImpl(X_RULES_URL, {
    headers: { Authorization: `Bearer ${bearerToken}` }
  });
  const body = parseDiagnosticBody(await safeResponseText(response));
  if (!response.ok) {
    return { ok: false, httpStatus: response.status, ids: [], snapshot: null };
  }
  const rows = Array.isArray(body?.data) ? body.data : [];
  return {
    ok: true,
    httpStatus: response.status,
    ids: rows.filter((rule) => isXLiveRuleTag(rule.tag)).map((rule) => rule.id).filter(Boolean),
    snapshot: summarizeXRules(body)
  };
}

async function mutateXRules(bearerToken, fetchImpl, body) {
  const response = await fetchImpl(X_RULES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const parsed = parseDiagnosticBody(await safeResponseText(response));
  return { ok: response.ok, httpStatus: response.status, body: parsed };
}

export async function setXLiveBroadcastRule(env = process.env, broadcastId, options = {}) {
  const bearerToken = env.X_BEARER_TOKEN;
  const id = extractXLiveBroadcastTarget(broadcastId);
  if (!id) {
    return { ok: false, broadcastId: null, summary: "invalid X live broadcast URL or post id" };
  }
  const rule = xliveRuleForBroadcast(id);
  if (!bearerToken) {
    return {
      ok: false,
      broadcastId: id,
      rule,
      summary: "missing X_BEARER_TOKEN · rule not pushed to X"
    };
  }

  const fetchImpl = options.fetch || fetch;
  try {
    const existing = await fetchXLiveRuleIds(bearerToken, fetchImpl);
    const staleIds = existing.ids.filter(Boolean);
    if (staleIds.length > 0) {
      await mutateXRules(bearerToken, fetchImpl, { delete: { ids: staleIds } });
    }
    const added = await mutateXRules(bearerToken, fetchImpl, { add: [rule] });
    const refreshed = await fetchXLiveRuleIds(bearerToken, fetchImpl);
    return {
      ok: added.ok,
      broadcastId: id,
      rule,
      deletedStale: staleIds.length,
      httpStatus: added.httpStatus,
      rules: refreshed.snapshot,
      summary: added.ok
        ? `xlive rule active · ${rule.value}`
        : `X rules HTTP ${added.httpStatus}`,
      errors: sanitizeXErrors(added.body?.errors || [], [bearerToken])
    };
  } catch (error) {
    return {
      ok: false,
      broadcastId: id,
      rule,
      summary: cleanDiagnosticText(error?.message || "X rules request failed", {
        secrets: [bearerToken],
        maxLength: 200
      })
    };
  }
}

export async function clearXLiveBroadcastRules(env = process.env, options = {}) {
  const bearerToken = env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return { ok: false, deleted: 0, summary: "missing X_BEARER_TOKEN · no rules to clear on X" };
  }

  const fetchImpl = options.fetch || fetch;
  try {
    const existing = await fetchXLiveRuleIds(bearerToken, fetchImpl);
    if (!existing.ok) {
      return { ok: false, deleted: 0, summary: `X rules HTTP ${existing.httpStatus}` };
    }
    if (existing.ids.length === 0) {
      return { ok: true, deleted: 0, rules: existing.snapshot, summary: "no xlive rules present" };
    }
    const removed = await mutateXRules(bearerToken, fetchImpl, { delete: { ids: existing.ids } });
    const refreshed = await fetchXLiveRuleIds(bearerToken, fetchImpl);
    return {
      ok: removed.ok,
      deleted: removed.ok ? existing.ids.length : 0,
      httpStatus: removed.httpStatus,
      rules: refreshed.snapshot,
      summary: removed.ok ? `cleared ${existing.ids.length} xlive rule(s)` : `X rules HTTP ${removed.httpStatus}`
    };
  } catch (error) {
    return {
      ok: false,
      deleted: 0,
      summary: cleanDiagnosticText(error?.message || "X rules request failed", {
        secrets: [bearerToken],
        maxLength: 200
      })
    };
  }
}

export async function fetchXConnectionHistory(env = process.env, options = {}) {
  const bearerToken = env.X_BEARER_TOKEN;
  if (!bearerToken) return missingXBearerConnectionResult("connections");

  const fetchImpl = options.fetch || fetch;
  const url = new URL(X_CONNECTIONS_URL);
  url.searchParams.set("status", options.status || "active");
  url.searchParams.set("endpoints", options.endpoints || "filtered_stream");
  url.searchParams.set("connection.fields", "id,endpoint_name,connected_at,client_ip,disconnect_reason,disconnected_at");

  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    });
    return summarizeXConnectionResponse(response, await safeResponseText(response), {
      bearerToken,
      phase: "connections"
    });
  } catch (error) {
    return summarizeXConnectionRuntimeFailure(error, { bearerToken, phase: "connections" });
  }
}

export async function terminateAllXConnections(env = process.env, options = {}) {
  const bearerToken = env.X_BEARER_TOKEN;
  if (!bearerToken) return missingXBearerConnectionResult("terminate-connections");

  const fetchImpl = options.fetch || fetch;
  try {
    const response = await fetchImpl(`${X_CONNECTIONS_URL}/all`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    });
    return summarizeXConnectionResponse(response, await safeResponseText(response), {
      bearerToken,
      phase: "terminate-connections"
    });
  } catch (error) {
    return summarizeXConnectionRuntimeFailure(error, { bearerToken, phase: "terminate-connections" });
  }
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
    connectionIssue: cleanDiagnosticText(parsed?.connection_issue || parsed?.errors?.[0]?.connection_issue || "", {
      secrets,
      maxLength: 120
    }),
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

function summarizeXConnectionResponse(response, rawBody, options = {}) {
  const phase = cleanDiagnosticText(options.phase || "connections", { maxLength: 48 }) || "connections";
  const secrets = [options.bearerToken, ...(options.secrets || [])].filter(Boolean);
  const parsed = parseDiagnosticBody(rawBody);
  const result = pruneDiagnostic({
    ok: Boolean(response?.ok),
    phase,
    httpStatus: response?.status || 0,
    statusText: cleanDiagnosticText(response?.statusText || "", { secrets, maxLength: 80 }),
    checkedAt: new Date().toISOString(),
    count: Number(parsed?.meta?.result_count || 0),
    connections: sanitizeXConnections(parsed?.data || []),
    termination: sanitizeXTermination(parsed?.data),
    errors: sanitizeXErrors(parsed?.errors || [], secrets),
    bodySnippet: response?.ok ? "" : cleanDiagnosticText(rawBody, { secrets, maxLength: 420 })
  });
  result.summary = buildXConnectionSummary(result);
  return result;
}

function summarizeXConnectionRuntimeFailure(error, options = {}) {
  const secrets = [options.bearerToken, ...(options.secrets || [])].filter(Boolean);
  const result = pruneDiagnostic({
    ok: false,
    phase: cleanDiagnosticText(options.phase || "connections", { secrets, maxLength: 48 }) || "connections",
    checkedAt: new Date().toISOString(),
    errorName: cleanDiagnosticText(error?.name || "Error", { secrets, maxLength: 80 }),
    problemDetail: cleanDiagnosticText(error?.message || "X connection management failed", { secrets, maxLength: 260 })
  });
  result.summary = buildXConnectionSummary(result);
  return result;
}

async function maybeAutoTerminateXConnections(diagnostic, env = process.env) {
  if (!isXTooManyConnectionsDiagnostic(diagnostic) || !shouldAutoTerminateXConnections(env)) {
    return null;
  }

  const before = await fetchXConnectionHistory(env);
  const shouldTerminate = before.ok && before.count > 0;
  const terminated = shouldTerminate ? await terminateAllXConnections(env) : null;
  const after = terminated?.ok ? await fetchXConnectionHistory(env) : null;

  return pruneDiagnostic({
    enabled: true,
    before: compactXConnectionManagementResult(before),
    terminated: compactXConnectionManagementResult(terminated),
    after: compactXConnectionManagementResult(after)
  });
}

export function shouldAutoTerminateXConnections(env = process.env) {
  const raw = String(env.X_AUTO_TERMINATE_CONNECTIONS || "").trim();
  if (raw) return isEnabledValue(raw);
  return isRenderProduction(env);
}

function compactXConnectionManagementResult(result) {
  if (!result) return null;
  return pruneDiagnostic({
    ok: Boolean(result.ok),
    httpStatus: result.httpStatus,
    checkedAt: result.checkedAt,
    count: result.count,
    summary: result.summary,
    successfulKills: result.termination?.successfulKills,
    failedKills: result.termination?.failedKills
  });
}

function missingXBearerConnectionResult(phase) {
  return {
    ok: false,
    phase,
    checkedAt: new Date().toISOString(),
    count: 0,
    connections: [],
    summary: "missing X_BEARER_TOKEN"
  };
}

function sanitizeXConnections(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 25).map((connection) => ({
    id: cleanDiagnosticText(connection.id || "", { maxLength: 80 }),
    endpoint: cleanDiagnosticText(connection.endpoint_name || "", { maxLength: 80 }),
    connectedAt: cleanDiagnosticText(connection.connected_at || "", { maxLength: 80 }),
    disconnectedAt: cleanDiagnosticText(connection.disconnected_at || "", { maxLength: 80 }),
    disconnectReason: cleanDiagnosticText(connection.disconnect_reason || "", { maxLength: 120 }),
    clientIp: cleanDiagnosticText(connection.client_ip || "", { maxLength: 80 })
  }));
}

function sanitizeXTermination(data) {
  if (!data || Array.isArray(data)) return null;
  return pruneDiagnostic({
    successfulKills: numberOrNull(data.successful_kills),
    failedKills: numberOrNull(data.failed_kills),
    results: Array.isArray(data.results)
      ? data.results.slice(0, 25).map((result) => ({
          uuid: cleanDiagnosticText(result.uuid || "", { maxLength: 80 }),
          success: Boolean(result.success),
          errorMessage: cleanDiagnosticText(result.error_message || "", { maxLength: 180 })
        }))
      : []
  });
}

function sanitizeXErrors(errors, secrets) {
  return (Array.isArray(errors) ? errors : []).slice(0, 10).map((error) =>
    pruneDiagnostic({
      title: cleanDiagnosticText(error.title || "", { secrets, maxLength: 120 }),
      type: cleanDiagnosticText(error.type || "", { secrets, maxLength: 180 }),
      detail: cleanDiagnosticText(error.detail || "", { secrets, maxLength: 260 }),
      status: numberOrNull(error.status)
    })
  );
}

function buildXConnectionSummary(result) {
  const phase = result.phase || "connections";
  if (result.httpStatus) {
    const parts = [`X ${phase} HTTP ${result.httpStatus}${result.statusText ? ` ${result.statusText}` : ""}`];
    if (result.termination) {
      parts.push(`${result.termination.successfulKills || 0} killed`);
      if (result.termination.failedKills) parts.push(`${result.termination.failedKills} failed`);
    } else if (Number.isFinite(result.count)) {
      parts.push(`${result.count} active`);
    }
    return parts.join(" · ");
  }
  if (result.errorName) return `X ${phase} ${result.errorName}`;
  return result.summary || `X ${phase}`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function reconnectDelayForDiagnostics(diagnostic, currentMs, env = process.env) {
  if (isXTooManyConnectionsDiagnostic(diagnostic)) {
    return positiveInteger(env.X_TOO_MANY_CONNECTIONS_BACKOFF_MS, DEFAULT_X_TOO_MANY_CONNECTIONS_BACKOFF_MS);
  }
  if (isXUsageCapDiagnostic(diagnostic)) {
    return positiveInteger(env.X_USAGE_CAP_BACKOFF_MS, DEFAULT_X_USAGE_CAP_BACKOFF_MS);
  }
  if (isXRateLimitDiagnostic(diagnostic)) {
    return positiveInteger(env.X_RATE_LIMIT_BACKOFF_MS, DEFAULT_X_RATE_LIMIT_BACKOFF_MS);
  }
  return currentMs;
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

function cleanXLiveTargetId(value) {
  return extractXLiveBroadcastTarget(value) ||
    String(value || "")
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 64);
}

function isXBroadcastId(value) {
  return /^(?=.{10,64}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]+$/.test(String(value || "").trim());
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
  if (diagnostic.connectionIssue && diagnostic.connectionIssue !== diagnostic.problemTitle) {
    parts.push(diagnostic.connectionIssue);
  }
  if (!diagnostic.problemTitle && !diagnostic.connectionIssue && diagnostic.problemDetail) {
    parts.push(diagnostic.problemDetail);
  }
  if (diagnostic.rateLimit?.remaining === "0") parts.push("rate-limit remaining 0");
  return parts.join(" · ");
}

function isEnabledValue(value) {
  return ["1", "true", "yes", "on", "live", "prod", "production", "enabled"].includes(String(value || "").trim().toLowerCase());
}

function isRenderProduction(env) {
  return env.RENDER === "true" || Boolean(env.RENDER_SERVICE_ID || env.RENDER_EXTERNAL_URL);
}

function isXTooManyConnectionsDiagnostic(diagnostic) {
  const text = [
    diagnostic?.problemTitle,
    diagnostic?.problemDetail,
    diagnostic?.connectionIssue,
    diagnostic?.bodySnippet,
    diagnostic?.summary
  ]
    .filter(Boolean)
    .join(" ");
  return /TooManyConnections|maximum allowed connection limit|ConnectionException/i.test(text);
}

function isXRateLimitDiagnostic(diagnostic) {
  return Number(diagnostic?.httpStatus) === 429 && diagnostic?.rateLimit?.remaining === "0";
}

function isXUsageCapDiagnostic(diagnostic) {
  const text = [
    diagnostic?.problemTitle,
    diagnostic?.problemType,
    diagnostic?.problemDetail,
    diagnostic?.bodySnippet,
    diagnostic?.summary
  ]
    .filter(Boolean)
    .join(" ");
  return (
    /CreditsDepleted|credits? depleted|does not have any credits|usage[-_\s]?capped|usage cap exceeded/i.test(text) ||
    (Number(diagnostic?.httpStatus) === 402 && /credits?|usage|payment required/i.test(text))
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function formatReconnectDelay(ms) {
  if (ms >= 60000) {
    const minutes = Math.round(ms / 60000);
    return `${minutes}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}
