/**
 * Google Ads API types
 * Based on Google Ads API v18 specification
 */

// ============================================================================
// Enums and Status Types
// ============================================================================

/**
 * Campaign status
 */
export type CampaignStatus =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "ENABLED"
  | "PAUSED"
  | "REMOVED";

/**
 * Ad group status
 */
export type AdGroupStatus =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "ENABLED"
  | "PAUSED"
  | "REMOVED";

/**
 * Ad group ad status
 */
export type AdGroupAdStatus =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "ENABLED"
  | "PAUSED"
  | "REMOVED";

/**
 * Keyword match type
 */
export type KeywordMatchType =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "EXACT"
  | "PHRASE"
  | "BROAD";

/**
 * Keyword status
 */
export type AdGroupCriterionStatus =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "ENABLED"
  | "PAUSED"
  | "REMOVED";

/**
 * Advertising channel type
 */
export type AdvertisingChannelType =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "SEARCH"
  | "DISPLAY"
  | "SHOPPING"
  | "HOTEL"
  | "VIDEO"
  | "MULTI_CHANNEL"
  | "LOCAL"
  | "SMART"
  | "PERFORMANCE_MAX"
  | "LOCAL_SERVICES"
  | "DISCOVERY"
  | "TRAVEL"
  | "DEMAND_GEN";

/**
 * Advertising channel sub type
 */
export type AdvertisingChannelSubType =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "SEARCH_MOBILE_APP"
  | "DISPLAY_MOBILE_APP"
  | "SEARCH_EXPRESS"
  | "DISPLAY_EXPRESS"
  | "SHOPPING_SMART_ADS"
  | "DISPLAY_GMAIL_AD"
  | "DISPLAY_SMART_CAMPAIGN"
  | "VIDEO_OUTSTREAM"
  | "VIDEO_ACTION"
  | "VIDEO_NON_SKIPPABLE"
  | "APP_CAMPAIGN"
  | "APP_CAMPAIGN_FOR_ENGAGEMENT"
  | "LOCAL_CAMPAIGN"
  | "SHOPPING_COMPARISON_LISTING_ADS"
  | "SMART_CAMPAIGN"
  | "VIDEO_SEQUENCE"
  | "APP_CAMPAIGN_FOR_PRE_REGISTRATION"
  | "VIDEO_REACH_TARGET_FREQUENCY"
  | "TRAVEL_ACTIVITIES"
  | "SOCIAL";

/**
 * Bidding strategy type
 */
export type BiddingStrategyType =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "COMMISSION"
  | "ENHANCED_CPC"
  | "INVALID"
  | "MANUAL_CPA"
  | "MANUAL_CPC"
  | "MANUAL_CPM"
  | "MANUAL_CPV"
  | "MAXIMIZE_CONVERSIONS"
  | "MAXIMIZE_CONVERSION_VALUE"
  | "PAGE_ONE_PROMOTED"
  | "PERCENT_CPC"
  | "TARGET_CPA"
  | "TARGET_CPM"
  | "TARGET_IMPRESSION_SHARE"
  | "TARGET_OUTRANK_SHARE"
  | "TARGET_ROAS"
  | "TARGET_SPEND";

/**
 * Ad type
 */
export type AdType =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "TEXT_AD"
  | "EXPANDED_TEXT_AD"
  | "CALL_ONLY_AD"
  | "EXPANDED_DYNAMIC_SEARCH_AD"
  | "HOTEL_AD"
  | "SHOPPING_SMART_AD"
  | "SHOPPING_PRODUCT_AD"
  | "VIDEO_AD"
  | "GMAIL_AD"
  | "IMAGE_AD"
  | "RESPONSIVE_SEARCH_AD"
  | "LEGACY_RESPONSIVE_DISPLAY_AD"
  | "APP_AD"
  | "LEGACY_APP_INSTALL_AD"
  | "RESPONSIVE_DISPLAY_AD"
  | "LOCAL_AD"
  | "HTML5_UPLOAD_AD"
  | "DYNAMIC_HTML5_AD"
  | "APP_ENGAGEMENT_AD"
  | "SHOPPING_COMPARISON_LISTING_AD"
  | "VIDEO_BUMPER_AD"
  | "VIDEO_NON_SKIPPABLE_IN_STREAM_AD"
  | "VIDEO_OUTSTREAM_AD"
  | "VIDEO_TRUEVIEW_DISCOVERY_AD"
  | "VIDEO_TRUEVIEW_IN_STREAM_AD"
  | "VIDEO_RESPONSIVE_AD"
  | "SMART_CAMPAIGN_AD"
  | "APP_PRE_REGISTRATION_AD"
  | "DISCOVERY_MULTI_ASSET_AD"
  | "DISCOVERY_CAROUSEL_AD"
  | "DISCOVERY_VIDEO_RESPONSIVE_AD"
  | "TRAVEL_AD"
  | "DEMAND_GEN_PRODUCT_AD"
  | "DEMAND_GEN_MULTI_ASSET_AD"
  | "DEMAND_GEN_CAROUSEL_AD"
  | "DEMAND_GEN_VIDEO_RESPONSIVE_AD";

