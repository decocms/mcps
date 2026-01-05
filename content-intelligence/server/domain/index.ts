/**
 * Domain module exports
 *
 * This module exports all domain types, schemas, and utilities
 * for the Content Intelligence service.
 *
 * @module domain
 */

// Type definitions
export type {
  Source,
  SourceType,
  SourceConfig,
  RssSourceConfig,
  RedditSourceConfig,
  WebScraperSourceConfig,
  LinkedInSourceConfig,
  ContentItem,
  ContentCategory,
  ProcessingStatus,
  WeeklyDigest,
  DigestSection,
  TrendItem,
  ContentQuery,
  ContentQueryResult,
} from "./types.ts";

// Zod schemas for validation
export {
  // Enum schemas
  SourceTypeSchema,
  ContentCategorySchema,
  ProcessingStatusSchema,
  TrendMomentumSchema,

  // Config schemas
  SourceConfigSchema,
  RssSourceConfigSchema,
  RedditSourceConfigSchema,
  WebScraperSourceConfigSchema,
  LinkedInSourceConfigSchema,

  // Entity schemas
  SourceSchema,
  ContentItemSchema,
  TrendItemSchema,
  DigestSectionSchema,
  WeeklyDigestSchema,

  // Query schemas
  ContentQuerySchema,
  ContentQueryResultSchema,

  // Tool-specific schemas
  SearchContentInputSchema,
  SearchContentOutputSchema,
  GetWeeklyDigestInputSchema,
  GetWeeklyDigestOutputSchema,
  GetTrendsInputSchema,
  GetTrendsOutputSchema,
} from "./schemas.ts";
