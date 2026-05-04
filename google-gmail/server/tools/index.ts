/**
 * Central export point for all Gmail tools
 */

import { messageTools } from "./messages.ts";
import { threadTools } from "./threads.ts";
import { labelTools } from "./labels.ts";
import { draftTools } from "./drafts.ts";
import { triggers } from "../lib/trigger-store.ts";

export const tools = [
  ...messageTools,
  ...threadTools,
  ...labelTools,
  ...draftTools,
  ...triggers.tools(),
];