/**
 * Budget delivery method
 */
export type BudgetDeliveryMethod =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "STANDARD"
  | "ACCELERATED";

/**
 * Campaign serving status
 */
export type CampaignServingStatus =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "SERVING"
  | "NONE"
  | "ENDED"
  | "PENDING"
  | "SUSPENDED";

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Customer account
 */
export interface Customer {
  resourceName: string;
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  trackingUrlTemplate?: string;
  finalUrlSuffix?: string;
  autoTaggingEnabled?: boolean;
  hasPartnersBadge?: boolean;
  manager?: boolean;
  testAccount?: boolean;
  conversionTrackingId?: string;
  remarketingId?: string;
}

/**
 * Accessible customer (for list accessible customers)
 */
export interface AccessibleCustomer {
  resourceName: string;
}

/**
 * Campaign budget
 */
export interface CampaignBudget {
  resourceName: string;
  id: string;
  name: string;
  amountMicros: string;
  deliveryMethod: BudgetDeliveryMethod;
  explicitlyShared?: boolean;
  referenceCount?: string;
  totalAmountMicros?: string;
  status?: "UNSPECIFIED" | "UNKNOWN" | "ENABLED" | "REMOVED";
}

/**
 * Campaign
 */
export interface Campaign {
  resourceName: string;
  id: string;
  name: string;
  status: CampaignStatus;
  servingStatus?: CampaignServingStatus;
  advertisingChannelType: AdvertisingChannelType;
  advertisingChannelSubType?: AdvertisingChannelSubType;
  biddingStrategyType?: BiddingStrategyType;
  startDate?: string;
  endDate?: string;
  campaignBudget?: string;
  targetCpa?: {
    targetCpaMicros?: string;
    cpcBidCeilingMicros?: string;
    cpcBidFloorMicros?: string;
  };
  targetRoas?: {
    targetRoas?: number;
    cpcBidCeilingMicros?: string;
    cpcBidFloorMicros?: string;
  };
  maximizeConversions?: {
    targetCpaMicros?: string;
    cpcBidCeilingMicros?: string;
    cpcBidFloorMicros?: string;
  };
  maximizeConversionValue?: {
    targetRoas?: number;
    cpcBidCeilingMicros?: string;
    cpcBidFloorMicros?: string;
  };
  manualCpc?: {
    enhancedCpcEnabled?: boolean;
  };
  manualCpm?: Record<string, never>;
  targetSpend?: {
    targetSpendMicros?: string;
    cpcBidCeilingMicros?: string;
  };
  networkSettings?: {
    targetGoogleSearch?: boolean;
    targetSearchNetwork?: boolean;
    targetContentNetwork?: boolean;
    targetPartnerSearchNetwork?: boolean;
  };
  geoTargetTypeSetting?: {
    positiveGeoTargetType?: string;
    negativeGeoTargetType?: string;
  };
  urlCustomParameters?: Array<{
    key: string;
    value: string;
  }>;
  trackingUrlTemplate?: string;
  finalUrlSuffix?: string;
  labels?: string[];
}

/**
 * Ad group
 */
export interface AdGroup {
  resourceName: string;
  id: string;
  name: string;
  campaign: string;
  status: AdGroupStatus;
  type?: AdGroupType;
  cpcBidMicros?: string;
  cpmBidMicros?: string;
  targetCpaMicros?: string;
  targetRoas?: number;
  percentCpcBidMicros?: string;
  effectiveTargetCpaMicros?: string;
  effectiveTargetRoas?: number;
  labels?: string[];
  trackingUrlTemplate?: string;
  urlCustomParameters?: Array<{
    key: string;
    value: string;
  }>;
  finalUrlSuffix?: string;
}

/**
 * Ad group type
 */
