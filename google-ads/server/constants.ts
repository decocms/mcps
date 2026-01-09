/**
 * Google Ads API constants and configuration
 */

/**
 * Google Ads API version
 */
export const GOOGLE_ADS_API_VERSION = "v18";

/**
 * Google Ads API base URL
 */
export const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

/**
 * API Endpoints for Google Ads
 */
export const ENDPOINTS = {
  /**
   * List accessible customers for the authenticated user
   * GET https://googleads.googleapis.com/v18/customers:listAccessibleCustomers
   */
  LIST_ACCESSIBLE_CUSTOMERS: `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,

  /**
   * Get customer details
   * @param customerId - The customer ID (e.g., "1234567890")
   */
  CUSTOMER: (customerId: string) =>
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}`,

  /**
   * Search with GAQL query
   * POST https://googleads.googleapis.com/v18/customers/{customerId}/googleAds:search
   * @param customerId - The customer ID
   */
  SEARCH: (customerId: string) =>
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,

  /**
   * Search stream with GAQL query (for large result sets)
   * POST https://googleads.googleapis.com/v18/customers/{customerId}/googleAds:searchStream
   * @param customerId - The customer ID
   */
  SEARCH_STREAM: (customerId: string) =>
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`,

  /**
   * Mutate campaigns
   * POST https://googleads.googleapis.com/v18/customers/{customerId}/campaigns:mutate
   * @param customerId - The customer ID
   */
  CAMPAIGNS_MUTATE: (customerId: string) =>
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/campaigns:mutate`,

  /**
   * Mutate campaign budgets
   * POST https://googleads.googleapis.com/v18/customers/{customerId}/campaignBudgets:mutate
   * @param customerId - The customer ID
   */
  CAMPAIGN_BUDGETS_MUTATE: (customerId: string) =>
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/campaignBudgets:mutate`,

  /**
   * Mutate ad groups
   * POST https://googleads.googleapis.com/v18/customers/{customerId}/adGroups:mutate
   * @param customerId - The customer ID
   */
  AD_GROUPS_MUTATE: (customerId: string) =>
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/adGroups:mutate`,

  /**
   * Mutate ad group ads
   * POST https://googleads.googleapis.com/v18/customers/{customerId}/adGroupAds:mutate
   * @param customerId - The customer ID
   */
  AD_GROUP_ADS_MUTATE: (customerId: string) =>
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/adGroupAds:mutate`,

  /**
   * Mutate ad group criteria (keywords, etc.)
   * POST https://googleads.googleapis.com/v18/customers/{customerId}/adGroupCriteria:mutate
   * @param customerId - The customer ID
   */
  AD_GROUP_CRITERIA_MUTATE: (customerId: string) =>
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/adGroupCriteria:mutate`,
};

/**
 * Default page size for queries
 */
export const DEFAULT_PAGE_SIZE = 1000;

/**
 * Campaign status values
 */
export const CAMPAIGN_STATUS = {
  ENABLED: "ENABLED",
  PAUSED: "PAUSED",
  REMOVED: "REMOVED",
} as const;

/**
 * Ad group status values
 */
export const AD_GROUP_STATUS = {
  ENABLED: "ENABLED",
  PAUSED: "PAUSED",
  REMOVED: "REMOVED",
} as const;

/**
 * Ad status values
 */
export const AD_STATUS = {
  ENABLED: "ENABLED",
  PAUSED: "PAUSED",
  REMOVED: "REMOVED",
} as const;

/**
 * Keyword match types
 */
export const KEYWORD_MATCH_TYPE = {
  EXACT: "EXACT",
  PHRASE: "PHRASE",
  BROAD: "BROAD",
} as const;

/**
 * Advertising channel types
 */
export const ADVERTISING_CHANNEL_TYPE = {
  SEARCH: "SEARCH",
  DISPLAY: "DISPLAY",
  SHOPPING: "SHOPPING",
  VIDEO: "VIDEO",
  PERFORMANCE_MAX: "PERFORMANCE_MAX",
  DEMAND_GEN: "DEMAND_GEN",
  LOCAL: "LOCAL",
  SMART: "SMART",
  HOTEL: "HOTEL",
  LOCAL_SERVICES: "LOCAL_SERVICES",
  TRAVEL: "TRAVEL",
  DISCOVERY: "DISCOVERY",
} as const;

/**
 * Bidding strategy types
 */
export const BIDDING_STRATEGY_TYPE = {
  MANUAL_CPC: "MANUAL_CPC",
  MANUAL_CPM: "MANUAL_CPM",
  MANUAL_CPV: "MANUAL_CPV",
  MAXIMIZE_CONVERSIONS: "MAXIMIZE_CONVERSIONS",
  MAXIMIZE_CONVERSION_VALUE: "MAXIMIZE_CONVERSION_VALUE",
  TARGET_CPA: "TARGET_CPA",
  TARGET_ROAS: "TARGET_ROAS",
  TARGET_SPEND: "TARGET_SPEND",
  TARGET_IMPRESSION_SHARE: "TARGET_IMPRESSION_SHARE",
  ENHANCED_CPC: "ENHANCED_CPC",
} as const;

