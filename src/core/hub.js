import { SOURCE_META } from "./messages.js";

export function createFeedHub(options = {}) {
  const maxMessages = options.maxMessages || 250;
  const messages = [];
  const messageIds = new Set();
  const subscribers = new Set();
  const stats = {
    totalMessages: 0,
    duplicatesDropped: 0,
    startedAt: new Date().toISOString(),
    sources: Object.fromEntries(
      Object.keys(SOURCE_META)
        .filter((source) => source !== "demo")
        .map((source) => [
          source,
          {
            count: 0,
            lastMessageAt: null
          }
        ])
    )
  };
  const status = Object.fromEntries(
    Object.keys(SOURCE_META)
      .filter((source) => source !== "demo")
      .map((source) => [
        source,
        {
          state: "idle",
          detail: "not started",
          updatedAt: new Date().toISOString()
        }
      ])
  );

  function addMessage(message) {
    if (!message?.id) return false;
    if (messageIds.has(message.id)) {
      stats.duplicatesDropped += 1;
      broadcast({ type: "stats", stats: clone(stats) });
      return false;
    }

    messageIds.add(message.id);
    messages.unshift(message);
    if (messages.length > maxMessages) {
      const removed = messages.pop();
      messageIds.delete(removed.id);
    }

    stats.totalMessages += 1;
    if (stats.sources[message.source]) {
      stats.sources[message.source].count += 1;
      stats.sources[message.source].lastMessageAt = message.receivedAt;
    }

    broadcast({ type: "message", message, stats: clone(stats) });
    return true;
  }

  function setSourceStatus(source, nextStatus) {
    if (!status[source]) return;
    status[source] = {
      ...status[source],
      ...nextStatus,
      updatedAt: new Date().toISOString()
    };
    broadcast({ type: "status", status: clone(status) });
  }

  function snapshot() {
    return {
      messages: clone(messages),
      stats: clone(stats),
      status: clone(status),
      sources: SOURCE_META
    };
  }

  function subscribe(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  function broadcast(event) {
    for (const listener of subscribers) {
      listener(event);
    }
  }

  return {
    addMessage,
    setSourceStatus,
    snapshot,
    subscribe,
    publish: broadcast
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
