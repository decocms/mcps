/**
 * Central export point for all Gmail tools
 */

import { messageTools } from "./messages.ts";
import { threadTools } from "./threads.ts";
import { labelTools } from "./labels.ts";
import { draftTools } from "./drafts.ts";
import { triggers } from "../lib/trigger-store.ts";

/**
 * Core Gmail tools without the webhook/trigger machinery. Safe to import from
 * other MCPs (e.g. google-workspace) that don't have the Workers KV binding
 * required by `triggers.tools()`.
 */
export const basicTools = [
  ...messageTools,
  ...threadTools,
  ...labelTools,
  ...draftTools,
];

export const tools = [...basicTools, ...triggers.tools()];
