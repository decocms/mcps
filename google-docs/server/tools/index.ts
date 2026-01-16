/**
 * Central export for all Google Docs tools
 */

import { documentTools } from "./documents.ts";
import { contentTools } from "./content.ts";
import { formattingTools } from "./formatting.ts";
import { elementTools } from "./elements.ts";

export const tools = [
  ...documentTools,
  ...contentTools,
  ...formattingTools,
  ...elementTools,
];
