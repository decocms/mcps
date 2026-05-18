/**
 * Quick test — sends a Teams message using a token you paste in.
 *
 * No Azure App Registration, no OAuth, no ngrok needed.
 * Just paste a token from Microsoft Graph Explorer.
 *
 * How to get a token (5 minutes):
 *   1. Open https://developer.microsoft.com/graph/graph-explorer
 *   2. Click "Sign in" (top right) — login with your Teams-licensed account
 *   3. Click the "Access token" tab below the URL bar — copy the token
 *   4. Paste in TOKEN env var below
 *
 * Then run:
 *   TOKEN=eyJ0eXA... bun run scripts/quick-send.ts list-teams
 *   TOKEN=eyJ0eXA... bun run scripts/quick-send.ts list-channels <team_id>
 *   TOKEN=eyJ0eXA... bun run scripts/quick-send.ts send <team_id> <channel_id> "hello"
 *
 * NOTE: tokens from Graph Explorer expire in ~1 hour — get a fresh one if needed.
 */

import {
  listJoinedTeams,
  listChannels,
  sendChannelMessage,
} from "../server/lib/graph-client.ts";

const token = process.env.TOKEN?.trim();

// Debug: confirm token is loaded correctly
if (token) {
  console.log(
    `🔑 Token loaded: length=${token.length}, starts with "${token.slice(0, 20)}..."`,
  );
  if (!token.startsWith("eyJ")) {
    console.error(
      "⚠️  Token does NOT start with 'eyJ' — it may not be a valid JWT. Re-copy from Graph Explorer's 'Access token' tab.",
    );
  }
}

if (!token) {
  console.error("❌ Missing TOKEN env var.");
  console.error(`
Get one for free in 30 seconds:
  1. Open https://developer.microsoft.com/graph/graph-explorer
  2. Sign in with your Teams account (top right)
  3. Click "Access token" tab → copy the token
  4. Run:  TOKEN=<paste-token-here> bun run scripts/quick-send.ts list-teams
`);
  process.exit(1);
}

const cmd = process.argv[2];

if (!cmd) {
  console.log(`Usage:
  TOKEN=... bun run scripts/quick-send.ts list-teams
  TOKEN=... bun run scripts/quick-send.ts list-channels <team_id>
  TOKEN=... bun run scripts/quick-send.ts send <team_id> <channel_id> <message>`);
  process.exit(0);
}

try {
  switch (cmd) {
    case "list-teams": {
      const teams = await listJoinedTeams(token);
      console.log(`📋 ${teams.length} team(s):\n`);
      for (const t of teams) {
        console.log(`  ${t.displayName}`);
        console.log(`    id: ${t.id}\n`);
      }
      break;
    }
    case "list-channels": {
      const teamId = process.argv[3];
      if (!teamId) {
        console.error("Usage: list-channels <team_id>");
        process.exit(1);
      }
      const channels = await listChannels(teamId, token);
      console.log(`📋 ${channels.length} channel(s):\n`);
      for (const c of channels) {
        console.log(`  ${c.displayName} (${c.membershipType})`);
        console.log(`    id: ${c.id}\n`);
      }
      break;
    }
    case "send": {
      const teamId = process.argv[3];
      const channelId = process.argv[4];
      const message = process.argv.slice(5).join(" ");
      if (!teamId || !channelId || !message) {
        console.error("Usage: send <team_id> <channel_id> <message>");
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
} catch (err) {
  console.error("❌ Error:", err);
  process.exit(1);
}

process.exit(0);
