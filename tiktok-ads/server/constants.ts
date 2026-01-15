/**
 * TikTok Marketing API constants and configuration
 */

export const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

// API Endpoints
export const ENDPOINTS = {
  // Campaign endpoints
  CAMPAIGN_GET: `${TIKTOK_API_BASE}/campaign/get/`,
  CAMPAIGN_CREATE: `${TIKTOK_API_BASE}/campaign/create/`,
  CAMPAIGN_UPDATE: `${TIKTOK_API_BASE}/campaign/update/`,

  // Ad Group endpoints
  ADGROUP_GET: `${TIKTOK_API_BASE}/adgroup/get/`,
  ADGROUP_CREATE: `${TIKTOK_API_BASE}/adgroup/create/`,
  ADGROUP_UPDATE: `${TIKTOK_API_BASE}/adgroup/update/`,

  // Ad endpoints
  AD_GET: `${TIKTOK_API_BASE}/ad/get/`,
  AD_CREATE: `${TIKTOK_API_BASE}/ad/create/`,
  AD_UPDATE: `${TIKTOK_API_BASE}/ad/update/`,

  // Report endpoints
  REPORT_INTEGRATED: `${TIKTOK_API_BASE}/report/integrated/get/`,

  // Advertiser endpoints
  ADVERTISER_INFO: `${TIKTOK_API_BASE}/advertiser/info/`,
};

// Default pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 1000;

// Campaign objectives
export const CAMPAIGN_OBJECTIVES = {
  TRAFFIC: "TRAFFIC",
  APP_PROMOTION: "APP_PROMOTION",
  WEB_CONVERSIONS: "WEB_CONVERSIONS",
  PRODUCT_SALES: "PRODUCT_SALES",
  REACH: "REACH",
  VIDEO_VIEWS: "VIDEO_VIEWS",
  LEAD_GENERATION: "LEAD_GENERATION",
  COMMUNITY_INTERACTION: "COMMUNITY_INTERACTION",
} as const;

// Campaign status
export const CAMPAIGN_STATUS = {
  ENABLE: "ENABLE",
  DISABLE: "DISABLE",
  DELETE: "DELETE",
} as const;

// Ad Group status
export const ADGROUP_STATUS = {
  ENABLE: "ENABLE",
  DISABLE: "DISABLE",
  DELETE: "DELETE",
} as const;

// Ad status
export const AD_STATUS = {
  ENABLE: "ENABLE",
  DISABLE: "DISABLE",
  DELETE: "DELETE",
} as const;

// Budget modes
export const BUDGET_MODE = {
  BUDGET_MODE_INFINITE: "BUDGET_MODE_INFINITE",
  BUDGET_MODE_DAY: "BUDGET_MODE_DAY",
  BUDGET_MODE_TOTAL: "BUDGET_MODE_TOTAL",
} as const;

// Bid types
export const BID_TYPE = {
  BID_TYPE_NO_BID: "BID_TYPE_NO_BID",
  BID_TYPE_CUSTOM: "BID_TYPE_CUSTOM",
} as const;

// Optimization goals
export const OPTIMIZATION_GOAL = {
  CLICK: "CLICK",
  CONVERT: "CONVERT",
  SHOW: "SHOW",
  REACH: "REACH",
  VIDEO_VIEW: "VIDEO_VIEW",
  LEAD_GENERATION: "LEAD_GENERATION",
  ENGAGEMENT: "ENGAGEMENT",
} as const;

// Placement types
export const PLACEMENTS = {
  PLACEMENT_TIKTOK: "PLACEMENT_TIKTOK",
  PLACEMENT_PANGLE: "PLACEMENT_PANGLE",
  PLACEMENT_GLOBAL_APP_BUNDLE: "PLACEMENT_GLOBAL_APP_BUNDLE",
} as const;

// Report data levels
export const REPORT_DATA_LEVEL = {
  AUCTION_ADVERTISER: "AUCTION_ADVERTISER",
  AUCTION_CAMPAIGN: "AUCTION_CAMPAIGN",
  AUCTION_ADGROUP: "AUCTION_ADGROUP",
  AUCTION_AD: "AUCTION_AD",
} as const;

// Report dimensions
export const REPORT_DIMENSIONS = {
  ADVERTISER_ID: "advertiser_id",
  CAMPAIGN_ID: "campaign_id",
  ADGROUP_ID: "adgroup_id",
  AD_ID: "ad_id",
  STAT_TIME_DAY: "stat_time_day",
  STAT_TIME_HOUR: "stat_time_hour",
} as const;

// Common metrics for reports
export const REPORT_METRICS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "reach",
  "frequency",
  "conversion",
  "cost_per_conversion",
  "conversion_rate",
  "video_play_actions",
  "video_watched_2s",
  "video_watched_6s",
  "average_video_play",
  "average_video_play_per_user",
  "profile_visits",
  "likes",
  "comments",
  "shares",
  "follows",
] as const;
