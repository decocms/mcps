/**
 * MCP Tools Index
 *
 * Export all Discord MCP tools.
 * Each tool call updates the global env to keep MESH_REQUEST_CONTEXT fresh.
 */

import { updateEnv } from "../bot-manager.ts";
import type { Env } from "../types/env.ts";
import type { ToolFactory, ToolCollection } from "../types/tools.ts";
import { allDiscordTools } from "./discord/index.ts";
import { configTools } from "./config.ts";
import { botTools } from "./bot.ts";
import { databaseTools } from "./database.ts";

// Wrap each tool factory to update env on every call
function wrapWithEnvUpdate(toolFactory: ToolFactory<Env>): ToolFactory<Env> {
  return (env: Env) => {
    // Update global env with latest MESH_REQUEST_CONTEXT
    updateEnv(env);
    return toolFactory(env);
  };
}

// Wrap all tools
const wrappedConfigTools = configTools.map(wrapWithEnvUpdate);
const wrappedBotTools = botTools.map(wrapWithEnvUpdate);
const wrappedDatabaseTools = databaseTools.map(wrapWithEnvUpdate);
const wrappedDiscordTools = allDiscordTools.map(wrapWithEnvUpdate);

export const tools: ToolCollection<Env> = [
  ...wrappedConfigTools,
  ...wrappedBotTools,
  ...wrappedDatabaseTools,
  ...wrappedDiscordTools,
];
