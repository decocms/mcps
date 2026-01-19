/**
 * TikTok Marketing API types
 */

// ============================================================================
// Common Types
// ============================================================================

export type OperationStatus = "ENABLE" | "DISABLE" | "DELETE";

export type BudgetMode =
  | "BUDGET_MODE_INFINITE"
  | "BUDGET_MODE_DAY"
  | "BUDGET_MODE_TOTAL";

export type BidType = "BID_TYPE_NO_BID" | "BID_TYPE_CUSTOM";

export type OptimizationGoal =
  | "CLICK"
  | "CONVERT"
  | "SHOW"
  | "REACH"
  | "VIDEO_VIEW"
  | "LEAD_GENERATION"
  | "ENGAGEMENT";

export type Placement =
  | "PLACEMENT_TIKTOK"
  | "PLACEMENT_PANGLE"
  | "PLACEMENT_GLOBAL_APP_BUNDLE";

// ============================================================================
// Campaign Types
// ============================================================================

export type CampaignObjective =
  | "TRAFFIC"
  | "APP_PROMOTION"
  | "WEB_CONVERSIONS"
  | "PRODUCT_SALES"
  | "REACH"
  | "VIDEO_VIEWS"
  | "LEAD_GENERATION"
  | "COMMUNITY_INTERACTION";

export type CampaignStatus =
  | "CAMPAIGN_STATUS_ENABLE"
  | "CAMPAIGN_STATUS_DISABLE"
  | "CAMPAIGN_STATUS_DELETE"
  | "CAMPAIGN_STATUS_ADVERTISER_AUDIT_DENY"
  | "CAMPAIGN_STATUS_ADVERTISER_AUDIT"
  | "CAMPAIGN_STATUS_BUDGET_EXCEED"
  | "CAMPAIGN_STATUS_ALL";

export interface Campaign {
  campaign_id: string;
  campaign_name: string;
  advertiser_id: string;
  objective_type: CampaignObjective;
  operation_status: OperationStatus;
  secondary_status: CampaignStatus;
  budget_mode: BudgetMode;
  budget?: number;
  is_smart_performance_campaign?: boolean;
  create_time: string;
  modify_time: string;
}

export interface CreateCampaignInput {
  advertiser_id: string;
  campaign_name: string;
  objective_type: CampaignObjective;
  budget_mode?: BudgetMode;
  budget?: number;
  operation_status?: OperationStatus;
}

export interface UpdateCampaignInput {
  advertiser_id: string;
  campaign_id: string;
  campaign_name?: string;
  budget_mode?: BudgetMode;
  budget?: number;
  operation_status?: OperationStatus;
}

export interface ListCampaignsInput {
  advertiser_id: string;
  campaign_ids?: string[];
  filtering?: {
    campaign_name?: string;
    objective_type?: CampaignObjective;
    secondary_status?: CampaignStatus;
  };
  page?: number;
  page_size?: number;
}

export interface CampaignListResponse {
  code: number;
  message: string;
  data: {
    list: Campaign[];
    page_info: PageInfo;
  };
}

// ============================================================================
// Ad Group Types
// ============================================================================

export type AdGroupStatus =
  | "ADGROUP_STATUS_DELIVERY_OK"
  | "ADGROUP_STATUS_DISABLE"
  | "ADGROUP_STATUS_DELETE"
  | "ADGROUP_STATUS_NOT_DELIVER"
  | "ADGROUP_STATUS_TIME_DONE"
  | "ADGROUP_STATUS_NO_SCHEDULE"
  | "ADGROUP_STATUS_CAMPAIGN_DISABLE"
  | "ADGROUP_STATUS_CAMPAIGN_EXCEED"
  | "ADGROUP_STATUS_BALANCE_EXCEED"
  | "ADGROUP_STATUS_AUDIT"
  | "ADGROUP_STATUS_REAUDIT"
  | "ADGROUP_STATUS_AUDIT_DENY"
  | "ADGROUP_STATUS_ALL";

export type ScheduleType = "SCHEDULE_START_END" | "SCHEDULE_FROM_NOW";

export interface AdGroup {
  adgroup_id: string;
  adgroup_name: string;
  advertiser_id: string;
  campaign_id: string;
  operation_status: OperationStatus;
  secondary_status: AdGroupStatus;
  placement_type: string;
  placements?: Placement[];
  optimization_goal: OptimizationGoal;
  bid_type: BidType;
  bid_price?: number;
  budget_mode: BudgetMode;
  budget?: number;
  schedule_type: ScheduleType;
  schedule_start_time?: string;
  schedule_end_time?: string;
  dayparting?: string;
  pacing?: string;
  create_time: string;
  modify_time: string;
}

export interface CreateAdGroupInput {
  advertiser_id: string;
  campaign_id: string;
  adgroup_name: string;
  placement_type?: string;
  placements?: Placement[];
  optimization_goal: OptimizationGoal;
  bid_type?: BidType;
  bid_price?: number;
  budget_mode?: BudgetMode;
  budget?: number;
  schedule_type?: ScheduleType;
  schedule_start_time?: string;
  schedule_end_time?: string;
  operation_status?: OperationStatus;
  location_ids?: string[];
  gender?: "GENDER_UNLIMITED" | "GENDER_MALE" | "GENDER_FEMALE";
  age_groups?: string[];
  languages?: string[];
}

export interface UpdateAdGroupInput {
  advertiser_id: string;
  adgroup_id: string;
  adgroup_name?: string;
  bid_price?: number;
  budget?: number;
  schedule_end_time?: string;
  operation_status?: OperationStatus;
}