/**
 * Budget delivery methods
 */
export const BUDGET_DELIVERY_METHOD = {
  STANDARD: "STANDARD",
  ACCELERATED: "ACCELERATED",
} as const;

/**
 * Ad group types
 */
export const AD_GROUP_TYPE = {
  SEARCH_STANDARD: "SEARCH_STANDARD",
  DISPLAY_STANDARD: "DISPLAY_STANDARD",
  SHOPPING_PRODUCT_ADS: "SHOPPING_PRODUCT_ADS",
  VIDEO_TRUE_VIEW_IN_STREAM: "VIDEO_TRUE_VIEW_IN_STREAM",
  VIDEO_BUMPER: "VIDEO_BUMPER",
  VIDEO_RESPONSIVE: "VIDEO_RESPONSIVE",
} as const;

/**
 * Common GAQL queries
 */
export const GAQL_QUERIES = {
  /**
   * List all campaigns with basic info
   */
  LIST_CAMPAIGNS: `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.advertising_channel_sub_type,
      campaign.bidding_strategy_type,
      campaign.start_date,
      campaign.end_date,
      campaign.campaign_budget,
      campaign.serving_status
    FROM campaign
    ORDER BY campaign.name
  `,

  /**
   * List campaigns with performance metrics
   */
  LIST_CAMPAIGNS_WITH_METRICS: `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY campaign.name
  `,

  /**
   * List all ad groups with basic info
   */
  LIST_AD_GROUPS: `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.campaign,
      ad_group.status,
      ad_group.type,
      ad_group.cpc_bid_micros
    FROM ad_group
    ORDER BY ad_group.name
  `,

  /**
   * List ad groups for a specific campaign
   */
  LIST_AD_GROUPS_BY_CAMPAIGN: (campaignId: string) => `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.campaign,
      ad_group.status,
      ad_group.type,
      ad_group.cpc_bid_micros
    FROM ad_group
    WHERE campaign.id = ${campaignId}
    ORDER BY ad_group.name
  `,

  /**
   * List all ads with basic info
   */
  LIST_ADS: `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad_group,
      ad_group_ad.status,
      ad_group_ad.policy_summary.approval_status
    FROM ad_group_ad
    ORDER BY ad_group_ad.ad.id
  `,

  /**
   * List ads for a specific ad group
   */
  LIST_ADS_BY_AD_GROUP: (adGroupId: string) => `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad_group,
      ad_group_ad.status,
      ad_group_ad.policy_summary.approval_status
    FROM ad_group_ad
    WHERE ad_group.id = ${adGroupId}
    ORDER BY ad_group_ad.ad.id
  `,

  /**
   * List keywords for an ad group
   */
  LIST_KEYWORDS: `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.ad_group,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.cpc_bid_micros,
      ad_group_criterion.negative
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD'
    ORDER BY ad_group_criterion.keyword.text
  `,

  /**
   * List keywords for a specific ad group
   */
  LIST_KEYWORDS_BY_AD_GROUP: (adGroupId: string) => `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.ad_group,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.cpc_bid_micros,
      ad_group_criterion.negative,
      ad_group_criterion.quality_info.quality_score
    FROM ad_group_criterion
    WHERE ad_group.id = ${adGroupId}
      AND ad_group_criterion.type = 'KEYWORD'
    ORDER BY ad_group_criterion.keyword.text
  `,

  /**
   * Get account performance report
   */
  ACCOUNT_PERFORMANCE_REPORT: (dateRange: string) => `
    SELECT
      customer.id,
      customer.descriptive_name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm
    FROM customer
    WHERE segments.date DURING ${dateRange}
  `,

  /**
   * Get campaign performance report
   */
  CAMPAIGN_PERFORMANCE_REPORT: (dateRange: string) => `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date DURING ${dateRange}
    ORDER BY segments.date DESC
  `,

  /**
   * Get customer (account) details
   */
  GET_CUSTOMER: `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.tracking_url_template,
      customer.auto_tagging_enabled,
      customer.manager,
      customer.test_account
    FROM customer
    LIMIT 1
  `,
} as const;

/**
 * Date range presets for reports
 */
export const DATE_RANGE_PRESETS = {
  TODAY: "TODAY",
  YESTERDAY: "YESTERDAY",
  LAST_7_DAYS: "LAST_7_DAYS",
  LAST_14_DAYS: "LAST_14_DAYS",
  LAST_30_DAYS: "LAST_30_DAYS",
  LAST_90_DAYS: "LAST_90_DAYS",
  THIS_WEEK_SUN_TODAY: "THIS_WEEK_SUN_TODAY",
  THIS_WEEK_MON_TODAY: "THIS_WEEK_MON_TODAY",
  LAST_WEEK_SUN_SAT: "LAST_WEEK_SUN_SAT",
  LAST_WEEK_MON_SUN: "LAST_WEEK_MON_SUN",
  THIS_MONTH: "THIS_MONTH",
  LAST_MONTH: "LAST_MONTH",
  ALL_TIME: "ALL_TIME",
} as const;
