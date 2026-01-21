/**
 * Slack MCP Tools Index
 *
 * Export all Slack MCP tools.
 * Wraps each tool to ensure Slack client is initialized before execution.
 */

import type { Env } from "../types/env.ts";
import { ensureSlackClient } from "../lib/slack-client.ts";
import { messageTools } from "./messages.ts";
import { channelTools } from "./channels.ts";
import { userTools } from "./users.ts";
import { setupTools } from "./setup.ts";
import { handleWebhook } from "./handle-webhook";

type ToolFactory<E> = (env: E) => unknown;
type ToolCollection<E> = ToolFactory<E>[];

/**
 * Wrap tool factory to ensure Slack client is initialized
 */
function wrapWithClientInit(toolFactory: ToolFactory<Env>): ToolFactory<Env> {
  return (env: Env) => {
    // Ensure Slack client is initialized before creating tool
    const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
    if (botToken) {
      ensureSlackClient(botToken);
    }
    return toolFactory(env);
  };
}

// Wrap all tools
const wrappedMessageTools = messageTools.map(wrapWithClientInit);
const wrappedChannelTools = channelTools.map(wrapWithClientInit);
const wrappedUserTools = userTools.map(wrapWithClientInit);
const wrappedSetupTools = setupTools.map(wrapWithClientInit);

export const tools: ToolCollection<Env> = [
  ...wrappedMessageTools,
  ...wrappedChannelTools,
  ...wrappedUserTools,
  ...wrappedSetupTools,
  handleWebhook, // Webhook handler doesn't need Slack client init
];
