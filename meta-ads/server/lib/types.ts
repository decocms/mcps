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
  about?: string;
  website?: string;
  phone?: string;
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
  [x: string]: unknown;
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    [x: string]: unknown;
    countries?: string[];
    regions?: Array<{ [x: string]: unknown; key: string; name: string }>;
    cities?: Array<{ [x: string]: unknown; key: string; name: string }>;
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

// ============ Create/Update Parameter Types ============

// Campaign objectives (Meta Ads API v18+)
export type CampaignObjective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_APP_PROMOTION";

// Special ad categories
export type SpecialAdCategory =
  | "NONE"
  | "HOUSING"
  | "EMPLOYMENT"
  | "CREDIT"
  | "ISSUES_ELECTIONS_POLITICS";

// Campaign creation params
export interface CreateCampaignParams {
  name: string;
  objective: CampaignObjective;
  status?: CampaignStatus;
  special_ad_categories?: SpecialAdCategory[];
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  buying_type?: "AUCTION" | "RESERVED";
  bid_strategy?:
    | "LOWEST_COST_WITHOUT_CAP"
    | "LOWEST_COST_WITH_BID_CAP"
    | "COST_CAP";
}

// Campaign update params
export interface UpdateCampaignParams {
  name?: string;
  status?: CampaignStatus;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  bid_strategy?: string;
}

// AdSet status type
export type AdSetStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

// Optimization goals
export type OptimizationGoal =
  | "NONE"
  | "APP_INSTALLS"
  | "AD_RECALL_LIFT"
  | "ENGAGED_USERS"
  | "EVENT_RESPONSES"
  | "IMPRESSIONS"
  | "LEAD_GENERATION"
  | "QUALITY_LEAD"
  | "LINK_CLICKS"
  | "OFFSITE_CONVERSIONS"
  | "PAGE_LIKES"
  | "POST_ENGAGEMENT"
  | "QUALITY_CALL"
  | "REACH"
  | "LANDING_PAGE_VIEWS"
  | "VISIT_INSTAGRAM_PROFILE"
  | "VALUE"
  | "THRUPLAY"
  | "DERIVED_EVENTS"
  | "APP_INSTALLS_AND_OFFSITE_CONVERSIONS"
  | "CONVERSATIONS"
  | "IN_APP_VALUE"
  | "MESSAGING_PURCHASE_CONVERSION"
  | "SUBSCRIBERS"
  | "REMINDERS_SET"
  | "MEANINGFUL_CALL_ATTEMPT"
  | "PROFILE_VISIT"
  | "MESSAGING_APPOINTMENT_CONVERSION";

// Billing events
export type BillingEvent =
  | "APP_INSTALLS"
  | "CLICKS"
  | "IMPRESSIONS"
  | "LINK_CLICKS"
  | "NONE"
  | "OFFER_CLAIMS"
  | "PAGE_LIKES"
  | "POST_ENGAGEMENT"
  | "THRUPLAY"
  | "PURCHASE"
  | "LISTING_INTERACTION";

// Bid strategy
export type BidStrategy =
  | "LOWEST_COST_WITHOUT_CAP"
  | "LOWEST_COST_WITH_BID_CAP"
  | "COST_CAP"
  | "LOWEST_COST_WITH_MIN_ROAS";

// Targeting for creation (simplified for input)
export interface TargetingInput {
  age_min?: number;
  age_max?: number;
  genders?: number[]; // 1 = male, 2 = female
  geo_locations?: {
    countries?: string[];
    regions?: Array<{ key: string }>;
    cities?: Array<{ key: string; radius?: number; distance_unit?: string }>;
    location_types?: string[];
  };
  interests?: Array<{ id: string }>;
  behaviors?: Array<{ id: string }>;
  custom_audiences?: Array<{ id: string }>;
  excluded_custom_audiences?: Array<{ id: string }>;
  publisher_platforms?: Array<
    "facebook" | "instagram" | "audience_network" | "messenger"
  >;
  facebook_positions?: string[];
  instagram_positions?: string[];
  device_platforms?: Array<"mobile" | "desktop">;
  flexible_spec?: Array<{
    interests?: Array<{ id: string }>;
    behaviors?: Array<{ id: string }>;
  }>;
  exclusions?: {
    interests?: Array<{ id: string }>;
    behaviors?: Array<{ id: string }>;
  };
}

// AdSet creation params
export interface CreateAdSetParams {
  campaign_id: string;
  name: string;
  status?: AdSetStatus;
  targeting: TargetingInput;
  optimization_goal: OptimizationGoal;
  billing_event: BillingEvent;
  bid_strategy?: BidStrategy;
  bid_amount?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
  promoted_object?: {
    page_id?: string;
    pixel_id?: string;
    application_id?: string;
    object_store_url?: string;
    custom_event_type?: string;
    offer_id?: string;
    product_set_id?: string;
  };
  destination_type?:
    | "WEBSITE"
    | "APP"
    | "MESSENGER"
    | "APPLINKS_AUTOMATIC"
    | "WHATSAPP"
    | "INSTAGRAM_DIRECT"
    | "FACEBOOK";
  attribution_spec?: Array<{
    event_type: string;
    window_days: number;
  }>;
}

