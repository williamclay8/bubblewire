import test from "node:test";
import assert from "node:assert/strict";

import {
  extractYouTubeChannelHandle,
  extractYouTubeVideoId,
  resolveYouTubeConfig,
  startYouTubeConnector
} from "../src/connectors/youtube.js";

test("extractYouTubeVideoId accepts watch, short, live, embed URLs and bare IDs", () => {
  assert.equal(extractYouTubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=44"), "dQw4w9WgXcQ");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ?si=abc"), "dQw4w9WgXcQ");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extractYouTubeVideoId rejects invalid input and handle live pages", () => {
  assert.equal(extractYouTubeVideoId(""), "");
  assert.equal(extractYouTubeVideoId(null), "");
  assert.equal(extractYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), "");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/@threadguy/live"), "");
  assert.equal(extractYouTubeVideoId("too-short"), "");
});

test("extractYouTubeChannelHandle accepts handles and handle live pages", () => {
  assert.equal(extractYouTubeChannelHandle("@notthreadguy"), "notthreadguy");
  assert.equal(extractYouTubeChannelHandle("notthreadguy"), "notthreadguy");
  assert.equal(extractYouTubeChannelHandle("https://www.youtube.com/@notthreadguy/live"), "notthreadguy");
  assert.equal(extractYouTubeChannelHandle("https://m.youtube.com/@notthreadguy/streams"), "notthreadguy");
  assert.equal(extractYouTubeChannelHandle("https://example.com/@notthreadguy/live"), "");
  assert.equal(extractYouTubeChannelHandle("no"), "");
});

test("resolveYouTubeConfig accepts API key with direct chat id or resolvable video target", () => {
  const direct = resolveYouTubeConfig({
    YOUTUBE_API_KEY: "yt-secret",
    YOUTUBE_LIVE_CHAT_ID: "Cg0KC2xpdmVfY2hhdA",
    YOUTUBE_POLL_INTERVAL_MS: "900",
    YOUTUBE_MAX_RESULTS: "5000"
  });

  assert.equal(direct.apiKey, "yt-secret");
  assert.equal(direct.liveChatId, "Cg0KC2xpdmVfY2hhdA");
  assert.equal(direct.videoId, "");
  assert.equal(direct.pollIntervalMs, 2000);
  assert.equal(direct.maxResults, 2000);
  assert.equal(direct.error, "");

  const video = resolveYouTubeConfig({
    GOOGLE_API_KEY: "google-secret",
    YOUTUBE_URL: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    YOUTUBE_POLL_INTERVAL_MS: "12000",
    YOUTUBE_MAX_RESULTS: "250"
  });

  assert.equal(video.apiKey, "google-secret");
  assert.equal(video.liveChatId, "");
  assert.equal(video.videoId, "dQw4w9WgXcQ");
  assert.equal(video.channelHandle, "");
  assert.equal(video.pollIntervalMs, 12000);
  assert.equal(video.maxResults, 250);
  assert.equal(video.error, "");

  const handle = resolveYouTubeConfig({
    YOUTUBE_API_KEY: "yt-secret",
    YOUTUBE_CHANNEL_HANDLE: "@notthreadguy"
  });

  assert.equal(handle.channelHandle, "notthreadguy");
  assert.equal(handle.videoId, "");
  assert.equal(handle.error, "");
});

test("resolveYouTubeConfig reports the missing piece without exposing secrets", () => {
  assert.equal(resolveYouTubeConfig({ YOUTUBE_VIDEO_ID: "dQw4w9WgXcQ" }).error, "missing YOUTUBE_API_KEY");
  assert.equal(
    resolveYouTubeConfig({ YOUTUBE_API_KEY: "secret" }).error,
    "missing YOUTUBE_LIVE_CHAT_ID, YOUTUBE_VIDEO_ID, or YOUTUBE_CHANNEL_HANDLE"
  );
});

test("startYouTubeConnector reports missing config without fetching", () => {
  const statuses = [];
  const connector = startYouTubeConnector(
    {
      setSourceStatus(source, status) {
        statuses.push({ source, status });
      },
      addMessage() {}
    },
    {},
    {
      fetch: async () => {
        throw new Error("fetch should not run");
      }
    }
  );

  assert.equal(statuses[0].source, "youtube");
  assert.equal(statuses[0].status.state, "missing");
  assert.match(statuses[0].status.detail, /missing YOUTUBE_API_KEY/);
  connector.stop();
});