export interface ListAdGroupsInput {
  advertiser_id: string;
  campaign_ids?: string[];
  adgroup_ids?: string[];
  filtering?: {
    adgroup_name?: string;
    secondary_status?: AdGroupStatus;
  };
  page?: number;
  page_size?: number;
}

export interface AdGroupListResponse {
  code: number;
  message: string;
  data: {
    list: AdGroup[];
    page_info: PageInfo;
  };
}

// ============================================================================
// Ad Types
// ============================================================================

export type AdStatus =
  | "AD_STATUS_DELIVERY_OK"
  | "AD_STATUS_DISABLE"
  | "AD_STATUS_DELETE"
  | "AD_STATUS_NOT_DELIVER"
  | "AD_STATUS_CAMPAIGN_DISABLE"
  | "AD_STATUS_ADGROUP_DISABLE"
  | "AD_STATUS_CAMPAIGN_EXCEED"
  | "AD_STATUS_BALANCE_EXCEED"
  | "AD_STATUS_AUDIT"
  | "AD_STATUS_REAUDIT"
  | "AD_STATUS_AUDIT_DENY"
  | "AD_STATUS_ALL";

export type AdFormat =
  | "SINGLE_VIDEO"
  | "SINGLE_IMAGE"
  | "VIDEO_CAROUSEL"
  | "IMAGE_CAROUSEL"
  | "SPARK_ADS";

export interface Ad {
  ad_id: string;
  ad_name: string;
  advertiser_id: string;
  campaign_id: string;
  adgroup_id: string;
  operation_status: OperationStatus;
  secondary_status: AdStatus;
  ad_format: AdFormat;
  ad_text?: string;
  call_to_action?: string;
  call_to_action_id?: string;
  landing_page_url?: string;
  display_name?: string;
  profile_image?: string;
  video_id?: string;
  image_ids?: string[];
  create_time: string;
  modify_time: string;
}

export interface CreateAdInput {
  advertiser_id: string;
  adgroup_id: string;
  ad_name: string;
  ad_format: AdFormat;
  ad_text?: string;
  call_to_action?: string;
  landing_page_url?: string;
  display_name?: string;
  video_id?: string;
  image_ids?: string[];
  operation_status?: OperationStatus;
  identity_id?: string;
  identity_type?: string;
}

export interface UpdateAdInput {
  advertiser_id: string;
  ad_id: string;
  ad_name?: string;
  ad_text?: string;
  call_to_action?: string;
  landing_page_url?: string;
  operation_status?: OperationStatus;
}

export interface ListAdsInput {
  advertiser_id: string;
  campaign_ids?: string[];
  adgroup_ids?: string[];
  ad_ids?: string[];
  filtering?: {
    ad_name?: string;
    secondary_status?: AdStatus;
  };
  page?: number;
  page_size?: number;
}

export interface AdListResponse {
  code: number;
  message: string;
  data: {
    list: Ad[];
    page_info: PageInfo;
  };
}

// ============================================================================
// Report Types
// ============================================================================

export type ReportDataLevel =
  | "AUCTION_ADVERTISER"
  | "AUCTION_CAMPAIGN"
  | "AUCTION_ADGROUP"
  | "AUCTION_AD";

export type ReportDimension =
  | "advertiser_id"
  | "campaign_id"
  | "adgroup_id"
  | "ad_id"
  | "stat_time_day"
  | "stat_time_hour";

export interface ReportMetrics {
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  reach?: number;
  frequency?: number;
  conversion?: number;
  cost_per_conversion?: number;
  conversion_rate?: number;
  video_play_actions?: number;
  video_watched_2s?: number;
  video_watched_6s?: number;
  average_video_play?: number;
  average_video_play_per_user?: number;
  profile_visits?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  follows?: number;
}

export interface ReportRow extends ReportMetrics {
  dimensions: {
    advertiser_id?: string;
    campaign_id?: string;
    adgroup_id?: string;
    ad_id?: string;
    stat_time_day?: string;
    stat_time_hour?: string;
  };
}

export interface GetReportInput {
  advertiser_id: string;
  data_level: ReportDataLevel;
  dimensions: ReportDimension[];
  metrics: string[];
  start_date: string;
  end_date: string;
  filters?: {
    campaign_ids?: string[];
    adgroup_ids?: string[];
    ad_ids?: string[];
  };
  page?: number;
  page_size?: number;
}

export interface ReportResponse {
  code: number;
  message: string;
  data: {
    list: ReportRow[];
    page_info: PageInfo;
  };
}

// ============================================================================
// Advertiser Types
// ============================================================================

export type AdvertiserStatus =
  | "STATUS_ENABLE"
  | "STATUS_DISABLE"
  | "STATUS_PENDING_CONFIRM"
  | "STATUS_PENDING_VERIFIED"
  | "STATUS_CONFIRM_FAIL"
  | "STATUS_CONFIRM_FAIL_END"
  | "STATUS_LIMIT"
  | "STATUS_WAIT_FOR_BPM_AUDIT"
  | "STATUS_WAIT_FOR_PUBLIC_AUTH"
  | "STATUS_SELF_SERVICE_UNAUDITED";

export interface Advertiser {
  advertiser_id: string;
  advertiser_name: string;
  status: AdvertiserStatus;
  company?: string;
  contacter?: string;
  email?: string;
  telephone?: string;
  address?: string;
  industry?: string;
  balance?: number;
  currency?: string;
  timezone?: string;
  create_time: string;
}

export interface GetAdvertiserInfoInput {
  advertiser_ids: string[];
  fields?: string[];
}

export interface AdvertiserInfoResponse {
  code: number;
  message: string;
  data: {
    list: Advertiser[];
  };
}

// ============================================================================
// Common Types
// ============================================================================

export interface PageInfo {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  request_id: string;
  data: T;
}
