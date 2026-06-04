import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const baseUrl = process.env.BUBBLEWIRE_URL || "http://127.0.0.1:3000";
const outputDir = new URL("../docs/evidence/logs/", import.meta.url);
const outputFile = new URL("proof.json", outputDir);

const proof = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  commands: [],
  smoke: {},
  result: "pending"
};

await mkdir(outputDir, { recursive: true });

proof.commands.push(await runCommand("npm", ["test"]));
proof.commands.push(await runCommand("npm", ["run", "check"]));

const before = await getJson("/status.json");
proof.smoke.before = summarizeStatus(before);
proof.smoke.healthz = await getJson("/healthz");

const kickWebhook = await postJson("/kick.webhook", {
  message_id: `proof-${Date.now()}`,
  broadcaster: {
    username: "marketbubble",
    channel_slug: "marketbubble"
  },
  sender: {
    username: "proofjudge",
    channel_slug: "proofjudge",
    is_verified: true,
    identity: {
      username_color: "#53FC18",
      badges: [{ text: "Reviewer", type: "reviewer" }]
    }
  },
  content: "Kick webhook proof event",
  created_at: new Date().toISOString()
});

await postJson("/demo-spike.json", {});
const after = await getJson("/status.json");

proof.smoke.kickWebhook = kickWebhook;
proof.smoke.after = summarizeStatus(after);
proof.smoke.latestMessage = after.messages[0];
proof.result = proof.commands.every((command) => command.exitCode === 0) && kickWebhook.ok ? "pass" : "fail";

await writeFile(outputFile, `${JSON.stringify(proof, null, 2)}\n`);
console.log(`Proof ${proof.result}: ${outputFile.pathname}`);

if (proof.result !== "pass") process.exit(1);

function summarizeStatus(snapshot) {
  return {
    totalMessages: snapshot.stats.totalMessages,
    duplicatesDropped: snapshot.stats.duplicatesDropped,
    status: snapshot.status,
    sourceCounts: Object.fromEntries(
      Object.entries(snapshot.stats.sources).map(([source, value]) => [source, value.count])
    )
  };
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Kick-Event-Type": "chat.message.sent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: new URL("..", import.meta.url),
      env: process.env
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      resolve({
        command: [command, ...args].join(" "),
        exitCode,
        stdout: stdout.slice(-6000),
        stderr: stderr.slice(-3000)
      });
    });
  });
}
