/**
 * GitHub MCP Tools
 *
 * All tools come from the upstream MCP server via the proxy,
 * plus trigger tools for the Mesh automations system.
 */

import { createTool } from "@decocms/runtime/tools";
import {
  TriggerListInputSchema,
  TriggerListOutputSchema,
  TriggerConfigureInputSchema,
  TriggerConfigureOutputSchema,
} from "@decocms/bindings/trigger";
import type { Env } from "../types/env.ts";
import { createUpstreamToolsProvider } from "../lib/mcp-proxy.ts";
import {
  listTriggerDefinitions,
  configureTrigger,
} from "../lib/trigger-store.ts";

const createTriggerListTool = (_env: Env) =>
  createTool({
    id: "TRIGGER_LIST",
    description:
      "List available GitHub event triggers that can be configured for automations",
    inputSchema: TriggerListInputSchema,
    outputSchema: TriggerListOutputSchema,
    execute: async () => {
      return { triggers: listTriggerDefinitions() };
    },
  });

const createTriggerConfigureTool = (_env: Env) =>
  createTool({
    id: "TRIGGER_CONFIGURE",
    description: "Enable or disable a GitHub event trigger for automations",
    inputSchema: TriggerConfigureInputSchema.extend({
      params: TriggerConfigureInputSchema.shape.params.default({}),
    }),
    outputSchema: TriggerConfigureOutputSchema,
    execute: async ({ context, runtimeContext }) => {
      const connectionId = (runtimeContext?.env as unknown as Env)
        ?.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error("Connection ID not available");
      }
      configureTrigger(
        context.type,
        context.params,
        context.enabled,
        connectionId,
      );
      return { success: true };
    },
  });

export const tools = [
  createUpstreamToolsProvider(),
  createTriggerListTool,
  createTriggerConfigureTool,
];
