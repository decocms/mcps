/**
 * MCP Tools Index
 *
 * Export all Discord MCP tools.
 * Each tool call updates the global env to keep MESH_REQUEST_CONTEXT fresh.
 */

import { updateEnv } from "../bot-manager.ts";
import type { Env } from "../types/env.ts";
import type { ToolFactory, ToolCollection } from "../types/tools.ts";
import { agentTools } from "./agents.ts";
import { messageTools } from "./messages.ts";
import { setupTools } from "./setup.ts";
import { allDiscordTools } from "./discord/index.ts";

// Wrap each tool factory to update env on every call
function wrapWithEnvUpdate(toolFactory: ToolFactory<Env>): ToolFactory<Env> {
  return (env: Env) => {
    // Update global env with latest MESH_REQUEST_CONTEXT
    updateEnv(env);
    return toolFactory(env);
  };
}

// Wrap all tools
const wrappedSetupTools = setupTools.map(wrapWithEnvUpdate);
const wrappedAgentTools = agentTools.map(wrapWithEnvUpdate);
const wrappedMessageTools = messageTools.map(wrapWithEnvUpdate);
const wrappedDiscordTools = allDiscordTools.map(wrapWithEnvUpdate);

export const tools: ToolCollection<Env> = [
  ...wrappedSetupTools,
  ...wrappedAgentTools,
  ...wrappedMessageTools,
  ...wrappedDiscordTools,
];
