import test from "node:test";
import assert from "node:assert/strict";

import { resolveTwitchIrcConfig } from "../src/connectors/twitch.js";

test("resolveTwitchIrcConfig uses anonymous read-only IRC when only channels are configured", () => {
  const config = resolveTwitchIrcConfig({ TWITCH_CHANNELS: "Banks, #marketbubble, xqc" });

  assert.equal(config.mode, "anonymous");
  assert.match(config.username, /^justinfan\d{5}$/);
  assert.equal(config.token, "SCHMOOPIIE");
  assert.deepEqual(config.channels, ["banks", "marketbubble", "xqc"]);
});

test("resolveTwitchIrcConfig keeps authenticated IRC credentials when present", () => {
  const config = resolveTwitchIrcConfig({
    TWITCH_USERNAME: "BubbleOps",
    TWITCH_OAUTH_TOKEN: "oauth:secret-token",
    TWITCH_CHANNELS: "marketbubble"
  });

  assert.equal(config.mode, "authenticated");
  assert.equal(config.username, "BubbleOps");
  assert.equal(config.token, "oauth:secret-token");
  assert.deepEqual(config.channels, ["marketbubble"]);
});
