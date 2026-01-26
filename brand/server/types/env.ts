/**
 * Environment Type Definitions for Brand MCP
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  PERPLEXITY: BindingOf("@deco/perplexity-ai")
    .optional()
    .describe(
      "Perplexity AI for brand research - searches for logos, colors, brand identity",
    ),
  FIRECRAWL: BindingOf("@deco/firecrawl")
    .optional()
    .describe(
      "Firecrawl for web scraping - extracts brand assets from websites",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, BindingRegistry>;
