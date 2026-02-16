/**
 * Google Search Console API types
 */

// ========================================
// Sites Types
// ========================================

export interface SiteEntry {
  siteUrl: string;
  permissionLevel:
    | "siteOwner"
    | "siteFullUser"
    | "siteRestrictedUser"
    | "siteUnverifiedUser";
}

export interface SitesListResponse {
  siteEntry?: SiteEntry[];
}

// ========================================
// Search Analytics Types
// ========================================

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsResponse {
  responseAggregationType: "auto" | "byProperty" | "byPage";
  rows?: SearchAnalyticsRow[];
}

export interface SearchAnalyticsRequest {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions?: string[]; // e.g., ["query", "page", "country", "device"]
  dimensionFilterGroups?: Array<{
    groupType?: "and" | "or";
    filters: Array<{
      dimension: string;
      operator:
        | "equals"
        | "notEquals"
        | "contains"
        | "notContains"
        | "includingRegex"
        | "excludingRegex";
      expression: string;
    }>;
  }>;
  rowLimit?: number;
  startRow?: number;
  searchType?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
  aggregationType?: "auto" | "byProperty" | "byPage";
}

// ========================================
// Sitemaps Types
// ========================================

export interface SitemapContent {
  type: string;
  submitted: string;
}

export interface Sitemap {
  path: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  lastDownloaded?: string;
  warnings?: string;
  errors?: string;
  contents?: SitemapContent[];
}

export interface SitemapsListResponse {
  sitemap?: Sitemap[];
}

// ========================================
// URL Inspection Types
// ========================================

export type Verdict =
  | "PASS"
  | "PARTIAL"
  | "FAIL"
  | "NEUTRAL"
  | "VERDICT_UNSPECIFIED";

export type RobotsTxtState =
  | "ALLOWED"
  | "DISALLOWED"
  | "HTTP_503"
  | "NOT_FETCHED"
  | "ROBOTS_TXT_STATE_UNSPECIFIED";

export type IndexingState =
  | "INDEXING_ALLOWED"
  | "INDEXING_ALLOWED_WITH_WARNING"
  | "INDEXING_DISALLOWED"
  | "BLOCKED_BY_NOINDEX"
  | "BLOCKED_BY_ROBOTS_TXT"
  | "INDEXING_STATE_UNSPECIFIED";

export type PageFetchState =
  | "SUCCESSFUL"
  | "SOFT_404"
  | "BLOCKED_ROBOTS_TXT"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "SERVER_ERROR"
  | "REDIRECT_ERROR"
  | "ACCESS_FORBIDDEN"
  | "BLOCKED_4XX"
  | "INTERNAL_CRAWL_ERROR"
  | "INVALID_URL"
  | "PAGE_FETCH_STATE_UNSPECIFIED";

export type CrawlingUserAgent =
  | "CRAWLING_USER_AGENT_UNSPECIFIED"
  | "DESKTOP"
  | "MOBILE";

export interface IndexStatusInspectionResult {
  verdict?: Verdict;
  coverageState?: string;
  robotsTxtState?: RobotsTxtState;
  indexingState?: IndexingState;
  lastCrawlTime?: string;
  pageFetchState?: PageFetchState;
  googleCanonical?: string;
  userCanonical?: string;
  crawledAs?: CrawlingUserAgent;
  referringUrls?: string[];
  sitemap?: string[];
}

export interface AmpInspectionResult {
  verdict?: Verdict;
  issues?: Array<{
    severity: "ERROR" | "WARNING" | "INFO";
    issueMessage?: string;
  }>;
  ampIndexStateVerdict?: Verdict;
  indexStatusVerdict?: Verdict;
  lastAmpCrawlTime?: string;
  lastAmpIndexTime?: string;
  ampUrl?: string;
  ampIndexState?: string;
}

export interface MobileUsabilityInspectionResult {
  verdict?: Verdict;
  issues?: Array<{
    severity: "ERROR" | "WARNING" | "INFO";
    issueMessage?: string;
  }>;
}

export interface RichResultsInspectionResult {
  verdict?: Verdict;
  detectedItems?: Array<{
    richResultType?: string;
    items?: Array<{
      name?: string;
      invalidArgument?: string;
    }>;
  }>;
}

export interface UrlInspectionResult {
  inspectionResult?: {
    inspectionResultLink?: string;
    indexStatusResult?: IndexStatusInspectionResult;
    ampResult?: AmpInspectionResult;
    mobileUsabilityResult?: MobileUsabilityInspectionResult;
    richResultsResult?: RichResultsInspectionResult;
  };
}

export interface InspectUrlRequest {
  siteUrl: string;
  inspectionUrl: string;
  languageCode?: string;
}

// ========================================
// Client Input Types
// ========================================

export interface QuerySearchAnalyticsInput {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  dimensionFilterGroups?: SearchAnalyticsRequest["dimensionFilterGroups"];
  rowLimit?: number;
  startRow?: number;
  searchType?: SearchAnalyticsRequest["searchType"];
  aggregationType?: SearchAnalyticsRequest["aggregationType"];
}

export interface ListSitemapsInput {
  siteUrl: string;
}

export interface GetSitemapInput {
  siteUrl: string;
  feedpath: string;
}

export interface SubmitSitemapInput {
  siteUrl: string;
  feedpath: string;
}

export interface DeleteSitemapInput {
  siteUrl: string;
  feedpath: string;
}

export interface InspectUrlInput {
  siteUrl: string;
  inspectionUrl: string;
  languageCode?: string;
}
