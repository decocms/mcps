/**
 * Zod Schemas for Domain Models
 *
 * These schemas provide runtime validation and are used for:
 * - MCP tool input/output validation
 * - API request/response validation
 * - Data persistence validation
 *
 * @module domain/schemas
 * @version 1.0.0
 */

import { z } from "zod";

// =============================================================================
// Enums and Primitive Types
// =============================================================================

export const SourceTypeSchema = z.enum([
  "rss",
  "reddit",
  "web_scraper",
  "linkedin",
]);

/**
 * Content category is a free-form string.
 * Categories come from user's configured topics of interest.
 * The LLM classifies content based on these topics.
 */
export const ContentCategorySchema = z.string();

export const ProcessingStatusSchema = z.enum([
  "raw",
  "normalized",
  "enriched",
  "failed",
]);

export const TrendMomentumSchema = z.enum(["rising", "stable", "declining"]);

// =============================================================================
// Source Configuration Schemas
// =============================================================================

export const RssSourceConfigSchema = z.object({
  type: z.literal("rss"),
  feedUrl: z.string().url(),
  filterTags: z.array(z.string()).optional(),
});

export const RedditSourceConfigSchema = z.object({
  type: z.literal("reddit"),
  subreddit: z.string().min(1),
  sortBy: z.enum(["hot", "new", "top", "rising"]).optional(),
  timeFilter: z
    .enum(["hour", "day", "week", "month", "year", "all"])
    .optional(),
  minUpvotes: z.number().int().nonnegative().optional(),
});

export const WebScraperSourceConfigSchema = z.object({
  type: z.literal("web_scraper"),
  baseUrl: z.string().url(),
  selectors: z.object({
    articleList: z.string().optional(),
    title: z.string(),
    content: z.string(),
    author: z.string().optional(),
    date: z.string().optional(),
    link: z.string().optional(),
  }),
  pagination: z
    .object({
      type: z.enum(["page_number", "next_link", "load_more"]),
      selector: z.string().optional(),
      maxPages: z.number().int().positive().optional(),
    })
    .optional(),
});

export const LinkedInSourceConfigSchema = z.object({
  type: z.literal("linkedin"),
  profileUrl: z.string().url().optional(),
  companyUrl: z.string().url().optional(),
});

export const SourceConfigSchema = z.discriminatedUnion("type", [
  RssSourceConfigSchema,
  RedditSourceConfigSchema,
  WebScraperSourceConfigSchema,
  LinkedInSourceConfigSchema,
]);

// =============================================================================
// Main Entity Schemas
// =============================================================================

export const SourceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: SourceTypeSchema,
  config: SourceConfigSchema,
  enabled: z.boolean(),
  lastFetch: z
    .object({
      timestamp: z.string().datetime(),
      itemCount: z.number().int().nonnegative(),
      success: z.boolean(),
      error: z.string().optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ContentItemSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceType: SourceTypeSchema,
  title: z.string(),
  content: z.string(),
  summary: z.string().optional(),
  url: z.string().url(),
  author: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  fetchedAt: z.string().datetime(),
  status: ProcessingStatusSchema,
  categories: z.array(ContentCategorySchema).optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  semanticHash: z.string().optional(),
  duplicateOf: z.array(z.string()).optional(),
  sourceMetadata: z.record(z.unknown()).optional(),
  processingErrors: z.array(z.string()).optional(),
});

export const TrendItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  momentum: TrendMomentumSchema,
  relatedContentIds: z.array(z.string()),
  relatedTags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const DigestSectionSchema = z.object({
  category: ContentCategorySchema,
  summary: z.string(),
  highlights: z.array(z.string()),
  contentIds: z.array(z.string()),
});

export const WeeklyDigestSchema = z.object({
  id: z.string(),
  title: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  generatedAt: z.string().datetime(),
  executiveSummary: z.string(),
  sections: z.array(DigestSectionSchema),
  topContentIds: z.array(z.string()),
  trends: z.array(TrendItemSchema),
  stats: z.object({
    totalItems: z.number().int().nonnegative(),
    itemsBySource: z.record(z.number().int().nonnegative()),
    itemsByCategory: z.record(z.number().int().nonnegative()),
    averageRelevanceScore: z.number().min(0).max(1),
  }),
});

// =============================================================================
// Query Schemas
// =============================================================================

