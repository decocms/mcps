/**
 * Central export point for all slides MCP tools.
 *
 * This file aggregates all tools from different domains:
 * - Deck tools: initialization, info, bundling, engine
 * - Style tools: style guide management
 * - Slide tools: CRUD operations for slides
 */
import type { Env } from "../main.ts";
import { deckTools } from "./deck.ts";
import { styleTools } from "./style.ts";
import { slideTools } from "./slides.ts";

// Type for tool factory functions
type ToolFactory = (
  env: Env,
) => ReturnType<typeof import("@decocms/runtime/tools").createPrivateTool>;

// Combine all tool factories
const allToolFactories: ToolFactory[] = [
  ...deckTools,
  ...styleTools,
  ...slideTools,
];

// Export tools as a function that takes env and returns all tools
export const tools = <TEnv extends Env>(env: TEnv) => {
  return allToolFactories.map((factory) => factory(env));
};

// Re-export individual tool modules for direct access
export { deckTools } from "./deck.ts";
export { styleTools } from "./style.ts";
export { slideTools } from "./slides.ts";
