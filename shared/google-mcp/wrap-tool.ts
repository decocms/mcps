import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { jsonSchemaToZod } from "./json-schema-to-zod.ts";
import { proxyMcpCall } from "./proxy.ts";

export interface BackendToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface WrapToolOptions {
  /** Backend MCP URL to proxy tools/call to (e.g. https://bigquery.googleapis.com/mcp). */
  backendUrl: string;
  /**
   * Optional prefix prepended to every tool name. Useful when one MCP wraps
   * multiple backends (`calendar_list_events`, `gmail_search_threads`, ...).
   * For single-backend wrappers, leave empty.
   */
  prefix?: string;
  /**
   * Reads the user's Google access token out of the runtime env on each call.
   * Typically `(env) => env.MESH_REQUEST_CONTEXT?.authorization` plus a guard.
   */
  getAccessToken: (env: unknown) => string;
}

/**
 * Build a deco tool factory from a Google MCP backend tool definition.
 * The returned factory takes `env` and produces a `createPrivateTool` whose
 * execute proxies tools/call to `opts.backendUrl` with the user's Bearer token.
 */
export function wrapBackendTool(
  def: BackendToolDefinition,
  opts: WrapToolOptions,
) {
  const id = opts.prefix ? `${opts.prefix}_${def.name}` : def.name;
  const inputSchema = jsonSchemaToZod(def.inputSchema ?? {});
  const outputSchema = z.unknown();

  return (env: unknown) =>
    createPrivateTool({
      id,
      description: def.description ?? id,
      inputSchema,
      outputSchema,
      execute: async ({ context }) => {
        const accessToken = opts.getAccessToken(env);
        return await proxyMcpCall(
          opts.backendUrl,
          def.name,
          context,
          accessToken,
        );
      },
    });
}

/**
 * Convenience helper: wrap an entire snapshot ({ tools: BackendToolDefinition[] })
 * deduping by tool id (some Google backends return duplicates in tools/list).
 */
export function wrapBackendSnapshot(
  tools: BackendToolDefinition[],
  opts: WrapToolOptions,
) {
  const seen = new Set<string>();
  return tools
    .filter((def) => {
      const id = opts.prefix ? `${opts.prefix}_${def.name}` : def.name;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((def) => wrapBackendTool(def, opts));
}
