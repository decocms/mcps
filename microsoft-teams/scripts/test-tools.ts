/**
 * Standalone tester for Microsoft Teams MCP tools — no deco studio needed.
 *
 * Reads the OAuth token from the KV store (must have logged in once via
 * /auth/start) and calls Graph API functions directly.
 *
 * Usage (from microsoft-teams/ directory):
 *   bun run scripts/test-tools.ts list-teams
 *   bun run scripts/test-tools.ts list-channels <team_id>
 *   bun run scripts/test-tools.ts send <team_id> <channel_id> <message>
 *   bun run scripts/test-tools.ts whoami
 *
 * If you have multiple connections, set CONNECTION_ID env var:
 *   CONNECTION_ID=i:abc-123 bun run scripts/test-tools.ts list-teams
 */

import { initializeKvStore, getKvStore } from "../server/lib/kv.ts";
import { getDelegatedToken } from "../server/lib/auth.ts";
import {
  listJoinedTeams,
  listChannels,
  sendChannelMessage,
} from "../server/lib/graph-client.ts";
import { getUserProfile } from "../server/lib/oauth.ts";

await initializeKvStore("./data/teams-kv.json");

async function pickConnectionId(): Promise<string> {
  if (process.env.CONNECTION_ID) return process.env.CONNECTION_ID;
  const kv = getKvStore();
  const keys = await kv.keys("conn:");
  if (keys.length === 0) {
    console.error(
      "❌ No connections found in KV store. Save a config in deco Studio and complete OAuth first.",
    );
    process.exit(1);
  }
  if (keys.length > 1) {
    console.error(
      `⚠️  Multiple connections found. Set CONNECTION_ID env var. Available:`,
    );
    for (const k of keys) console.error(`   - ${k.replace(/^conn:/, "")}`);
    process.exit(1);
  }
  return keys[0].replace(/^conn:/, "");
}

const cmd = process.argv[2];

if (!cmd) {
  console.log(`Usage:
  bun run scripts/test-tools.ts whoami
  bun run scripts/test-tools.ts list-teams
  bun run scripts/test-tools.ts list-channels <team_id>
  bun run scripts/test-tools.ts send <team_id> <channel_id> <message>`);
  process.exit(0);
}

const connectionId = await pickConnectionId();
console.log(`🔑 Using connection: ${connectionId}\n`);

const token = await getDelegatedToken(connectionId);

switch (cmd) {
  case "whoami": {
    const profile = await getUserProfile(token);
    console.log("👤 Logged in as:");
    console.log(profile);
    break;
  }
  case "list-teams": {
    const teams = await listJoinedTeams(token);
    console.log(`📋 ${teams.length} team(s):\n`);
    for (const t of teams) {
      console.log(`  ${t.displayName}`);
      console.log(`    id: ${t.id}`);
      if (t.description) console.log(`    desc: ${t.description}`);
      console.log();
    }
    break;
  }
  case "list-channels": {
    const teamId = process.argv[3];
    if (!teamId) {
      console.error(
        "Usage: bun run scripts/test-tools.ts list-channels <team_id>",
      );
      process.exit(1);
    }
    const channels = await listChannels(teamId, token);
    console.log(`📋 ${channels.length} channel(s) in team ${teamId}:\n`);
    for (const c of channels) {
      console.log(`  ${c.displayName} (${c.membershipType})`);
      console.log(`    id: ${c.id}`);
      console.log();
    }
    break;
  }
  case "send": {
    const teamId = process.argv[3];
    const channelId = process.argv[4];
    const message = process.argv.slice(5).join(" ");
    if (!teamId || !channelId || !message) {
      console.error(
        "Usage: bun run scripts/test-tools.ts send <team_id> <channel_id> <message>",
      );
      process.exit(1);
    }
    const result = await sendChannelMessage(
      teamId,
      channelId,
      message,
      "text",
      token,
    );
    console.log("✅ Message sent!");
    console.log(`   id:     ${result.id}`);
    console.log(`   webUrl: ${result.webUrl ?? "n/a"}`);
    break;
  }
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}

process.exit(0);
