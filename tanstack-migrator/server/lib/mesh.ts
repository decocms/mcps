/**
 * Mesh access for background work (no live request context).
 *
 * The worker rebuilds everything from the sitemig_connections row persisted
 * by onChange: meshUrl + durable API key (preferred, JWTs expire in ~5min)
 * + raw binding values ({__type, value: connectionId}).
 *
 * Tool calls go straight to the mesh MCP endpoints as JSON-RPC:
 *   - bindings/other connections: POST {meshUrl}/mcp/{connectionId}  (x-mesh-token)
 *   - management tools (VM_START, API_KEY_CREATE...): POST {meshUrl}/mcp/self (Bearer)
 */

import type { ConnectionRow } from "../db/types.ts";
import { type MigratorConfig, parseMigratorConfig } from "../types/env.ts";
import { bindingConnectionId } from "./persist-state.ts";

/** Bookkeeping key in the state snapshot: org slug used in decopilot URLs. */
export const ORG_SLUG_STATE_KEY = "__ORG_SLUG";

export interface WorkerCtx {
  connectionId: string;
  organizationId: string;
  /** Org slug — the /api/{org}/decopilot/* routes want the SLUG, not the id. */
  organizationSlug?: string;
  meshUrl: string;
  /** Durable API key when available, else the last-seen request JWT. */
  meshToken: string | null;
  config: MigratorConfig;
  /** Raw persisted state (bindings as {__type, value}). */
  state: Record<string, unknown>;
}

export function buildWorkerCtx(row: ConnectionRow): WorkerCtx {
  // pinned keys are tamper-proof (old replicas rewrite `state` wholesale and
  // their zod schema strips fields they don't know) — pinned wins over state
  const merged = { ...(row.state ?? {}), ...(row.pinned ?? {}) };
  const slug = merged[ORG_SLUG_STATE_KEY];
  return {
    connectionId: row.connection_id,
    organizationId: row.organization_id,
    organizationSlug: typeof slug === "string" && slug ? slug : undefined,
    meshUrl: row.mesh_url,
    meshToken: row.mesh_api_key || row.mesh_token || null,
    config: parseMigratorConfig(merged),
    state: merged,
  };
}

/**
 * Tunnel URLs (.deco.host) are only reachable from the developer's browser;
 * server-to-server traffic goes through localhost. Same rule as
 * shared/mesh-chat/client.ts.
 */
export function resolveMeshUrl(meshUrl: string): string {
  return meshUrl.includes(".deco.host") ? "http://localhost:3000" : meshUrl;
}

interface JsonRpcToolResponse {
  result?: {
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  };
  error?: { code: number; message: string };
}

function extractToolResult<T>(payload: JsonRpcToolResponse, tool: string): T {
  if (payload.error) {
    throw new Error(`${tool} failed: ${payload.error.message}`);
  }
  const result = payload.result;
  if (!result) throw new Error(`${tool} returned an empty response`);

  const text = (result.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");

  if (result.isError) {
    throw new Error(`${tool} failed: ${text || "tool returned an error"}`);
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent as T;
  }
  if (text) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
  return undefined as unknown as T;
}

/**
 * Some mesh responses come back as text/event-stream even with
 * Accept: application/json first — unwrap the last `data:` payload.
 */
function parseRpcBody(raw: string): JsonRpcToolResponse {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as JsonRpcToolResponse;
  }
  const dataLines = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(dataLines[i]) as JsonRpcToolResponse;
      if (parsed.result !== undefined || parsed.error !== undefined) {
        return parsed;
      }
    } catch {
      // keep scanning
    }
  }
  throw new Error(`Unparseable MCP response: ${trimmed.slice(0, 200)}`);
}

async function callMcpEndpoint<T>(
  url: string,
  headers: Record<string, string>,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `${tool} HTTP ${response.status} at ${url}: ${raw.slice(0, 300)}`,
    );
  }
  return extractToolResult<T>(parseRpcBody(raw), tool);
}

/** Call a tool on an arbitrary mesh connection (e.g. a binding's connectionId). */
export async function callConnectionTool<T = unknown>(
  ctx: WorkerCtx,
  connectionId: string,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<T> {
  if (!ctx.meshToken) {
    throw new Error("No mesh token available for background tool calls");
  }
  const base = resolveMeshUrl(ctx.meshUrl);
  return callMcpEndpoint<T>(
    new URL(`/mcp/${connectionId}`, base).href,
    {
      "x-mesh-token": ctx.meshToken,
      Authorization: `Bearer ${ctx.meshToken}`,
    },
    tool,
    args,
    timeoutMs,
  );
}

/** Call a management tool (VM_START, VM_DELETE, API_KEY_CREATE...) on /mcp/self. */
export async function callSelfTool<T = unknown>(
  ctx: WorkerCtx,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<T> {
  if (!ctx.meshToken) {
    throw new Error("No mesh token available for management tool calls");
  }
  const base = resolveMeshUrl(ctx.meshUrl);
  return callMcpEndpoint<T>(
    new URL("/mcp/self", base).href,
    {
      Authorization: `Bearer ${ctx.meshToken}`,
      "x-org-id": ctx.organizationId,
    },
    tool,
    args,
    timeoutMs,
  );
}

type BindingName = "GITHUB" | "OBJECT_STORAGE" | "GRAFANA";

/** Call a tool on one of this MCP's bindings (GITHUB, OBJECT_STORAGE, GRAFANA). */
export async function callBindingTool<T = unknown>(
  ctx: WorkerCtx,
  binding: BindingName,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<T> {
  const connectionId = bindingConnectionId(ctx.state, binding);
  if (!connectionId) {
    throw new Error(`${binding} binding is not configured`);
  }
  return callConnectionTool<T>(ctx, connectionId, tool, args, timeoutMs);
}

export function hasBinding(ctx: WorkerCtx, binding: BindingName): boolean {
  return bindingConnectionId(ctx.state, binding) !== null;
}
