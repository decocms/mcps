/**
 * Meta Graph API Client
 *
 * Handles all communication with the Meta Marketing API
 */

import { META_GRAPH_API_URL } from "../constants.ts";
import type {
  AdAccount,
  AdCreative,
  AdSet,
  Ad,
  Campaign,
  InsightData,
  InsightsParams,
  Page,
  PaginatedResponse,
  ApiError,
} from "./types.ts";

export interface MetaClientConfig {
  accessToken: string;
}

/**
 * Makes a request to the Meta Graph API
 */
async function makeRequest<T>(
  config: MetaClientConfig,
  endpoint: string,
  options: {
    method?: string;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const url = new URL(`${META_GRAPH_API_URL}${endpoint}`);

  // Add access token
  url.searchParams.set("access_token", config.accessToken);

  // Add query params
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const fetchOptions: RequestInit = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (options.body && options.method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), fetchOptions);

  if (!response.ok) {
    const errorData = (await response.json()) as ApiError;
    throw new Error(
      `Meta API Error: ${errorData.error?.message || response.statusText} (Code: ${errorData.error?.code || response.status})`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Meta Ads Client class
 */
export class MetaAdsClient {
  private config: MetaClientConfig;

  constructor(config: MetaClientConfig) {
    this.config = config;
  }

  // ============ User Methods ============

  /**
   * Get information about the authenticated user
   */
  async getUserInfo(fields?: string): Promise<{ id: string; name?: string }> {
    return makeRequest<{ id: string; name?: string }>(this.config, "/me", {
      params: {
        fields: fields || "id,name",
      },
    });
  }

  // ============ Account Methods ============

  /**
   * Get all ad accounts accessible by the current user
   */
  async getAdAccounts(
    userId: string = "me",
    limit: number = 50,
    fields?: string,
  ): Promise<PaginatedResponse<AdAccount>> {
    return makeRequest<PaginatedResponse<AdAccount>>(
      this.config,
      `/${userId}/adaccounts`,
      {
        params: {
          fields:
            fields ||
            "id,name,account_id,account_status,currency,timezone_name,timezone_offset_hours_utc,business_name,amount_spent",
          limit: limit.toString(),
        },
      },
    );
  }

  /**
   * Get detailed information about a specific ad account
   */
  async getAccountInfo(accountId: string, fields?: string): Promise<AdAccount> {
    // Ensure account ID starts with act_
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    return makeRequest<AdAccount>(this.config, `/${formattedId}`, {
      params: {
        fields:
          fields ||
          "id,name,account_id,account_status,currency,timezone_name,timezone_offset_hours_utc,business_name,amount_spent,spend_cap,balance,min_campaign_group_spend_cap,min_daily_budget",
      },
    });
  }

  /**
   * Get pages associated with an ad account or user
   */
  async getAccountPages(
    accountId: string = "me",
    limit: number = 50,
  ): Promise<PaginatedResponse<Page>> {
    // If it's an ad account, get pages associated with it
    // If it's "me", get user's pages
    const endpoint =
      accountId === "me" ? "/me/accounts" : `/${accountId}/promote_pages`;

    return makeRequest<PaginatedResponse<Page>>(this.config, endpoint, {
      params: {
        fields: "id,name,category,access_token,tasks",
        limit: limit.toString(),
      },
    });
  }

  // ============ Campaign Methods ============

  /**
   * Get campaigns for an ad account
   */
  async getCampaigns(
    accountId: string,
    options: {
      limit?: number;
      statusFilter?: string;
      fields?: string;
    } = {},
  ): Promise<PaginatedResponse<Campaign>> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const params: Record<string, string> = {
      fields:
        options.fields ||
        "id,name,objective,status,effective_status,created_time,updated_time,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining,buying_type,special_ad_categories",
      limit: (options.limit || 50).toString(),
    };

    // Add filtering if status is provided
    if (options.statusFilter) {
      params.filtering = JSON.stringify([
        {
          field: "effective_status",
          operator: "IN",
          value: [options.statusFilter],
        },
      ]);
    }

    return makeRequest<PaginatedResponse<Campaign>>(
      this.config,
      `/${formattedId}/campaigns`,
      { params },
    );
  }

  /**
   * Get details of a specific campaign
   */
  async getCampaignDetails(
    campaignId: string,
    fields?: string,
  ): Promise<Campaign> {
    return makeRequest<Campaign>(this.config, `/${campaignId}`, {
      params: {
        fields:
          fields ||
          "id,name,objective,status,effective_status,created_time,updated_time,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining,buying_type,special_ad_categories",
      },
    });
  }

  // ============ AdSet Methods ============

  /**
   * Get ad sets for an ad account
   */
  async getAdSets(
    accountId: string,
    options: {
      limit?: number;
      campaignId?: string;
      fields?: string;
    } = {},
  ): Promise<PaginatedResponse<AdSet>> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const params: Record<string, string> = {
      fields:
        options.fields ||
        "id,name,campaign_id,status,effective_status,created_time,updated_time,start_time,end_time,daily_budget,lifetime_budget,budget_remaining,bid_amount,bid_strategy,billing_event,optimization_goal,targeting",
      limit: (options.limit || 50).toString(),
    };

    // Add filtering if campaign_id is provided
    if (options.campaignId) {
      params.filtering = JSON.stringify([
        {
          field: "campaign.id",
          operator: "EQUAL",
          value: options.campaignId,
        },
      ]);
    }

    return makeRequest<PaginatedResponse<AdSet>>(
      this.config,
      `/${formattedId}/adsets`,
      { params },
    );
  }

  /**
   * Get details of a specific ad set
   */
  async getAdSetDetails(adsetId: string, fields?: string): Promise<AdSet> {
    return makeRequest<AdSet>(this.config, `/${adsetId}`, {
      params: {
        fields:
          fields ||
          "id,name,campaign_id,status,effective_status,created_time,updated_time,start_time,end_time,daily_budget,lifetime_budget,budget_remaining,bid_amount,bid_strategy,billing_event,optimization_goal,targeting,promoted_object",
      },
    });
  }

  // ============ Ad Methods ============

  /**
   * Get ads for an ad account
   */
  async getAds(
    accountId: string,
    options: {
      limit?: number;
      campaignId?: string;
      adsetId?: string;
      fields?: string;
    } = {},
  ): Promise<PaginatedResponse<Ad>> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const params: Record<string, string> = {
      fields:
        options.fields ||
        "id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,creative",
      limit: (options.limit || 50).toString(),
    };

    // Add filtering
    const filters: Array<Record<string, unknown>> = [];
    if (options.campaignId) {
      filters.push({
        field: "campaign.id",
        operator: "EQUAL",
        value: options.campaignId,
      });
    }
    if (options.adsetId) {
      filters.push({
        field: "adset.id",
        operator: "EQUAL",
        value: options.adsetId,
      });
    }
    if (filters.length > 0) {
      params.filtering = JSON.stringify(filters);
    }

    return makeRequest<PaginatedResponse<Ad>>(
      this.config,
      `/${formattedId}/ads`,
      { params },
    );
  }

  /**
   * Get details of a specific ad
   */
  async getAdDetails(adId: string, fields?: string): Promise<Ad> {
    return makeRequest<Ad>(this.config, `/${adId}`, {
      params: {
        fields:
          fields ||
          "id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,creative,tracking_specs,conversion_specs",
      },
    });
  }

  /**
   * Get creative details for an ad
   */
  async getAdCreatives(adId: string, fields?: string): Promise<AdCreative> {
    const ad = await makeRequest<{ creative: { id: string } }>(
      this.config,
      `/${adId}`,
      {
        params: { fields: "creative{id}" },
      },
    );

    if (!ad.creative?.id) {
      throw new Error(`No creative found for ad ${adId}`);
    }

    return makeRequest<AdCreative>(this.config, `/${ad.creative.id}`, {
      params: {
        fields:
          fields ||
          "id,name,title,body,call_to_action_type,image_url,image_hash,video_id,link_url,object_story_spec,thumbnail_url,effective_object_story_id",
      },
    });
  }

  // ============ Insights Methods ============

  /**
   * Get insights for any object (account, campaign, adset, ad)
   * Note: Account IDs must include the "act_" prefix (e.g., "act_123456789")
   */
  async getInsights(
    objectId: string,
    params: InsightsParams = {},
  ): Promise<PaginatedResponse<InsightData>> {
    // Use objectId as-is: account IDs should already have "act_" prefix,
    // campaign/adset/ad IDs don't need any prefix
    const queryParams: Record<string, string> = {
      fields:
        params.fields?.join(",") ||
        "impressions,reach,frequency,clicks,unique_clicks,ctr,unique_ctr,cpc,cpm,cpp,spend,cost_per_unique_click,actions,action_values,conversions,cost_per_action_type,date_start,date_stop",
      limit: (params.limit || 100).toString(),
    };

    // Add date preset or time range
    if (params.date_preset) {
      queryParams.date_preset = params.date_preset;
    } else if (params.time_range) {
      queryParams.time_range = JSON.stringify(params.time_range);
    }

    // Add breakdowns
    if (params.breakdowns && params.breakdowns.length > 0) {
      queryParams.breakdowns = params.breakdowns.join(",");
    }

    // Add level
    if (params.level) {
      queryParams.level = params.level;
    }

    // Add filtering
    if (params.filtering && params.filtering.length > 0) {
      queryParams.filtering = JSON.stringify(params.filtering);
    }

    return makeRequest<PaginatedResponse<InsightData>>(
      this.config,
      `/${objectId}/insights`,
      { params: queryParams },
    );
  }
}

/**
 * Create a Meta Ads client instance
 */
export const createMetaAdsClient = (config: MetaClientConfig): MetaAdsClient =>
  new MetaAdsClient(config);
