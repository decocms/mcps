/**
 * Meta Graph API Constants
 */

// API Version
export const META_API_VERSION = "v21.0";

// Facebook App ID (public - appears in OAuth URLs)
export const META_APP_ID = "1471509347872521";

// Base URLs
export const META_GRAPH_API_URL = `https://graph.facebook.com/${META_API_VERSION}`;
export const META_OAUTH_URL = "https://www.facebook.com";

// OAuth Scopes required for Ads Analytics
export const META_ADS_SCOPES = [
  "ads_read", // Read ad account info, campaigns, ad sets, ads, and insights
  "ads_management", // Manage ads (required for some operations)
  "pages_read_engagement", // Read page info for ad context
  "business_management", // Access business accounts
].join(",");

// Default fields for different objects
export const ACCOUNT_FIELDS = [
  "id",
  "name",
  "account_id",
  "account_status",
  "currency",
  "timezone_name",
  "timezone_offset_hours_utc",
  "business_name",
  "amount_spent",
  "spend_cap",
  "balance",
  "min_campaign_group_spend_cap",
  "min_daily_budget",
].join(",");

export const CAMPAIGN_FIELDS = [
  "id",
  "name",
  "objective",
  "status",
  "effective_status",
  "created_time",
  "updated_time",
  "start_time",
  "stop_time",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "buying_type",
  "special_ad_categories",
].join(",");

export const ADSET_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "created_time",
  "updated_time",
  "start_time",
  "end_time",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "bid_amount",
  "bid_strategy",
  "billing_event",
  "optimization_goal",
  "targeting",
  "promoted_object",
].join(",");

export const AD_FIELDS = [
  "id",
  "name",
  "adset_id",
  "campaign_id",
  "status",
  "effective_status",
  "created_time",
  "updated_time",
  "creative",
  "tracking_specs",
  "conversion_specs",
].join(",");

export const CREATIVE_FIELDS = [
  "id",
  "name",
  "title",
  "body",
  "call_to_action_type",
  "image_url",
  "image_hash",
  "video_id",
  "link_url",
  "object_story_spec",
  "thumbnail_url",
  "effective_object_story_id",
].join(",");

// Insights metrics
export const INSIGHTS_FIELDS = [
  // Performance metrics
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "unique_clicks",
  "ctr",
  "unique_ctr",
  "cpc",
  "cpm",
  "cpp",
  // Cost metrics
  "spend",
  "cost_per_unique_click",
  // Engagement metrics
  "actions",
  "action_values",
  "conversions",
  "cost_per_action_type",
  "cost_per_conversion",
  // Video metrics
  "video_play_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  // Other
  "social_spend",
  "website_ctr",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "outbound_clicks",
  "outbound_clicks_ctr",
].join(",");

// Valid breakdowns for insights
export const VALID_BREAKDOWNS = [
  "age",
  "gender",
  "country",
  "region",
  "dma",
  "impression_device",
  "device_platform",
  "platform_position",
  "publisher_platform",
  "product_id",
] as const;

// Time presets for insights
export const TIME_PRESETS = [
  "today",
  "yesterday",
  "this_month",
  "last_month",
  "this_quarter",
  "lifetime",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "last_week_mon_sun",
  "last_week_sun_sat",
  "last_quarter",
  "last_year",
  "this_week_mon_today",
  "this_week_sun_today",
  "this_year",
] as const;

// Campaign statuses
export const CAMPAIGN_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "DELETED",
  "ARCHIVED",
] as const;

// Account statuses
export const ACCOUNT_STATUSES = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
} as const;
