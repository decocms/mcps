import { z } from "zod";

// Keywords Input Schemas
export const searchVolumeInputSchema = z.object({
  keywords: z.array(z.string()).describe("Array of keywords to analyze"),
  languageName: z
    .string()
    .optional()
    .describe("Language name (e.g., 'English')"),
  locationName: z
    .string()
    .optional()
    .describe("Location name (e.g., 'United States')"),
  languageCode: z.string().optional().describe("Language code (e.g., 'en')"),
  locationCode: z
    .number()
    .optional()
    .describe("Location code (e.g., 2840 for US)"),
});

export const relatedKeywordsInputSchema = z.object({
  keyword: z.string().describe("Seed keyword to find related terms"),
  locationName: z
    .string()
    .optional()
    .describe(
      "Location name (e.g., 'United States'). Defaults to 'United States'",
    ),
  languageName: z
    .string()
    .optional()
    .describe("Language name (e.g., 'English'). Defaults to 'English'"),
  locationCode: z
    .number()
    .optional()
    .describe("Location code (e.g., 2840 for US). Alternative to locationName"),
  languageCode: z
    .string()
    .optional()
    .describe("Language code (e.g., 'en'). Alternative to languageName"),
  depth: z.number().optional().describe("Depth of keyword expansion (1-10)"),
  limit: z.number().optional().describe("Maximum number of results"),
});

// Keywords Output Schemas
export const searchVolumeOutputSchema = z.object({
  data: z
    .any()
    .describe("Search volume data including CPC, competition, and trends"),
});

export const relatedKeywordsOutputSchema = z.object({
  data: z.any().describe("Related keywords with search volume and metrics"),
});

// SERP Input Schemas
export const organicSerpInputSchema = z.object({
  keyword: z.string().describe("Search keyword to analyze"),
  languageCode: z.string().optional().describe("Language code (e.g., 'en')"),
  locationCode: z
    .number()
    .optional()
    .describe("Location code (e.g., 2840 for US)"),
  device: z.enum(["desktop", "mobile"]).optional().describe("Device type"),
  depth: z.number().optional().describe("Number of results to return"),
});

export const newsSerpInputSchema = z.object({
  keyword: z.string().describe("Search keyword to analyze"),
  languageCode: z.string().optional().describe("Language code (e.g., 'en')"),
  locationCode: z
    .number()
    .optional()
    .describe("Location code (e.g., 2840 for US)"),
  sortBy: z.enum(["relevance", "date"]).optional().describe("Sort order"),
  timeRange: z
    .enum(["all", "1h", "1d", "1w", "1m", "1y"])
    .optional()
    .describe("Time range filter"),
});

// SERP Output Schemas
export const organicSerpOutputSchema = z.object({
  data: z
    .any()
    .describe("SERP data with rankings, URLs, titles, and descriptions"),
});

export const newsSerpOutputSchema = z.object({
  data: z.any().describe("News results with titles, sources, and timestamps"),
});

// Backlinks Input Schemas
export const backlinksOverviewInputSchema = z.object({
  target: z.string().describe("Target domain or URL to analyze"),
});

export const backlinksInputSchema = z.object({
  target: z.string().describe("Target domain or URL to analyze"),
  limit: z.number().optional().describe("Maximum number of results"),
  offset: z.number().optional().describe("Offset for pagination"),
});

export const referringDomainsInputSchema = z.object({
  target: z.string().describe("Target domain or URL to analyze"),
  limit: z.number().optional().describe("Maximum number of results"),
  offset: z.number().optional().describe("Offset for pagination"),
});

// Backlinks Output Schemas
export const backlinksOverviewOutputSchema = z.object({
  data: z
    .any()
    .describe("Backlinks overview including total counts and metrics"),
});

export const backlinksOutputSchema = z.object({
  data: z
    .any()
    .describe("Detailed list of backlinks with anchor text and status"),
});

export const referringDomainsOutputSchema = z.object({
  data: z
    .any()
    .describe("List of referring domains with ranks and backlink counts"),
});