// AdSet update params
export interface UpdateAdSetParams {
  name?: string;
  status?: AdSetStatus;
  targeting?: TargetingInput;
  optimization_goal?: OptimizationGoal;
  billing_event?: BillingEvent;
  bid_strategy?: BidStrategy;
  bid_amount?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
}

// Ad status type
export type AdStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

// Ad creation params
export interface CreateAdParams {
  adset_id: string;
  name: string;
  status?: AdStatus;
  creative: {
    creative_id: string;
  };
  tracking_specs?: Array<Record<string, unknown>>;
  conversion_domain?: string;
}

// Ad update params
export interface UpdateAdParams {
  name?: string;
  status?: AdStatus;
  creative?: {
    creative_id: string;
  };
}

// Call to action types
export type CallToActionType =
  | "ADD_TO_CART"
  | "APPLY_NOW"
  | "BOOK_TRAVEL"
  | "BUY"
  | "BUY_NOW"
  | "BUY_TICKETS"
  | "CALL"
  | "CALL_ME"
  | "CONTACT"
  | "CONTACT_US"
  | "DONATE"
  | "DONATE_NOW"
  | "DOWNLOAD"
  | "EVENT_RSVP"
  | "FIND_A_GROUP"
  | "FIND_YOUR_GROUPS"
  | "FOLLOW_NEWS_STORYLINE"
  | "FOLLOW_PAGE"
  | "FOLLOW_USER"
  | "GET_DIRECTIONS"
  | "GET_OFFER"
  | "GET_OFFER_VIEW"
  | "GET_QUOTE"
  | "GET_SHOWTIMES"
  | "INSTALL_APP"
  | "INSTALL_MOBILE_APP"
  | "LEARN_MORE"
  | "LIKE_PAGE"
  | "LISTEN_MUSIC"
  | "LISTEN_NOW"
  | "MESSAGE_PAGE"
  | "MOBILE_DOWNLOAD"
  | "MOMENTS"
  | "NO_BUTTON"
  | "OPEN_LINK"
  | "ORDER_NOW"
  | "PAY_TO_ACCESS"
  | "PLAY_GAME"
  | "PLAY_GAME_ON_FACEBOOK"
  | "PURCHASE_GIFT_CARDS"
  | "RECORD_NOW"
  | "REFER_FRIENDS"
  | "REQUEST_TIME"
  | "SAY_THANKS"
  | "SEE_MORE"
  | "SELL_NOW"
  | "SEND_A_GIFT"
  | "SEND_GIFT_MONEY"
  | "SHARE"
  | "SHOP_NOW"
  | "SIGN_UP"
  | "SOTTO_SUBSCRIBE"
  | "START_ORDER"
  | "SUBSCRIBE"
  | "SWIPE_UP_PRODUCT"
  | "SWIPE_UP_SHOP"
  | "UPDATE_APP"
  | "USE_APP"
  | "USE_MOBILE_APP"
  | "VIDEO_ANNOTATION"
  | "VIDEO_CALL"
  | "VISIT_PAGES_FEED"
  | "WATCH_MORE"
  | "WATCH_VIDEO"
  | "WHATSAPP_MESSAGE"
  | "WOODHENGE_SUPPORT";

// Object story spec for creative
export interface ObjectStorySpec {
  page_id: string;
  link_data?: {
    link: string;
    message?: string;
    name?: string;
    description?: string;
    caption?: string;
    image_hash?: string;
    video_id?: string;
    call_to_action?: {
      type: CallToActionType;
      value?: {
        link?: string;
        link_caption?: string;
        lead_gen_form_id?: string;
        app_destination?: string;
      };
    };
    multi_share_end_card?: boolean;
    multi_share_optimized?: boolean;
    child_attachments?: Array<{
      link: string;
      name?: string;
      description?: string;
      image_hash?: string;
      video_id?: string;
      call_to_action?: {
        type: CallToActionType;
        value?: {
          link?: string;
        };
      };
    }>;
  };
  photo_data?: {
    image_hash: string;
    caption?: string;
    url?: string;
  };
  video_data?: {
    video_id: string;
    title?: string;
    message?: string;
    image_hash?: string;
    call_to_action?: {
      type: CallToActionType;
      value?: {
        link?: string;
      };
    };
  };
  text_data?: {
    message: string;
  };
}

// Ad Creative creation params
export interface CreateAdCreativeParams {
  name?: string;
  object_story_spec?: ObjectStorySpec;
  degrees_of_freedom_spec?: {
    creative_features_spec?: {
      standard_enhancements?: {
        enroll_status: "OPT_IN" | "OPT_OUT";
      };
    };
  };
  // For using existing post
  effective_object_story_id?: string;
  // Alternative: source_instagram_media_id for Instagram posts
  source_instagram_media_id?: string;
  // URL-based creative
  object_url?: string;
  // Additional fields
  title?: string;
  body?: string;
  image_hash?: string;
  video_id?: string;
  link_url?: string;
  call_to_action_type?: CallToActionType;
  url_tags?: string;
}

// Image upload response
export interface ImageUploadResponse {
  hash: string;
  url: string;
  width?: number;
  height?: number;
}

// API mutation response (create/update/delete)
export interface MutationResponse {
  id?: string;
  success?: boolean;
}

// Delete response
export interface DeleteResponse {
  success: boolean;
}
