/**
 * Type definitions for the Slides MCP environment.
 *
 * This file defines the state schema including optional bindings
 * for external services like Perplexity (research) and Firecrawl (web scraping).
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

/**
 * State schema with optional bindings for brand research.
 *
 * When PERPLEXITY or FIRECRAWL bindings are configured, the BRAND_RESEARCH
 * tool becomes available to automatically discover brand assets (logos, colors, etc.)
 * from websites.
 */
export const StateSchema = z.object({
  /**
   * Optional Perplexity binding for web research.
   * Used to search for brand information, logo URLs, and brand guidelines.
   */
  PERPLEXITY: BindingOf("@deco/perplexity")
    .optional()
    .describe(
      "Perplexity AI binding for brand research - searches for logos, brand colors, and brand information",
    ),

  /**
   * Optional Firecrawl binding for web scraping.
   * Used to extract brand identity (colors, fonts, typography) directly from websites.
   */
  FIRECRAWL: BindingOf("@deco/firecrawl")
    .optional()
    .describe(
      "Firecrawl binding for web scraping - extracts brand identity (colors, typography, logos) from websites",
    ),
});

/**
 * Registry type for the bindings.
 * We use BindingRegistry directly since the actual binding types
 * are determined at runtime by the configured MCP servers.
 */
export type Registry = BindingRegistry;

/**
 * Environment type for the Slides MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
