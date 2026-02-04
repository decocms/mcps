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

// Google Trends Input Schemas
export const googleTrendsInputSchema = z.object({
  keywords: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("Array of 1-5 keywords to compare trends"),
  locationName: z
    .string()
    .optional()
    .describe(
      "Location name (e.g., 'United States'). Defaults to 'United States'",
    ),
  locationCode: z
    .number()
    .optional()
    .describe("Location code (e.g., 2840 for US). Alternative to locationName"),
  timeRange: z
    .enum([
      "now 1-d",
      "now 7-d",
      "today 1-m",
      "today 3-m",
      "today 12-m",
      "today 5-y",
      "2004-present",
    ])
    .optional()
    .describe("Time range for trends data. Defaults to 'today 12-m'"),
  category: z.number().optional().describe("Category ID (0 = All categories)"),
});

// Google Trends Output Schemas
export const googleTrendsOutputSchema = z.object({
  data: z
    .any()
    .describe(
      "Google Trends data including interest over time, regional interest, and related queries",
    ),
});

// Keyword Difficulty Input Schemas
export const keywordDifficultyInputSchema = z.object({
  keywords: z
    .array(z.string())
    .min(1)
    .max(100)
    .describe("Array of 1-100 keywords to analyze difficulty"),
  languageName: z
    .string()
    .optional()
    .describe("Language name (e.g., 'English'). Defaults to 'English'"),
  locationName: z
    .string()
    .optional()
    .describe(
      "Location name (e.g., 'United States'). Defaults to 'United States'",
    ),
  languageCode: z
    .string()
    .optional()
    .describe("Language code (e.g., 'en'). Alternative to languageName"),
  locationCode: z
    .number()
    .optional()
    .describe("Location code (e.g., 2840 for US). Alternative to locationName"),
});

// Keyword Difficulty Output Schemas
export const keywordDifficultyOutputSchema = z.object({
  data: z
    .any()
    .describe(
      "Keyword difficulty score (0-100) with competitive metrics and ranking data",
    ),
});
