/**
 * Central export point for all Google Tag Manager tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools:
 * - accountTools: Account management (list, get)
 * - containerTools: Container management (list, get, create, delete)
 * - workspaceTools: Workspace management (list, get, create, delete)
 * - tagTools: Tag management (list, get, create, update, delete)
 * - triggerTools: Trigger management (list, get, create, update, delete)
 * - variableTools: Variable management (list, get, create, update, delete)
 */

import { accountTools } from "./accounts.ts";
import { containerTools } from "./containers.ts";
import { workspaceTools } from "./workspaces.ts";
import { tagTools } from "./tags.ts";
import { triggerTools } from "./triggers.ts";
import { variableTools } from "./variables.ts";

// Export all tools from all modules
export const tools = [
  // Account management tools
  ...accountTools,
  // Container management tools
  ...containerTools,
  // Workspace management tools
  ...workspaceTools,
  // Tag management tools
  ...tagTools,
  // Trigger management tools
  ...triggerTools,
  // Variable management tools
  ...variableTools,
];
