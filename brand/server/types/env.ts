/**
 * Type definitions for the Brand MCP environment.
 *
 * This MCP uses Perplexity for AI research and Content Scraper for web scraping.
 */
import { type DefaultEnv, type BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

/**
 * Perplexity binding schema - matches the actual tool names from Perplexity MCP
 *
 * Perplexity exposes: ASK, CHAT (from @decocms/mcps-shared/search-ai)
 */
const PerplexityBindingSchema = [
  {
    name: "ASK",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        model: { type: "string" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "CHAT",
    inputSchema: {
      type: "object",
      properties: {
        messages: { type: "array" },
        model: { type: "string" },
      },
      required: ["messages"],
    },
  },
] as const;

/**
 * Content Scraper binding schema - matches the actual tool names
 *
 * Content Scraper exposes: scrape_content, get_content_scrape
 */
const ContentScraperBindingSchema = [
  {
    name: "scrape_content",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
  },
] as const;

/**
 * State schema with optional bindings for brand research.
 *
 * The bindings use __binding to define tool patterns for matching connections:
 * - PERPLEXITY: Matches connections with ASK/CHAT tools (from search-ai)
 * - SCRAPER: Matches connections with scrape_content tool
 */
export const StateSchema = z.object({
  /**
   * Perplexity binding for web research.
   * Matches connections with tools: ASK, CHAT
   */
  PERPLEXITY: z
    .object({
      __type: z.literal("@deco/perplexity").default("@deco/perplexity"),
      __binding: z
        .literal(PerplexityBindingSchema)
        .default(PerplexityBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe("Perplexity AI for brand research - requires ASK tool"),

  /**
   * Content Scraper binding for web scraping.
   * Matches connections with tools: scrape_content
   */
  SCRAPER: z
    .object({
      __type: z
        .literal("@deco/content-scraper")
        .default("@deco/content-scraper"),
      __binding: z
        .literal(ContentScraperBindingSchema)
        .default(ContentScraperBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe(
      "Content Scraper for web scraping - requires scrape_content tool",
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