export type AdGroupType =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "SEARCH_STANDARD"
  | "DISPLAY_STANDARD"
  | "SHOPPING_PRODUCT_ADS"
  | "HOTEL_ADS"
  | "SHOPPING_SMART_ADS"
  | "VIDEO_BUMPER"
  | "VIDEO_TRUE_VIEW_IN_STREAM"
  | "VIDEO_TRUE_VIEW_IN_DISPLAY"
  | "VIDEO_NON_SKIPPABLE_IN_STREAM"
  | "VIDEO_OUTSTREAM"
  | "SEARCH_DYNAMIC_ADS"
  | "SHOPPING_COMPARISON_LISTING_ADS"
  | "PROMOTED_HOTEL_ADS"
  | "VIDEO_RESPONSIVE"
  | "VIDEO_EFFICIENT_REACH"
  | "SMART_CAMPAIGN_ADS"
  | "TRAVEL_ADS";

/**
 * Ad - containing the ad details
 */
export interface Ad {
  resourceName: string;
  id: string;
  type: AdType;
  finalUrls?: string[];
  finalMobileUrls?: string[];
  displayUrl?: string;
  trackingUrlTemplate?: string;
  urlCustomParameters?: Array<{
    key: string;
    value: string;
  }>;
  finalUrlSuffix?: string;
  name?: string;
  responsiveSearchAd?: ResponsiveSearchAd;
  responsiveDisplayAd?: ResponsiveDisplayAd;
  expandedTextAd?: ExpandedTextAd;
}

/**
 * Responsive search ad
 */
export interface ResponsiveSearchAd {
  headlines: Array<{
    text: string;
    pinnedField?:
      | "UNSPECIFIED"
      | "UNKNOWN"
      | "HEADLINE_1"
      | "HEADLINE_2"
      | "HEADLINE_3";
  }>;
  descriptions: Array<{
    text: string;
    pinnedField?: "UNSPECIFIED" | "UNKNOWN" | "DESCRIPTION_1" | "DESCRIPTION_2";
  }>;
  path1?: string;
  path2?: string;
}

/**
 * Responsive display ad
 */
export interface ResponsiveDisplayAd {
  marketingImages?: Array<{
    asset: string;
  }>;
  squareMarketingImages?: Array<{
    asset: string;
  }>;
  logoImages?: Array<{
    asset: string;
  }>;
  squareLogoImages?: Array<{
    asset: string;
  }>;
  headlines: Array<{
    text: string;
  }>;
  longHeadline: {
    text: string;
  };
  descriptions: Array<{
    text: string;
  }>;
  businessName: string;
  callToActionText?: string;
  mainColor?: string;
  accentColor?: string;
}

/**
 * Expanded text ad (legacy)
 */
export interface ExpandedTextAd {
  headlinePart1: string;
  headlinePart2: string;
  headlinePart3?: string;
  description: string;
  description2?: string;
  path1?: string;
  path2?: string;
}

/**
 * Ad group ad (combination of ad group and ad)
 */
export interface AdGroupAd {
  resourceName: string;
  adGroup: string;
  ad: Ad;
  status: AdGroupAdStatus;
  policySummary?: {
    approvalStatus?: string;
    policyTopicEntries?: Array<{
      topic?: string;
      type?: string;
    }>;
    reviewStatus?: string;
  };
  labels?: string[];
}

/**
 * Keyword criterion
 */
export interface KeywordInfo {
  text: string;
  matchType: KeywordMatchType;
}

/**
 * Ad group criterion (includes keywords)
 */
