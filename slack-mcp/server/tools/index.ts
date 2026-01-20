/**
 * Slack MCP Tools Index
 *
 * Export all Slack MCP tools.
 */

import type { Env } from "../types/env.ts";
import { messageTools } from "./messages.ts";
import { channelTools } from "./channels.ts";
import { userTools } from "./users.ts";
import { setupTools } from "./setup.ts";

type ToolFactory<E> = (env: E) => unknown;
type ToolCollection<E> = ToolFactory<E>[];

export const tools: ToolCollection<Env> = [
  ...messageTools,
  ...channelTools,
  ...userTools,
  ...setupTools,
];
