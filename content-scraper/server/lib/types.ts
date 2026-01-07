/**
 * Shared types for the Content Scraper MCP
 */

export interface ContentProcessingResult {
  url: string;
  status: "new" | "updated" | "unchanged" | "error";
  title?: string;
  summary?: string;
  fingerprint?: string;
  domain?: string;
  error?: string;
  previousFingerprint?: string;
}

export interface ProcessUrlsInput {
  urls: string[];
  generateSummaries?: boolean;
}

export interface ProcessUrlsOutput {
  processed: ContentProcessingResult[];
  stats: {
    total: number;
    new: number;
    updated: number;
    unchanged: number;
    errors: number;
  };
}

export interface CheckUpdatesInput {
  domain?: string;
  urls?: string[];
}

export interface CheckUpdatesOutput {
  updates: Array<{
    url: string;
    domain: string;
    hasChanges: boolean;
    lastSeenAt: string;
    updatedCount: number;
  }>;
}

export interface GetWatermarksInput {
  domain?: string;
}

export interface GetWatermarksOutput {
  watermarks: Array<{
    domain: string;
    lastProcessedAt: string;
  }>;
}
