import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import {
  BACKEND_MCPS,
  type BackendToolDefinition,
  type GoogleService,
} from "../constants.ts";
import { jsonSchemaToZod } from "./json-schema-to-zod.ts";
import { getGoogleAccessToken } from "./env.ts";
import { proxyMcpCall } from "./mcp-proxy.ts";

/**
 * Build a deco tool factory from a Google MCP backend tool definition.
 * The returned tool, when executed, proxies tools/call to the upstream
 * backend with the user's Bearer token.
 */
export function wrapBackendTool(
  service: GoogleService,
  def: BackendToolDefinition,
) {
  const id = `${service}_${def.name}`;
  const inputSchema = jsonSchemaToZod(def.inputSchema ?? {});
  // The upstream content can be anything — we forward whatever the backend
  // returns under the `content` field per the MCP spec.
  const outputSchema = z.unknown();

  return (env: Env) =>
    createPrivateTool({
      id,
      description: def.description ?? `${service} ${def.name}`,
      inputSchema,
      outputSchema,
      execute: async ({ context }) => {
        const accessToken = getGoogleAccessToken(env);
        const result = await proxyMcpCall(
          BACKEND_MCPS[service],
          def.name,
          context,
          accessToken,
        );
        return result;
      },
    });
}
