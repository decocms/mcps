/**
 * GitHub MCP Tools
 *
 * All tools come from the upstream MCP server via the proxy,
 * plus trigger tools for the Mesh automations system.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
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
    inputSchema: z.object({}),
    execute: async () => {
      return { triggers: listTriggerDefinitions() };
    },
  });

const createTriggerConfigureTool = (_env: Env) =>
  createTool({
    id: "TRIGGER_CONFIGURE",
    description: "Enable or disable a GitHub event trigger for automations",
    inputSchema: z.object({
      type: z.string().describe("Trigger event type e.g. github.push"),
      params: z
        .object({
          repo: z
            .string()
            .optional()
            .describe("Repository full name e.g. owner/repo"),
        })
        .default({}),
      enabled: z.boolean().describe("Whether to enable or disable the trigger"),
    }),
    execute: async ({ context }) => {
      configureTrigger(
        context.type,
        context.params as Record<string, string>,
        context.enabled,
      );
      return { success: true };
    },
  });

export const tools = [
  createUpstreamToolsProvider(),
  createTriggerListTool,
  createTriggerConfigureTool,
];
