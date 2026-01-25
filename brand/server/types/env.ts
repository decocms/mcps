/**
 * Type definitions for the Brand MCP environment.
 *
 * This MCP requires Perplexity and Firecrawl bindings for brand research.
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

/**
 * State schema with required bindings for brand research.
 */
export const StateSchema = z.object({
  /**
   * Perplexity binding for web research.
   * Used to search for brand information, logo URLs, and brand guidelines.
   */
  PERPLEXITY: BindingOf("@deco/perplexity")
    .optional()
    .describe(
      "Perplexity AI binding for brand research - searches for logos, brand colors, and brand information",
    ),

  /**
   * Firecrawl binding for web scraping.
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
 */
export type Registry = BindingRegistry;

/**
 * Environment type for the Brand MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
