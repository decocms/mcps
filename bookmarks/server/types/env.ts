/**
 * Environment Type Definitions for Bookmarks MCP
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  SUPABASE: BindingOf("@supabase/supabase")
    .optional()
    .describe("Supabase binding for bookmark storage"),
  PERPLEXITY: BindingOf("@deco/perplexity")
    .optional()
    .describe("Perplexity binding for AI research"),
  FIRECRAWL: BindingOf("@deco/firecrawl")
    .optional()
    .describe("Firecrawl binding for web scraping"),
});

export type Env = DefaultEnv<typeof StateSchema, BindingRegistry>;
