/**
 * Central export point for all slides MCP tools.
 *
 * This file aggregates all tools from different domains:
 * - Deck tools: initialization, info, bundling, engine
 * - Style tools: style guide management
 * - Slide tools: CRUD operations for slides
 * - Brand research tools: automatic brand discovery (requires bindings)
 */
import { deckTools } from "./deck.ts";
import { styleTools } from "./style.ts";
import { slideTools } from "./slides.ts";
import { brandResearchTools } from "./brand-research.ts";

/**
 * All tool factory functions.
 * Each factory takes env and returns a tool definition.
 * The runtime will call these with the environment.
 */
export const tools = [
  ...deckTools,
  ...styleTools,
  ...slideTools,
  ...brandResearchTools,
];

// Re-export individual tool modules for direct access
export { deckTools } from "./deck.ts";
export { styleTools } from "./style.ts";
export { slideTools } from "./slides.ts";
export { brandResearchTools } from "./brand-research.ts";
