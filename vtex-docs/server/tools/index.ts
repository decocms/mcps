/**
 * Central export point for all tools organized by domain.
 */
import { userTools } from "@decocms/mcps-shared/tools/user";
import { vtexDocsAssistant } from "./assistant.ts";
import { vtexDocsSearch } from "./search.ts";

export const tools = [...userTools, vtexDocsAssistant, vtexDocsSearch];
