/**
 * Content Intelligence Domain Models
 *
 * This file defines the core domain types that represent the business
 * entities of the Content Intelligence service.
 *
 * Design principles:
 * - Source-agnostic: Models should not leak implementation details of sources
 * - Extensible: New sources should be easy to add without changing core types
 * - Serializable: All types should be JSON-serializable for API/storage
 *
 * @module domain/types
 * @version 1.0.0
 */

/**
 * Supported content source types.
 * Each source type has its own connector implementation.
 */
export type SourceType = "rss" | "reddit" | "web_scraper" | "linkedin";

/**
 * Content categories for classification.
 * This is the initial set - can be extended based on domain needs.
 */
export type ContentCategory =
  | "technology"
  | "business"
  | "science"
  | "design"
  | "ai_ml"
  | "engineering"
  | "product"
  | "other";

/**
 * Processing status of a content item through the pipeline.
 */
export type ProcessingStatus =
  | "raw" // Just ingested, no processing
  | "normalized" // Normalized to common format
  | "enriched" // LLM enrichment complete
  | "failed"; // Processing failed

/**
 * Represents a configured content source.
 *
 * Each source is a unique combination of type + configuration
 * that defines where and how to fetch content.
 *
 * @example
 * // RSS feed source
 * const techCrunchSource: Source = {
 *   id: "techcrunch-rss",
 *   name: "TechCrunch",
 *   type: "rss",
 *   config: { feedUrl: "https://techcrunch.com/feed/" },
 *   enabled: true,
 *   createdAt: new Date().toISOString(),
 *   updatedAt: new Date().toISOString(),
 * };
 */
export interface Source {
  /** Unique identifier for the source */
  id: string;

  /** Human-readable name for the source */
  name: string;

  /** Source type determines which connector to use */
  type: SourceType;

  /**
   * Source-specific configuration.
   * Structure depends on source type.
   */
  config: SourceConfig;

  /** Whether this source is active for ingestion */
  enabled: boolean;

  /** Metadata about last fetch attempt */
  lastFetch?: {
    timestamp: string;
    itemCount: number;
    success: boolean;
    error?: string;
  };

  /** ISO 8601 timestamp */
  createdAt: string;

  /** ISO 8601 timestamp */
  updatedAt: string;
}

/**
 * Source-specific configuration types.
 * Uses discriminated union pattern for type safety.
 */
export type SourceConfig =
  | RssSourceConfig
  | RedditSourceConfig
  | WebScraperSourceConfig
  | LinkedInSourceConfig;

export interface RssSourceConfig {
  type: "rss";
  feedUrl: string;
  /** Optional: specific tags to filter by */
  filterTags?: string[];
}

export interface RedditSourceConfig {
  type: "reddit";
  subreddit: string;
  /** Sort order for posts */
  sortBy?: "hot" | "new" | "top" | "rising";
  /** Time filter for "top" sort */
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  /** Minimum upvotes threshold */
  minUpvotes?: number;
}

export interface WebScraperSourceConfig {
  type: "web_scraper";
  baseUrl: string;
  /** CSS selectors for content extraction */
  selectors: {
    articleList?: string;
    title: string;
    content: string;
    author?: string;
    date?: string;
    link?: string;
  };
  /** Pagination config if needed */
  pagination?: {
    type: "page_number" | "next_link" | "load_more";
    selector?: string;
    maxPages?: number;
  };
}

export interface LinkedInSourceConfig {
  type: "linkedin";
  /** Reserved for future implementation */
  profileUrl?: string;
  companyUrl?: string;
}

/**
 * Normalized content item from any source.
 *
 * This is the core domain model that all content is normalized to.
 * Source-specific metadata is preserved in the `sourceMetadata` field.
 *
 * @example
 * const article: ContentItem = {
 *   id: "ci_abc123",
 *   sourceId: "techcrunch-rss",
 *   sourceType: "rss",
 *   title: "AI Startup Raises $50M",
 *   content: "Full article text...",
 *   summary: "A startup focused on...",
 *   url: "https://techcrunch.com/...",
 *   author: "John Doe",
 *   publishedAt: "2024-01-15T10:30:00Z",
 *   fetchedAt: "2024-01-15T11:00:00Z",
 *   status: "enriched",
 *   categories: ["technology", "ai_ml"],
 *   relevanceScore: 0.85,
 *   tags: ["ai", "funding", "startup"],
 * };
 */
