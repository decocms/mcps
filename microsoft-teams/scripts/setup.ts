/**
 * Standalone setup — seeds a connection config into the KV store
 * without going through the deco Studio.
 *
 * Reads from .env in the microsoft-teams/ folder:
 *   TENANT_ID=...
 *   CLIENT_ID=...
 *   CLIENT_SECRET=...
 *   REDIRECT_URI=https://<your-ngrok>.ngrok-free.dev/auth/callback
 *   CONNECTION_ID=local         (optional, defaults to "local")
 *   CLIENT_STATE=teams-mcp      (optional, used to validate Graph webhooks)
 *
 * After running this, open in a browser:
 *   <SERVER_PUBLIC_URL>/auth/start?connectionId=local
 *
 * Run:
 *   bun run scripts/setup.ts
 */

import { initializeKvStore } from "../server/lib/kv.ts";
import { cacheConnectionConfig } from "../server/lib/config-cache.ts";

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const CONNECTION_ID = process.env.CONNECTION_ID ?? "local";
const CLIENT_STATE = process.env.CLIENT_STATE ?? "teams-mcp-secret";

const missing: string[] = [];
if (!TENANT_ID) missing.push("TENANT_ID");
if (!CLIENT_ID) missing.push("CLIENT_ID");
if (!CLIENT_SECRET) missing.push("CLIENT_SECRET");
if (!REDIRECT_URI) missing.push("REDIRECT_URI");

if (missing.length > 0) {
  console.error(`❌ Missing required env vars in .env: ${missing.join(", ")}`);
  console.error(`
Add these to microsoft-teams/.env:
  TENANT_ID=<from Azure Portal Overview>
  CLIENT_ID=<from Azure Portal Overview>
  CLIENT_SECRET=<from Certificates & secrets>
  REDIRECT_URI=https://<your-ngrok>.ngrok-free.dev/auth/callback
`);
  process.exit(1);
}

await initializeKvStore("./data/teams-kv.json");

await cacheConnectionConfig({
  connectionId: CONNECTION_ID,
  organizationId: "local",
  meshUrl: "local",
  tenantId: TENANT_ID!,
  clientId: CLIENT_ID!,
  clientSecret: CLIENT_SECRET!,
  redirectUri: REDIRECT_URI!,
  clientState: CLIENT_STATE,
  connectionName: "Local CLI test",
});

const baseUrl = REDIRECT_URI!.replace(/\/auth\/callback$/, "");

console.log(`✅ Connection "${CONNECTION_ID}" saved to KV.\n`);
console.log(`Next step — open this URL in your browser to log in:\n`);
console.log(`  ${baseUrl}/auth/start?connectionId=${CONNECTION_ID}\n`);
console.log(`After login, test with:`);
console.log(`  bun run scripts/test-tools.ts whoami`);
console.log(`  bun run scripts/test-tools.ts list-teams`);
console.log(
  `  bun run scripts/test-tools.ts send <team_id> <channel_id> "hello"\n`,
);

process.exit(0);
