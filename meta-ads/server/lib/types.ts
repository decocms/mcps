/**
 * Type definitions for Meta Ads API responses
 */

// Account types
export interface AdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  timezone_offset_hours_utc: number;
  business_name?: string;
  amount_spent: string;
  spend_cap?: string;
  balance?: string;
  min_campaign_group_spend_cap?: string;
  min_daily_budget?: string | number;
}

export interface Page {
  id: string;
  name: string;
  category?: string;
  access_token?: string;
  tasks?: string[];
}

// Campaign types
export interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  effective_status: string;
  created_time: string;
  updated_time: string;
  start_time?: string;
  stop_time?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  buying_type?: string;
  special_ad_categories?: string[];
}

export type CampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

// AdSet types
export interface AdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  created_time: string;
  updated_time: string;
  start_time?: string;
  end_time?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  bid_amount?: string;
  bid_strategy?: string;
  billing_event?: string;
  optimization_goal?: string;
  targeting?: Targeting;
  promoted_object?: Record<string, unknown>;
}

export interface Targeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    regions?: Array<{ key: string; name: string }>;
    cities?: Array<{ key: string; name: string }>;
  };
  interests?: Array<{ id: string; name: string }>;
  behaviors?: Array<{ id: string; name: string }>;
  custom_audiences?: Array<{ id: string; name: string }>;
  excluded_custom_audiences?: Array<{ id: string; name: string }>;
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  device_platforms?: string[];
}

// Ad types
export interface Ad {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  created_time: string;
  updated_time: string;
  creative?: {
    id: string;
  };
  tracking_specs?: Array<Record<string, unknown>>;
  conversion_specs?: Array<Record<string, unknown>>;
}

export interface AdCreative {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  call_to_action_type?: string;
  image_url?: string;
  image_hash?: string;
  video_id?: string;
  link_url?: string;
  object_story_spec?: Record<string, unknown>;
  thumbnail_url?: string;
  effective_object_story_id?: string;
}

// Insights types
export interface InsightsParams {
  time_range?: {
    since: string;
    until: string;
  };
  date_preset?: string;
  breakdowns?: string[];
  level?: "account" | "campaign" | "adset" | "ad";
  fields?: string[];
  filtering?: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
  limit?: number;
}

export interface InsightData {
  // Identification
  account_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;

  // Time
  date_start: string;
  date_stop: string;

  // Performance metrics
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  unique_clicks?: string;
  ctr?: string;
  unique_ctr?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;

  // Cost metrics
  spend?: string;
  cost_per_unique_click?: string;

  // Actions
  actions?: Array<{
    action_type: string;
    value: string;
  }>;
  action_values?: Array<{
    action_type: string;
    value: string;
  }>;
  conversions?: Array<{
    action_type: string;
    value: string;
  }>;
  cost_per_action_type?: Array<{
    action_type: string;
    value: string;
  }>;
  cost_per_conversion?: Array<{
    action_type: string;
    value: string;
  }>;

  // Video metrics
  video_play_actions?: Array<{
    action_type: string;
    value: string;
  }>;
  video_p25_watched_actions?: Array<{
    action_type: string;
    value: string;
  }>;
  video_p50_watched_actions?: Array<{
    action_type: string;
    value: string;
  }>;
  video_p75_watched_actions?: Array<{
    action_type: string;
    value: string;
  }>;
  video_p100_watched_actions?: Array<{
    action_type: string;
    value: string;
  }>;

  // Breakdown fields (when using breakdowns)
  age?: string;
  gender?: string;
  country?: string;
  region?: string;
  dma?: string;
  impression_device?: string;
  device_platform?: string;
  platform_position?: string;
  publisher_platform?: string;

  // Other
  social_spend?: string;
  website_ctr?: Array<{
    action_type: string;
    value: string;
  }>;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  outbound_clicks?: Array<{
    action_type: string;
    value: string;
  }>;
  outbound_clicks_ctr?: Array<{
    action_type: string;
    value: string;
  }>;
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
  summary?: {
    total_count?: number;
  };
}

export interface ApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}
