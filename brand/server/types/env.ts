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
  PERPLEXITY: BindingOf("@deco/perplexity")
    .optional()
    .describe("AI research - any MCP with perplexity tools"),
  SCRAPER: BindingOf("@deco/scraper")
    .optional()
    .describe("Web scraping - any MCP with scrape tools"),
});

export type Env = DefaultEnv<typeof StateSchema, BindingRegistry>;