export interface AdGroupCriterion {
  resourceName: string;
  criterionId: string;
  adGroup: string;
  status: AdGroupCriterionStatus;
  type?:
    | "UNSPECIFIED"
    | "UNKNOWN"
    | "KEYWORD"
    | "PLACEMENT"
    | "MOBILE_APP_CATEGORY"
    | "MOBILE_APPLICATION"
    | "DEVICE"
    | "LOCATION"
    | "LISTING_GROUP"
    | "AD_SCHEDULE"
    | "AGE_RANGE"
    | "GENDER"
    | "INCOME_RANGE"
    | "PARENTAL_STATUS"
    | "YOUTUBE_VIDEO"
    | "YOUTUBE_CHANNEL"
    | "USER_LIST"
    | "PROXIMITY"
    | "TOPIC"
    | "LISTING_SCOPE"
    | "LANGUAGE"
    | "IP_BLOCK"
    | "CONTENT_LABEL"
    | "CARRIER"
    | "USER_INTEREST"
    | "WEBPAGE"
    | "OPERATING_SYSTEM_VERSION"
    | "APP_PAYMENT_MODEL"
    | "MOBILE_DEVICE"
    | "CUSTOM_AFFINITY"
    | "CUSTOM_INTENT"
    | "LOCATION_GROUP"
    | "CUSTOM_AUDIENCE"
    | "COMBINED_AUDIENCE"
    | "KEYWORD_THEME"
    | "AUDIENCE"
    | "LOCAL_SERVICE_ID"
    | "BRAND"
    | "BRAND_LIST"
    | "LIFE_EVENT"
    | "SEARCH_THEME";
  keyword?: KeywordInfo;
  bidModifier?: number;
  cpcBidMicros?: string;
  effectiveCpcBidMicros?: string;
  qualityInfo?: {
    qualityScore?: number;
    creativenessScore?:
      | "UNSPECIFIED"
      | "UNKNOWN"
      | "BELOW_AVERAGE"
      | "AVERAGE"
      | "ABOVE_AVERAGE";
    postClickQualityScore?:
      | "UNSPECIFIED"
      | "UNKNOWN"
      | "BELOW_AVERAGE"
      | "AVERAGE"
      | "ABOVE_AVERAGE";
    searchPredictedCtr?:
      | "UNSPECIFIED"
      | "UNKNOWN"
      | "BELOW_AVERAGE"
      | "AVERAGE"
      | "ABOVE_AVERAGE";
  };
  positionEstimates?: {
    firstPageCpcMicros?: string;
    firstPositionCpcMicros?: string;
    topOfPageCpcMicros?: string;
  };
  finalUrls?: string[];
  finalMobileUrls?: string[];
  trackingUrlTemplate?: string;
  urlCustomParameters?: Array<{
    key: string;
    value: string;
  }>;
  finalUrlSuffix?: string;
  labels?: string[];
  negative?: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * List accessible customers response
 */
export interface ListAccessibleCustomersResponse {
  resourceNames: string[];
}

/**
 * Search stream response row (contains selected resources)
 */
export interface GoogleAdsRow {
  customer?: Customer;
  campaign?: Campaign;
  campaignBudget?: CampaignBudget;
  adGroup?: AdGroup;
  adGroupAd?: AdGroupAd;
  adGroupCriterion?: AdGroupCriterion;
  metrics?: Metrics;
  segments?: Segments;
}

/**
 * Search response
 */
export interface SearchGoogleAdsResponse {
  results: GoogleAdsRow[];
  nextPageToken?: string;
  totalResultsCount?: string;
  fieldMask?: string;
}

/**
 * Search stream response
 */
export interface SearchGoogleAdsStreamResponse {
  results: GoogleAdsRow[];
  fieldMask?: string;
  requestId?: string;
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Metrics (performance data)
 */
export interface Metrics {
  impressions?: string;
  clicks?: string;
  costMicros?: string;
  conversions?: number;
  conversionsValue?: number;
  ctr?: number;
  averageCpc?: number;
  averageCpm?: number;
  averageCost?: number;
  allConversions?: number;
  allConversionsValue?: number;
  viewThroughConversions?: string;
  interactionRate?: number;
  interactions?: string;
  engagementRate?: number;
  engagements?: string;
  videoViews?: string;
  videoViewRate?: number;
  averageCpv?: number;
  absoluteTopImpressionPercentage?: number;
  topImpressionPercentage?: number;
  searchImpressionShare?: number;
  searchRankLostImpressionShare?: number;
  searchBudgetLostImpressionShare?: number;
  contentImpressionShare?: number;
  contentRankLostImpressionShare?: number;
  contentBudgetLostImpressionShare?: number;
}

/**
 * Segments (for breakdown)
 */
export interface Segments {
  date?: string;
  dayOfWeek?:
    | "UNSPECIFIED"
    | "UNKNOWN"
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";
  device?:
    | "UNSPECIFIED"
    | "UNKNOWN"
    | "MOBILE"
    | "TABLET"
    | "DESKTOP"
    | "CONNECTED_TV"
    | "OTHER";
  hour?: number;
  month?: string;
  quarter?: string;
  week?: string;
  year?: number;
  adNetworkType?:
    | "UNSPECIFIED"
    | "UNKNOWN"
    | "SEARCH"
    | "SEARCH_PARTNERS"
    | "CONTENT"
    | "YOUTUBE_SEARCH"
    | "YOUTUBE_WATCH"
    | "MIXED"
    | "GOOGLE_TV";
  conversionAction?: string;
  conversionActionCategory?: string;
  conversionActionName?: string;
  geoTargetCity?: string;
  geoTargetCountry?: string;
  geoTargetMetro?: string;
  geoTargetRegion?: string;
}

// ============================================================================
// Input Types (for mutations)
// ============================================================================

/**
 * Input for creating a campaign budget
 */
export interface CreateCampaignBudgetInput {
  name: string;
  amountMicros: string;
  deliveryMethod?: BudgetDeliveryMethod;
  explicitlyShared?: boolean;
}

/**
 * Input for creating a campaign
 */
export interface CreateCampaignInput {
  name: string;
  advertisingChannelType: AdvertisingChannelType;
  status?: CampaignStatus;
  campaignBudget: string;
  startDate?: string;
  endDate?: string;
  biddingStrategyType?: BiddingStrategyType;
  targetCpaMicros?: string;
  targetRoas?: number;
  manualCpc?: {
    enhancedCpcEnabled?: boolean;
  };
  networkSettings?: {
    targetGoogleSearch?: boolean;
    targetSearchNetwork?: boolean;
    targetContentNetwork?: boolean;
    targetPartnerSearchNetwork?: boolean;
  };
}

/**
 * Input for updating a campaign
 */
export interface UpdateCampaignInput {
  resourceName: string;
  name?: string;
  status?: CampaignStatus;
  startDate?: string;
  endDate?: string;
  targetCpaMicros?: string;
  targetRoas?: number;
  networkSettings?: {
    targetGoogleSearch?: boolean;
    targetSearchNetwork?: boolean;
    targetContentNetwork?: boolean;
    targetPartnerSearchNetwork?: boolean;
  };
}

/**
 * Input for creating an ad group
 */
export interface CreateAdGroupInput {
  name: string;
  campaign: string;
  status?: AdGroupStatus;
  type?: AdGroupType;
  cpcBidMicros?: string;
  cpmBidMicros?: string;
  targetCpaMicros?: string;
}

/**
 * Input for updating an ad group
 */
export interface UpdateAdGroupInput {
  resourceName: string;
  name?: string;
  status?: AdGroupStatus;
  cpcBidMicros?: string;
  cpmBidMicros?: string;
  targetCpaMicros?: string;
}

/**
 * Input for creating a responsive search ad
 */
export interface CreateResponsiveSearchAdInput {
  adGroup: string;
  status?: AdGroupAdStatus;
  finalUrls: string[];
  headlines: Array<{
    text: string;
  }>;
  descriptions: Array<{
    text: string;
  }>;
  path1?: string;
  path2?: string;
}

/**
 * Input for updating an ad
 */
export interface UpdateAdGroupAdInput {
  resourceName: string;
  status?: AdGroupAdStatus;
}

/**
 * Input for creating a keyword
 */
export interface CreateKeywordInput {
  adGroup: string;
  status?: AdGroupCriterionStatus;
  keyword: {
    text: string;
    matchType: KeywordMatchType;
  };
  cpcBidMicros?: string;
  finalUrls?: string[];
  negative?: boolean;
}

/**
 * Input for updating a keyword
 */
export interface UpdateKeywordInput {
  resourceName: string;
  status?: AdGroupCriterionStatus;
  cpcBidMicros?: string;
  finalUrls?: string[];
}

// ============================================================================
// Mutation Response Types
// ============================================================================

/**
 * Mutate operation result
 */
export interface MutateOperationResult {
  resourceName: string;
}

/**
 * Mutate campaign response
 */
export interface MutateCampaignsResponse {
  results: MutateOperationResult[];
  partialFailureError?: GoogleAdsError;
}

/**
 * Mutate campaign budgets response
 */
export interface MutateCampaignBudgetsResponse {
  results: MutateOperationResult[];
  partialFailureError?: GoogleAdsError;
}

/**
 * Mutate ad groups response
 */
export interface MutateAdGroupsResponse {
  results: MutateOperationResult[];
  partialFailureError?: GoogleAdsError;
}

/**
 * Mutate ad group ads response
 */
export interface MutateAdGroupAdsResponse {
  results: MutateOperationResult[];
  partialFailureError?: GoogleAdsError;
}

/**
 * Mutate ad group criteria response
 */
export interface MutateAdGroupCriteriaResponse {
  results: MutateOperationResult[];
  partialFailureError?: GoogleAdsError;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Google Ads API error
 */
export interface GoogleAdsError {
  errors: Array<{
    errorCode?: Record<string, string>;
    message?: string;
    trigger?: {
      stringValue?: string;
    };
    location?: {
      fieldPathElements?: Array<{
        fieldName?: string;
        index?: number;
      }>;
    };
  }>;
  message?: string;
}

/**
 * API error response
 */
export interface ApiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      "@type": string;
      errors?: GoogleAdsError["errors"];
    }>;
  };
}