test("startYouTubeConnector resolves activeLiveChatId from a video and polls messages", async () => {
  const statuses = [];
  const messages = [];
  const requests = [];
  const queuedTimers = [];
  const connector = startYouTubeConnector(
    {
      setSourceStatus(source, status) {
        statuses.push({ source, status });
      },
      addMessage(message) {
        messages.push(message);
      }
    },
    {
      YOUTUBE_API_KEY: "secret-key",
      YOUTUBE_VIDEO_ID: "dQw4w9WgXcQ",
      YOUTUBE_POLL_INTERVAL_MS: "2500"
    },
    {
      fetch: async (url) => {
        const parsed = new URL(url);
        requests.push(parsed);
        if (parsed.pathname.endsWith("/videos")) {
          return new Response(JSON.stringify({
            items: [
              {
                id: "dQw4w9WgXcQ",
                snippet: { title: "Threadguy live", channelTitle: "Threadguy" },
                liveStreamingDetails: { activeLiveChatId: "live-chat-123" }
              }
            ]
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          nextPageToken: "next-token",
          pollingIntervalMillis: 2700,
          items: [
            {
              id: "yt-msg-1",
              snippet: {
                type: "textMessageEvent",
                liveChatId: "live-chat-123",
                publishedAt: "2026-06-10T19:08:00Z",
                displayMessage: "hello Bubblewire"
              },
              authorDetails: {
                channelId: "UCchat",
                displayName: "Chat Person"
              }
            }
          ]
        }), { status: 200 });
      },
      setTimeout: (fn, ms) => {
        queuedTimers.push({ fn, ms });
        return queuedTimers.length;
      },
      clearTimeout: () => {}
    }
  );

  await waitFor(() => messages.length === 1);

  assert.equal(messages[0].source, "youtube");
  assert.equal(messages[0].id, "youtube:yt-msg-1");
  assert.equal(messages[0].channel, "Threadguy");
  assert.equal(messages[0].url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(statuses.some((entry) => entry.source === "youtube" && entry.status.state === "connected"), true);
  assert.equal(connector.snapshot().liveChatId, "live-chat-123");
  assert.equal(connector.snapshot().nextPageToken, "next-token");
  assert.equal(requests.some((url) => url.pathname.endsWith("/videos")), true);
  assert.equal(requests.some((url) => url.pathname.endsWith("/liveChat/messages")), true);
  assert.equal(queuedTimers.at(-1).ms, 2700);
  assert.doesNotMatch(JSON.stringify(statuses), /secret-key/);

  connector.stop();
});

test("startYouTubeConnector resolves a handle to the active live video and polls messages", async () => {
  const messages = [];
  const requests = [];
  const connector = startYouTubeConnector(
    {
      setSourceStatus() {},
      addMessage(message) {
        messages.push(message);
      }
    },
    {
      YOUTUBE_API_KEY: "secret-key",
      YOUTUBE_CHANNEL_HANDLE: "@notthreadguy"
    },
    {
      fetch: async (url) => {
        const parsed = new URL(url);
        requests.push(parsed);
        if (parsed.pathname.endsWith("/channels")) {
          assert.equal(parsed.searchParams.get("forHandle"), "@notthreadguy");
          return new Response(JSON.stringify({
            items: [
              {
                id: "UCnotthreadguy",
                snippet: { title: "notthreadguy" }
              }
            ]
          }), { status: 200 });
        }
        if (parsed.pathname.endsWith("/search")) {
          assert.equal(parsed.searchParams.get("channelId"), "UCnotthreadguy");
          assert.equal(parsed.searchParams.get("eventType"), "live");
          assert.equal(parsed.searchParams.get("type"), "video");
          return new Response(JSON.stringify({
            items: [
              {
                id: { videoId: "AbCdEfGhIjK" },
                snippet: { channelTitle: "notthreadguy" }
              }
            ]
          }), { status: 200 });
        }
        if (parsed.pathname.endsWith("/videos")) {
          assert.equal(parsed.searchParams.get("id"), "AbCdEfGhIjK");
          return new Response(JSON.stringify({
            items: [
              {
                id: "AbCdEfGhIjK",
                snippet: { title: "Live now", channelTitle: "notthreadguy" },
                liveStreamingDetails: { activeLiveChatId: "live-chat-456" }
              }
            ]
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          nextPageToken: "next-token",
          pollingIntervalMillis: 5000,
          items: [
            {
              id: "yt-msg-2",
              snippet: {
                type: "textMessageEvent",
                liveChatId: "live-chat-456",
                publishedAt: "2026-06-10T19:10:00Z",
                displayMessage: "threadguy chat"
              },
              authorDetails: {
                channelId: "UCviewer",
                displayName: "Viewer"
              }
            }
          ]
        }), { status: 200 });
      },
      setTimeout: () => 1,
      clearTimeout: () => {}
    }
  );

  await waitFor(() => messages.length === 1);

  assert.equal(messages[0].source, "youtube");
  assert.equal(messages[0].channel, "notthreadguy");
  assert.equal(messages[0].url, "https://www.youtube.com/watch?v=AbCdEfGhIjK");
  assert.equal(connector.snapshot().channelHandle, "notthreadguy");
  assert.equal(connector.snapshot().channelId, "UCnotthreadguy");
  assert.equal(connector.snapshot().videoId, "AbCdEfGhIjK");
  assert.equal(connector.snapshot().liveChatId, "live-chat-456");
  assert.deepEqual(requests.map((url) => url.pathname.split("/").at(-1)), [
    "channels",
    "search",
    "videos",
    "messages"
  ]);

  connector.stop();
});

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("timed out waiting for predicate");
}