export interface ContentItem {
  /** Unique identifier (prefixed with `ci_`) */
  id: string;

  /** Reference to the source this came from */
  sourceId: string;

  /** Denormalized source type for quick filtering */
  sourceType: SourceType;

  /** Content title */
  title: string;

  /** Full content text (cleaned/extracted) */
  content: string;

  /** LLM-generated summary (populated after enrichment) */
  summary?: string;

  /** Original URL */
  url: string;

  /** Author name if available */
  author?: string;

  /** Original publication timestamp (ISO 8601) */
  publishedAt?: string;

  /** When we fetched this content (ISO 8601) */
  fetchedAt: string;

  /** Processing status */
  status: ProcessingStatus;

  /**
   * LLM-assigned categories (populated after enrichment).
   * Items can belong to multiple categories.
   */
  categories?: ContentCategory[];

  /**
   * LLM-computed relevance score (0-1).
   * Higher = more relevant based on configured criteria.
   */
  relevanceScore?: number;

  /** Extracted or LLM-generated tags */
  tags?: string[];

  /**
   * Semantic fingerprint for deduplication.
   * Generated from content embedding or hash.
   */
  semanticHash?: string;

  /**
   * IDs of semantically similar content items.
   * Populated during deduplication phase.
   */
  duplicateOf?: string[];

  /**
   * Source-specific metadata preserved from ingestion.
   * Structure depends on source type.
   */
  sourceMetadata?: Record<string, unknown>;

  /** Processing errors if status is 'failed' */
  processingErrors?: string[];
}

/**
 * Weekly digest aggregating content from a time period.
 *
 * Generated by the digest job, this provides a curated view
 * of the most relevant content from the week.
 */
export interface WeeklyDigest {
  /** Unique identifier (prefixed with `wd_`) */
  id: string;

  /** Digest title (e.g., "Week of Jan 15, 2024") */
  title: string;

  /** Start of the period covered (ISO 8601) */
  periodStart: string;

  /** End of the period covered (ISO 8601) */
  periodEnd: string;

  /** When this digest was generated (ISO 8601) */
  generatedAt: string;

  /**
   * LLM-generated executive summary of the week.
   * High-level overview of main themes and trends.
   */
  executiveSummary: string;

  /**
   * Content grouped by category with summaries.
   */
  sections: DigestSection[];

  /**
   * Top content items included in digest (references).
   */
  topContentIds: string[];

  /**
   * Identified trends for the period.
   */
  trends: TrendItem[];

  /** Statistics about the digest */
  stats: {
    totalItems: number;
    itemsBySource: Record<string, number>;
    itemsByCategory: Record<string, number>;
    averageRelevanceScore: number;
  };
}

/**
 * Section within a weekly digest, grouped by category.
 */
export interface DigestSection {
  /** Category this section covers */
  category: ContentCategory;

  /** LLM-generated summary for this category */
  summary: string;

  /** Key highlights/takeaways */
  highlights: string[];

  /** Content item IDs included in this section */
  contentIds: string[];
}

/**
 * Represents an identified trend across content.
 */
export interface TrendItem {
  /** Trend identifier */
  id: string;

  /** Human-readable trend name */
  name: string;

  /** Description of the trend */
  description: string;

  /** Trend momentum: rising, stable, or declining */
  momentum: "rising" | "stable" | "declining";

  /** Related content item IDs */
  relatedContentIds: string[];

  /** Related tags/keywords */
  relatedTags: string[];

  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Search/filter options for querying content.
 */
export interface ContentQuery {
  /** Free text search query */
  query?: string;

  /** Filter by source IDs */
  sourceIds?: string[];

  /** Filter by source types */
  sourceTypes?: SourceType[];

  /** Filter by categories */
  categories?: ContentCategory[];

  /** Filter by tags */
  tags?: string[];

  /** Minimum relevance score */
  minRelevanceScore?: number;

  /** Date range filter */
  dateRange?: {
    from?: string;
    to?: string;
  };

  /** Only return enriched content */
  enrichedOnly?: boolean;

  /** Exclude duplicate content */
  excludeDuplicates?: boolean;

  /** Pagination */
  pagination?: {
    offset?: number;
    limit?: number;
  };

  /** Sort options */
  sort?: {
    field: "publishedAt" | "fetchedAt" | "relevanceScore";
    order: "asc" | "desc";
  };
}

/**
 * Paginated response for content queries.
 */
export interface ContentQueryResult {
  items: ContentItem[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
