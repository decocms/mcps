/**
 * Google Search Console API constants and configuration
 */

export const GOOGLE_SEARCH_CONSOLE_API_BASE =
  "https://www.googleapis.com/webmasters/v3";

export const GOOGLE_SEARCH_CONSOLE_V1_API_BASE =
  "https://searchconsole.googleapis.com/v1";

// API Endpoints
export const ENDPOINTS = {
  // Sites endpoints
  SITES: `${GOOGLE_SEARCH_CONSOLE_API_BASE}/sites`,
  SITE: (siteUrl: string) =>
    `${GOOGLE_SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}`,

  // Search Analytics endpoints
  SEARCH_ANALYTICS_QUERY: (siteUrl: string) =>
    `${GOOGLE_SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,

  // Sitemaps endpoints
  SITEMAPS: (siteUrl: string) =>
    `${GOOGLE_SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
  SITEMAP: (siteUrl: string, feedpath: string) =>
    `${GOOGLE_SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,

  // URL Inspection endpoint (v1 API)
  URL_INSPECTION: `${GOOGLE_SEARCH_CONSOLE_V1_API_BASE}/urlInspection/index:inspect`,
};

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  WEBMASTERS: "https://www.googleapis.com/auth/webmasters",
  WEBMASTERS_READONLY: "https://www.googleapis.com/auth/webmasters.readonly",
} as const;

// Search Analytics dimensions
export const SEARCH_ANALYTICS_DIMENSIONS = {
  DATE: "date",
  QUERY: "query",
  PAGE: "page",
  COUNTRY: "country",
  DEVICE: "device",
  SEARCH_APPEARANCE: "searchAppearance",
} as const;

// Search Analytics aggregation types
export const AGGREGATION_TYPES = {
  AUTO: "auto",
  BY_PROPERTY: "byProperty",
  BY_PAGE: "byPage",
} as const;

// Device types
export const DEVICE_TYPES = {
  DESKTOP: "DESKTOP",
  MOBILE: "MOBILE",
  TABLET: "TABLET",
} as const;

// Default values
export const DEFAULT_ROW_LIMIT = 1000;
export const DEFAULT_START_ROW = 0;
