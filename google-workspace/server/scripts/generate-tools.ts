/**
 * Refresh per-service snapshots in server/tools/generated/.
 *
 * Fetches `tools/list` from each Google MCP backend and the PRM scopes_supported
 * from each backend's RFC 9728 metadata. Both endpoints are reachable without
 * authentication, so this script needs no Google credentials.
 *
 * Run: `bun run generate-tools`
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKEND_MCPS, type GoogleService } from "../constants.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "tools", "generated");

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: { tools: unknown[] };
  error?: { code: number; message: string };
}

interface ProtectedResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
}

async function fetchToolsList(backendUrl: string): Promise<unknown[]> {
  const res = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  if (!res.ok) {
    throw new Error(
      `${backendUrl} tools/list HTTP ${res.status}: ${await res.text()}`,
    );
  }
  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) {
    throw new Error(`${backendUrl} tools/list error: ${json.error.message}`);
  }
  return json.result?.tools ?? [];
}

async function fetchScopes(backendUrl: string): Promise<string[]> {
  const u = new URL(backendUrl);
  const prmUrl = `${u.origin}/.well-known/oauth-protected-resource${u.pathname}`;
  const res = await fetch(prmUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`${prmUrl} HTTP ${res.status}: ${await res.text()}`);
  }
  const prm = (await res.json()) as ProtectedResourceMetadata;
  return prm.scopes_supported ?? [];
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const services = Object.keys(BACKEND_MCPS) as GoogleService[];
  const indexEntries: Record<
    string,
    { scopes: string[]; toolNames: string[] }
  > = {};

  for (const service of services) {
    const url = BACKEND_MCPS[service];
    process.stdout.write(`fetching ${service} (${url})... `);
    const [tools, scopes] = await Promise.all([
      fetchToolsList(url),
      fetchScopes(url),
    ]);
    const snap = { service, scopes, tools };
    await writeFile(
      join(OUT_DIR, `${service}.json`),
      JSON.stringify(snap, null, 2) + "\n",
    );
    indexEntries[service] = {
      scopes,
      toolNames: tools.map((t) => (t as { name: string }).name),
    };
    console.log(`${tools.length} tools, ${scopes.length} scopes`);
  }

  await writeFile(
    join(OUT_DIR, "_index.json"),
    JSON.stringify(indexEntries, null, 2) + "\n",
  );
  console.log(`\nWrote ${services.length} snapshots to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
