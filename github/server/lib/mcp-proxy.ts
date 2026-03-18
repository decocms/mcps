/**
 * MCP Proxy Module
 *
 * Uses the official MCP TypeScript SDK Client to connect to an upstream
 * MCP server and proxy tools and resources through our OAuth flow.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CreatedTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

/** Cached client per upstream URL + token combo */
let cachedClient: Client | null = null;
let cachedClientKey = "";
let cachedClientConnected = false;

const DEFAULT_UPSTREAM_URL = "https://api.githubcopilot.com/mcp/";

/**
 * Get or create an MCP client connected to the upstream server.
 * Caches the client to avoid reconnecting on every request.
 */
async function getUpstreamClient(
  upstreamUrl: string,
  token: string,
): Promise<Client> {
  const key = `${upstreamUrl}::${token}`;

  if (cachedClient && cachedClientKey === key && cachedClientConnected) {
    return cachedClient;
  }

  // Close previous client if exists
  if (cachedClient) {
    try {
      await cachedClient.close();
    } catch {
      // Ignore close errors
    }
  }

  console.log(`[MCP Proxy] Connecting to upstream: ${upstreamUrl}`);

  const client = new Client({ name: "github-mcp-proxy", version: "1.0.0" });

  const transport = new StreamableHTTPClientTransport(new URL(upstreamUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  await client.connect(transport);

  cachedClient = client;
  cachedClientKey = key;
  cachedClientConnected = true;

  console.log("[MCP Proxy] Connected to upstream server");

  return client;
}

/** Cached upstream tool definitions, keyed by token */
type ToolsDef = Awaited<ReturnType<Client["listTools"]>>["tools"];
const toolsCache = new Map<string, { tools: ToolsDef; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Convert a JSON Schema property to a Zod schema.
 */
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

/**
 * Convert a JSON Schema object to a Zod z.object() schema.
 */
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

/**
 * Create a tool provider that fetches upstream tools via the SDK Client
 * and wraps them as CreatedTool[] for the Deco runtime.
 */
export function createUpstreamToolsProvider(): (
  env: Env,
) => Promise<CreatedTool[]> {
  return async (env: Env): Promise<CreatedTool[]> => {
    const token = env.MESH_REQUEST_CONTEXT?.authorization;
    const upstreamUrl = DEFAULT_UPSTREAM_URL;

    if (!token) {
      console.log(
        "[MCP Proxy] No auth token available, skipping upstream tools",
      );
      return [];
    }

    try {
      const client = await getUpstreamClient(upstreamUrl, token);

      // Check cache (keyed by token to avoid leaking between users)
      const now = Date.now();
      const cached = toolsCache.get(token);
      let tools: ToolsDef;
      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        tools = cached.tools;
      } else {
        const result = await client.listTools();
        tools = result.tools;
        toolsCache.set(token, { tools, timestamp: now });
        console.log(`[MCP Proxy] Found ${tools.length} upstream tools`);
      }

      return tools.map(
        (toolDef): CreatedTool => ({
          id: toolDef.name,
          description: toolDef.description || `GitHub tool: ${toolDef.name}`,
          inputSchema: jsonSchemaToZod(toolDef.inputSchema as any),
          execute: async ({ context }) => {
            const currentToken = env.MESH_REQUEST_CONTEXT?.authorization;
            if (!currentToken) {
              throw new Error("GitHub authorization token not found");
            }

            const currentUrl = DEFAULT_UPSTREAM_URL;

            const upstreamClient = await getUpstreamClient(
              currentUrl,
              currentToken,
            );
            const result = await upstreamClient.callTool({
              name: toolDef.name,
              arguments: context as Record<string, unknown>,
            });

            return result;
          },
        }),
      );
    } catch (error) {
      console.error("[MCP Proxy] Failed to fetch upstream tools:", error);
      return [];
    }
  };
}

/**
 * Invalidate the upstream tools cache and disconnect client.
 */
export function invalidateUpstreamCache(): void {
  toolsCache.clear();

  if (cachedClient) {
    cachedClient.close().catch(() => {});
    cachedClient = null;
    cachedClientKey = "";
    cachedClientConnected = false;
  }
}

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

  try {
    const client = await getUpstreamClient(upstreamUrl, token);
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
  }
}
