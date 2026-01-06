/**
 * Blog content processing tools.
 * Handles URL processing, deduplication, and watermark management.
 */
import { z } from "zod";
import { createTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import { createFirecrawlClient } from "../lib/firecrawl.ts";
import { createSupabaseStorage } from "../lib/supabase.ts";
import { processContent } from "../lib/content.ts";
import type {
  BlogProcessingResult,
  ProcessUrlsOutput,
  CheckUpdatesOutput,
  GetWatermarksOutput,
} from "../lib/types.ts";

/**
 * Get configured clients from environment
 */
function getClients(env: Env) {
  const state = env.DECO_REQUEST_CONTEXT.state;
  return {
    firecrawl: createFirecrawlClient(state.firecrawlApiKey),
    storage: createSupabaseStorage(state.supabaseUrl, state.supabaseKey),
  };
}

/**
 * Process a list of URLs, extracting content and checking for duplicates.
 * - New content: saved to Supabase
 * - Updated content: fingerprint changed, record updated
 * - Unchanged: ignored
 */
export const processUrlsTool = (env: Env) =>
  createTool({
    id: "process_urls",
    description:
      "Process a list of blog URLs, extracting clean content (title, body, author, date) using Firecrawl. " +
      "Automatically deduplicates by fingerprint and tracks changes. " +
      "Returns processing results with summaries for new/updated content.",
    inputSchema: z.object({
      urls: z.array(z.string().url()).describe("List of blog URLs to process"),
      generateSummaries: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to generate short insight summaries"),
    }),
    outputSchema: z.object({
      processed: z.array(
        z.object({
          url: z.string(),
          status: z.enum(["new", "updated", "unchanged", "error"]),
          title: z.string().optional(),
          summary: z.string().optional(),
          fingerprint: z.string().optional(),
          domain: z.string().optional(),
          error: z.string().optional(),
          previousFingerprint: z.string().optional(),
        }),
      ),
      stats: z.object({
        total: z.number(),
        new: z.number(),
        updated: z.number(),
        unchanged: z.number(),
        errors: z.number(),
      }),
    }),
    execute: async ({ context: input }): Promise<ProcessUrlsOutput> => {
      const { firecrawl, storage } = getClients(env);
      const results: BlogProcessingResult[] = [];
      const stats = {
        total: input.urls.length,
        new: 0,
        updated: 0,
        unchanged: 0,
        errors: 0,
      };

      for (const url of input.urls) {
        try {
          // Extract content using Firecrawl
          const extracted = await firecrawl.scrapeUrl(url);

          // Process and generate fingerprint
          const processed = await processContent(
            extracted.url,
            extracted.domain,
            extracted.title,
            extracted.body,
            extracted.author,
            extracted.publishedDate,
          );

          // Check for duplicates
          const dedup = await storage.checkFingerprint(
            url,
            processed.fingerprint,
          );

          if (dedup.isNew) {
            // Save new content
            await storage.saveContent({
              url,
              fingerprint: processed.fingerprint,
              domain: processed.domain,
              title: processed.title,
            });

            // Update watermark for domain
            await storage.updateWatermark(processed.domain);

            results.push({
              url,
              status: "new",
              title: processed.title,
              summary: input.generateSummaries ? processed.summary : undefined,
              fingerprint: processed.fingerprint,
              domain: processed.domain,
            });
            stats.new++;
          } else if (dedup.isUpdated) {
            // Content changed - update record
            await storage.updateContent(
              url,
              processed.fingerprint,
              processed.title,
            );
            await storage.updateWatermark(processed.domain);

            results.push({
              url,
              status: "updated",
              title: processed.title,
              summary: input.generateSummaries ? processed.summary : undefined,
              fingerprint: processed.fingerprint,
              domain: processed.domain,
              previousFingerprint: dedup.existingRecord?.fingerprint,
            });
            stats.updated++;
          } else {
            // No changes
            results.push({
              url,
              status: "unchanged",
              title: dedup.existingRecord?.title,
              fingerprint: dedup.existingRecord?.fingerprint,
              domain: processed.domain,
            });
            stats.unchanged++;
          }
        } catch (error) {
          results.push({
            url,
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          stats.errors++;
        }
      }

      return { processed: results, stats };
    },
  });

/**
 * Check for content updates without re-extracting.
 * Useful for monitoring which URLs have been updated since last check.
 */
export const checkUpdatesTool = (env: Env) =>
  createTool({
    id: "check_updates",
    description:
      "Check the status of previously processed URLs. " +
      "Returns last seen timestamps and update counts without re-extracting content.",
    inputSchema: z.object({
      domain: z.string().optional().describe("Filter by domain"),
      urls: z
        .array(z.string().url())
        .optional()
        .describe("Specific URLs to check"),
    }),
    outputSchema: z.object({
      updates: z.array(
        z.object({
          url: z.string(),
          domain: z.string(),
          hasChanges: z.boolean(),
          lastSeenAt: z.string(),
          updatedCount: z.number(),
        }),
      ),
    }),
    execute: async ({ context: input }): Promise<CheckUpdatesOutput> => {
      const { storage } = getClients(env);
      const updates: CheckUpdatesOutput["updates"] = [];

      if (input.domain) {
        const records = await storage.getContentByDomain(input.domain);
        for (const record of records) {
          updates.push({
            url: record.url,
            domain: record.domain,
            hasChanges: record.updated_count > 0,
            lastSeenAt: record.last_seen_at,
            updatedCount: record.updated_count,
          });
        }
      }

      if (input.urls) {
        for (const url of input.urls) {
          const dedup = await storage.checkFingerprint(url, "");
          if (dedup.existingRecord) {
            updates.push({
              url: dedup.existingRecord.url,
              domain: dedup.existingRecord.domain,
              hasChanges: dedup.existingRecord.updated_count > 0,
              lastSeenAt: dedup.existingRecord.last_seen_at,
              updatedCount: dedup.existingRecord.updated_count,
            });
          }
        }
      }

      return { updates };
    },
  });

/**
 * Get watermarks (last_processed_at) for domains.
 * Useful for understanding processing history and scheduling.
 */
export const getWatermarksTool = (env: Env) =>
  createTool({
    id: "get_watermarks",
    description:
      "Get processing watermarks for domains. " +
      "Shows when each domain was last processed, useful for scheduling updates.",
    inputSchema: z.object({
      domain: z
        .string()
        .optional()
        .describe("Get watermark for specific domain"),
    }),
    outputSchema: z.object({
      watermarks: z.array(
        z.object({
          domain: z.string(),
          lastProcessedAt: z.string(),
        }),
      ),
    }),
    execute: async ({ context: input }): Promise<GetWatermarksOutput> => {
      const { storage } = getClients(env);

      if (input.domain) {
        const watermark = await storage.getWatermark(input.domain);
        if (watermark) {
          return {
            watermarks: [
              {
                domain: watermark.domain,
                lastProcessedAt: watermark.last_processed_at,
              },
            ],
          };
        }
        return { watermarks: [] };
      }

      const allWatermarks = await storage.getAllWatermarks();
      return {
        watermarks: allWatermarks.map((w) => ({
          domain: w.domain,
          lastProcessedAt: w.last_processed_at,
        })),
      };
    },
  });

/**
 * Export all blog tools
 */
export const blogTools = [processUrlsTool, checkUpdatesTool, getWatermarksTool];
