/**
 * MCP Proxy Module
 *
 * Uses the official MCP TypeScript SDK Client to connect to an upstream
 * MCP server and proxy tools and resources through our OAuth flow.
 *
 * Tool definitions are fetched once at startup using a GitHub App installation
 * token. Tool execution uses the per-request user token from ctx.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createTool, type AppContext } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAppInstallationToken } from "./github-app-auth.ts";

const DEFAULT_UPSTREAM_URL = "https://api.githubcopilot.com/mcp/";

/**
 * Create a fresh MCP client connected to the upstream server.
 */
function connectUpstreamClient(token: string): Promise<Client> {
  const client = new Client({ name: "github-mcp-proxy", version: "1.0.0" });

  const transport = new StreamableHTTPClientTransport(
    new URL(DEFAULT_UPSTREAM_URL),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );

  return client.connect(transport).then(() => client);
}

// ============================================================================
// JSON Schema → Zod conversion
// ============================================================================

function jsonSchemaPropertyToZod(
  prop: { type?: string; description?: string; [key: string]: unknown },
  required: boolean,
): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (prop.type) {
    case "string":
      schema = z.string();
      break;
    case "number":
    case "integer":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "array":
      schema = z.array(z.unknown());
      break;
    case "object":
      schema = z.record(z.string(), z.unknown());
      break;
    default:
      schema = z.unknown();
  }

  if (prop.description) {
    schema = schema.describe(prop.description);
  }

  if (!required) {
    schema = schema.optional();
  }

  return schema;
}

function jsonSchemaToZod(inputSchema?: {
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: unknown;
}): z.ZodTypeAny {
  if (!inputSchema?.properties) {
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  const required = new Set(inputSchema.required || []);

  for (const [key, prop] of Object.entries(inputSchema.properties)) {
    shape[key] = jsonSchemaPropertyToZod(prop, required.has(key));
  }

  return z.object(shape);
}

// ============================================================================
// Startup tool discovery
// ============================================================================

type ToolsDef = Awaited<ReturnType<Client["listTools"]>>["tools"];

/**
 * Discover upstream tool definitions at startup using a GitHub App
 * installation token. Throws on failure — the server should not boot
 * if tool discovery fails.
 */
async function discoverUpstreamToolDefs(): Promise<ToolsDef> {
  console.log("[MCP Proxy] Discovering upstream tools at startup...");
  const token = await getAppInstallationToken();
  const client = await connectUpstreamClient(token);
  try {
    const result = await client.listTools();
    console.log(`[MCP Proxy] Discovered ${result.tools.length} upstream tools`);
    return result.tools;
  } finally {
    client.close().catch(() => {});
  }
}

/**
 * Top-level promise that resolves to the upstream tool definitions.
 * Awaited in tools/index.ts before the server starts accepting requests.
 * If this fails, the server process crashes — by design.
 */
export const upstreamToolDefsReady: Promise<ToolsDef> =
  discoverUpstreamToolDefs();

// ============================================================================
// Upstream tool creation
// ============================================================================

/**
 * Build createTool() instances from pre-discovered tool definitions.
 * Execution uses the per-request user token from ctx.
 */
export function buildUpstreamTools(
  toolDefs: ToolsDef,
): ReturnType<typeof createTool>[] {
  return toolDefs.map((toolDef) =>
    createTool({
      id: toolDef.name,
      description: toolDef.description || `GitHub tool: ${toolDef.name}`,
      inputSchema: jsonSchemaToZod(toolDef.inputSchema as any),
      execute: async ({ context }, ctx) => {
        const currentToken = (ctx as AppContext<Env>).env.MESH_REQUEST_CONTEXT
          ?.authorization;
        if (!currentToken) {
          throw new Error("GitHub authorization token not found");
        }

        const client = await connectUpstreamClient(currentToken);
        try {
          return await client.callTool({
            name: toolDef.name,
            arguments: context as Record<string, unknown>,
          });
        } finally {
          client.close().catch(() => {});
        }
      },
    }),
  );
}

// ============================================================================
// Resource proxying (pass-through to upstream)
// ============================================================================

/** Methods that should be forwarded to the upstream server */
const PROXY_METHODS = new Set([
  "resources/list",
  "resources/read",
  "resources/subscribe",
  "resources/unsubscribe",
  "resources/templates/list",
]);

/**
 * Try to handle a JSON-RPC request by forwarding resource methods to upstream
 * via the SDK Client. Returns a Response if handled, or null if the request
 * should be handled locally.
 */
export async function handleProxiedRequest(
  req: Request,
  upstreamUrl: string,
  token: string,
): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const url = new URL(req.url);
  if (url.pathname !== "/mcp") return null;

  const cloned = req.clone();
  let body: { jsonrpc?: string; method?: string; params?: any; id?: unknown };
  try {
    body = (await cloned.json()) as typeof body;
  } catch {
    return null;
  }

  if (!body.method || !PROXY_METHODS.has(body.method)) {
    return null;
  }

  console.log(`[MCP Proxy] Forwarding ${body.method} to upstream`);

  const client = await connectUpstreamClient(token);
  try {
    let result: unknown;

    switch (body.method) {
      case "resources/list":
        result = await client.listResources(body.params);
        break;
      case "resources/read":
        result = await client.readResource(body.params);
        break;
      case "resources/subscribe":
        result = await client.subscribeResource(body.params);
        break;
      case "resources/unsubscribe":
        result = await client.unsubscribeResource(body.params);
        break;
      case "resources/templates/list":
        result = await client.listResourceTemplates(body.params);
        break;
      default:
        return null;
    }

    return Response.json(
      { jsonrpc: "2.0", id: body.id ?? null, result },
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`[MCP Proxy] Failed to forward ${body.method}:`, error);
    return Response.json(
      {
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: {
          code: -32603,
          message: `Upstream error: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
      { headers: { "Content-Type": "application/json" } },
    );
  } finally {
    client.close().catch(() => {});
  }
}