export const ContentQuerySchema = z.object({
  query: z.string().optional(),
  sourceIds: z.array(z.string()).optional(),
  sourceTypes: z.array(SourceTypeSchema).optional(),
  categories: z.array(ContentCategorySchema).optional(),
  tags: z.array(z.string()).optional(),
  minRelevanceScore: z.number().min(0).max(1).optional(),
  dateRange: z
    .object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .optional(),
  enrichedOnly: z.boolean().optional(),
  excludeDuplicates: z.boolean().optional(),
  pagination: z
    .object({
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().max(100).optional(),
    })
    .optional(),
  sort: z
    .object({
      field: z.enum(["publishedAt", "fetchedAt", "relevanceScore"]),
      order: z.enum(["asc", "desc"]),
    })
    .optional(),
});

export const ContentQueryResultSchema = z.object({
  items: z.array(ContentItemSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});

// =============================================================================
// Tool-specific Schemas (for MCP tools)
// =============================================================================

/**
 * Input schema for search_content tool
 */
/**
 * Helper to parse comma-separated string or array
 */
const stringOrArray = z.union([
  z.array(z.string()),
  z.string().transform((s) =>
    s
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0),
  ),
]);

export const SearchContentInputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Free text search query to match against content"),
  categories: stringOrArray
    .optional()
    .describe("Filter by categories (array or comma-separated)"),
  sourceTypes: stringOrArray
    .optional()
    .describe(
      "Filter by source types: rss, reddit, web_scraper (array or comma-separated)",
    ),
  tags: stringOrArray
    .optional()
    .describe("Filter by tags (array or comma-separated)"),
  minRelevanceScore: z.coerce
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Minimum relevance score (0-1)"),
  daysBack: z.coerce
    .number()
    .int()
    .positive()
    .max(90)
    .optional()
    .describe("Number of days back to search (default: 7)"),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Maximum number of results to return (default: 20)"),
  excludeDuplicates: z
    .union([z.boolean(), z.string().transform((s) => s === "true")])
    .optional()
    .describe("Whether to exclude duplicate content (default: true)"),
});

/**
 * Output schema for search_content tool
 */
export const SearchContentOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string().optional(),
      url: z.string(),
      source: z.string(),
      sourceType: SourceTypeSchema,
      publishedAt: z.string().optional(),
      categories: z.array(ContentCategorySchema).optional(),
      relevanceScore: z.number().optional(),
      tags: z.array(z.string()).optional(),
    }),
  ),
  total: z.number(),
  query: z.string().optional(),
});

/**
 * Input schema for get_weekly_digest tool
 * Uses coerce to handle string inputs from forms/JSON
 */
export const GetWeeklyDigestInputSchema = z.object({
  weekOffset: z.coerce
    .number()
    .int()
    .min(0)
    .max(12)
    .optional()
    .describe("Weeks back from current (0 = this week, 1 = last week)"),
  includeFullContent: z
    .union([z.boolean(), z.string().transform((s) => s === "true")])
    .optional()
    .describe("Whether to include full content items (default: false)"),
});

/**
 * Output schema for get_weekly_digest tool
 */
export const GetWeeklyDigestOutputSchema = z.object({
  digest: WeeklyDigestSchema.nullable(),
  message: z.string().optional(),
});

/**
 * Input schema for get_trends tool
 * Uses coerce to handle string inputs from forms/JSON
 */
export const GetTrendsInputSchema = z.object({
  daysBack: z.coerce
    .number()
    .int()
    .positive()
    .max(30)
    .optional()
    .describe("Number of days to analyze for trends (default: 7)"),
  categories: stringOrArray
    .optional()
    .describe("Filter trends by categories (array or comma-separated)"),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe("Maximum number of trends to return (default: 10)"),
});

/**
 * Output schema for get_trends tool
 */
export const GetTrendsOutputSchema = z.object({
  trends: z.array(TrendItemSchema),
  periodStart: z.string(),
  periodEnd: z.string(),
  totalContentAnalyzed: z.number(),
});

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type SourceType = z.infer<typeof SourceTypeSchema>;
export type ContentCategory = z.infer<typeof ContentCategorySchema>;
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;
export type TrendMomentum = z.infer<typeof TrendMomentumSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type TrendItem = z.infer<typeof TrendItemSchema>;
export type DigestSection = z.infer<typeof DigestSectionSchema>;
export type WeeklyDigest = z.infer<typeof WeeklyDigestSchema>;
export type ContentQuery = z.infer<typeof ContentQuerySchema>;
export type ContentQueryResult = z.infer<typeof ContentQueryResultSchema>;
