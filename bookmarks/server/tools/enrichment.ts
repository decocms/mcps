/**
 * Bookmark Enrichment Tools
 *
 * AI-powered enrichment using Perplexity and Firecrawl bindings.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

/**
 * BOOKMARK_RESEARCH - Research a bookmark using Perplexity
 */
export const createBookmarkResearchTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_RESEARCH",
    description: `Research a bookmark URL using Perplexity AI.

Returns a summary of what the page is about, key insights, and relevance assessment.

Requires PERPLEXITY binding.`,
    inputSchema: z.object({
      url: z.string().describe("URL to research"),
      context: z
        .string()
        .optional()
        .describe("Additional context for the research"),
    }),
    handler: async ({ input }) => {
      const perplexity = env.bindings?.PERPLEXITY;

      if (!perplexity) {
        return {
          success: false,
          error:
            "PERPLEXITY binding not configured. Connect the Perplexity MCP to enable research.",
        };
      }

      try {
        const prompt = `Research this URL and provide a comprehensive summary:

URL: ${input.url}
${input.context ? `Context: ${input.context}` : ""}

Please provide:
1. A 2-3 sentence summary of what this page/resource is about
2. Key insights or takeaways (3-5 bullet points)
3. Who would benefit from this resource
4. Any notable quotes or statistics
5. Related topics or resources`;

        const result = await perplexity.call("PERPLEXITY_SEARCH", {
          query: prompt,
        });

        return {
          success: true,
          research: result.answer || result.text || result,
          sources: result.sources || [],
        };
      } catch (error) {
        return {
          success: false,
          error: `Research failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BOOKMARK_SCRAPE - Scrape bookmark content using Firecrawl
 */
export const createBookmarkScrapeTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_SCRAPE",
    description: `Scrape the content of a bookmark URL using Firecrawl.

Extracts the main content from the page in markdown format.

Requires FIRECRAWL binding.`,
    inputSchema: z.object({
      url: z.string().describe("URL to scrape"),
    }),
    handler: async ({ input }) => {
      const firecrawl = env.bindings?.FIRECRAWL;

      if (!firecrawl) {
        return {
          success: false,
          error:
            "FIRECRAWL binding not configured. Connect the Firecrawl MCP to enable scraping.",
        };
      }

      try {
        const result = await firecrawl.call("FIRECRAWL_SCRAPE", {
          url: input.url,
        });

        return {
          success: true,
          content: result.markdown || result.content || result,
          title: result.title,
          metadata: result.metadata,
        };
      } catch (error) {
        return {
          success: false,
          error: `Scraping failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BOOKMARK_CLASSIFY - Auto-classify a bookmark with tags and insights
 */
export const createBookmarkClassifyTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_CLASSIFY",
    description: `Auto-classify a bookmark with tags and generate insights from multiple perspectives.

This tool:
1. Analyzes the bookmark content
2. Generates relevant tags
3. Creates insights from developer, founder, and investor perspectives
4. Estimates reading time
5. Detects language

Requires PERPLEXITY binding for AI analysis.`,
    inputSchema: z.object({
      id: z.number().describe("Bookmark ID to classify"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;
      const perplexity = env.bindings?.PERPLEXITY;

      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      if (!perplexity) {
        return {
          success: false,
          error: "PERPLEXITY binding not configured for classification",
        };
      }

      try {
        // Get bookmark
        const result = await supabase.call("execute_sql", {
          query:
            "SELECT url, title, description, firecrawl_content, perplexity_research FROM bookmarks WHERE id = $1",
          params: [input.id],
        });

        if (!result.rows || result.rows.length === 0) {
          return { success: false, error: "Bookmark not found" };
        }

        const bookmark = result.rows[0];
        const content =
          bookmark.firecrawl_content ||
          bookmark.perplexity_research ||
          bookmark.description ||
          bookmark.title;

        if (!content) {
          return {
            success: false,
            error:
              "No content available for classification. Run BOOKMARK_SCRAPE or BOOKMARK_RESEARCH first.",
          };
        }

        // Classify using Perplexity
        const classifyPrompt = `Analyze this content and provide classification:

URL: ${bookmark.url}
Title: ${bookmark.title || "Unknown"}
Content: ${content.slice(0, 3000)}

Respond in JSON format:
{
  "tags": ["tag1", "tag2", "tag3"], // 3-7 relevant tags
  "language": "en", // ISO language code
  "reading_time_min": 5, // estimated reading time
  "insight_dev": "Brief insight for developers (1-2 sentences)",
  "insight_founder": "Brief insight for founders/entrepreneurs (1-2 sentences)",
  "insight_investor": "Brief insight for investors (1-2 sentences)"
}`;

        const classifyResult = await perplexity.call("PERPLEXITY_SEARCH", {
          query: classifyPrompt,
        });

        // Parse the response
        let classification;
        try {
          const responseText =
            classifyResult.answer ||
            classifyResult.text ||
            String(classifyResult);
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            classification = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found in response");
          }
        } catch {
          return {
            success: false,
            error: "Failed to parse classification response",
            raw: classifyResult,
          };
        }

        return {
          success: true,
          classification,
          message: `Bookmark ${input.id} classified with ${classification.tags?.length || 0} tags`,
        };
      } catch (error) {
        return {
          success: false,
          error: `Classification failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BOOKMARK_ENRICH_BATCH - Batch enrich multiple bookmarks
 */
export const createBookmarkEnrichBatchTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_ENRICH_BATCH",
    description: `Batch enrich bookmarks that haven't been researched yet.

For each bookmark:
1. Scrapes content (if FIRECRAWL available)
2. Researches with AI (if PERPLEXITY available)
3. Classifies and tags

Returns a summary of results.`,
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum bookmarks to process"),
      skipScrape: z
        .boolean()
        .optional()
        .default(false)
        .describe("Skip Firecrawl scraping"),
      skipResearch: z
        .boolean()
        .optional()
        .default(false)
        .describe("Skip Perplexity research"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;
      const perplexity = env.bindings?.PERPLEXITY;
      const firecrawl = env.bindings?.FIRECRAWL;

      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      try {
        // Get un-enriched bookmarks
        const result = await supabase.call("execute_sql", {
          query: `
            SELECT id, url, title
            FROM bookmarks
            WHERE researched_at IS NULL
            ORDER BY id
            LIMIT $1
          `,
          params: [input.limit],
        });

        const bookmarks = result.rows || [];
        if (bookmarks.length === 0) {
          return {
            success: true,
            message: "No un-enriched bookmarks found",
            processed: 0,
          };
        }

        const results: Array<{
          id: number;
          url: string;
          status: "success" | "partial" | "failed";
          error?: string;
        }> = [];

        for (const bookmark of bookmarks) {
          try {
            let scraped = false;
            let researched = false;

            // Scrape content
            if (!input.skipScrape && firecrawl) {
              try {
                const scrapeResult = await firecrawl.call("FIRECRAWL_SCRAPE", {
                  url: bookmark.url,
                });
                if (scrapeResult.markdown || scrapeResult.content) {
                  await supabase.call("execute_sql", {
                    query:
                      "UPDATE bookmarks SET firecrawl_content = $1 WHERE id = $2",
                    params: [
                      scrapeResult.markdown || scrapeResult.content,
                      bookmark.id,
                    ],
                  });
                  scraped = true;
                }
              } catch {
                // Continue even if scraping fails
              }
            }

            // Research with Perplexity
            if (!input.skipResearch && perplexity) {
              try {
                const researchResult = await perplexity.call(
                  "PERPLEXITY_SEARCH",
                  {
                    query: `Summarize this URL in 2-3 sentences: ${bookmark.url}`,
                  },
                );
                const research =
                  researchResult.answer ||
                  researchResult.text ||
                  String(researchResult);
                await supabase.call("execute_sql", {
                  query: `
                    UPDATE bookmarks 
                    SET perplexity_research = $1, researched_at = NOW()
                    WHERE id = $2
                  `,
                  params: [research, bookmark.id],
                });
                researched = true;
              } catch {
                // Continue even if research fails
              }
            }

            results.push({
              id: bookmark.id,
              url: bookmark.url,
              status: scraped || researched ? "success" : "partial",
            });
          } catch (error) {
            results.push({
              id: bookmark.id,
              url: bookmark.url,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const successCount = results.filter(
          (r) => r.status === "success",
        ).length;
        const failedCount = results.filter((r) => r.status === "failed").length;

        return {
          success: true,
          processed: results.length,
          successful: successCount,
          failed: failedCount,
          results,
        };
      } catch (error) {
        return {
          success: false,
          error: `Batch enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * All enrichment tool factories
 */
export const enrichmentTools = [
  createBookmarkResearchTool,
  createBookmarkScrapeTool,
  createBookmarkClassifyTool,
  createBookmarkEnrichBatchTool,
];
