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
  CreateCampaignParams,
  UpdateCampaignParams,
  CreateAdSetParams,
  UpdateAdSetParams,
  CreateAdParams,
  UpdateAdParams,
  CreateAdCreativeParams,
  MutationResponse,
  DeleteResponse,
  ImageUploadResponse,
} from "./types.ts";

export interface MetaClientConfig {
  accessToken: string;
}

/**
 * Token exchange response from Meta
 */
interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

/**
 * Token debug info from Meta
 */
interface TokenDebugInfo {
  data: {
    app_id: string;
    type: string;
    application: string;
    data_access_expires_at: number;
    expires_at: number;
    is_valid: boolean;
    issued_at?: number;
    scopes: string[];
    user_id?: string;
  };
}

// Cache for exchanged tokens to avoid repeated API calls
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Exchange a short-lived token for a long-lived token
 * Long-lived tokens last ~60 days
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  // Check cache first (use first 20 chars of token as key)
  const cacheKey = `${appId}:${shortLivedToken.substring(0, 20)}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 86400000) {
    // Return cached if expires in more than 1 day
    return {
      token: cached.token,
      expiresIn: Math.floor((cached.expiresAt - Date.now()) / 1000),
    };
  }

  const url = new URL(`${META_GRAPH_API_URL}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorData = (await response.json()) as ApiError;
    throw new Error(
      `Failed to exchange token: ${errorData.error?.message || response.statusText}`,
    );
  }

  const data = (await response.json()) as TokenExchangeResponse;

  // Cache the new token
  const expiresIn = data.expires_in || 5184000; // Default 60 days
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return {
    token: data.access_token,
    expiresIn,
  };
}

/**
 * Debug/inspect a token to get its info
 */
export async function debugToken(
  inputToken: string,
  accessToken: string,
): Promise<TokenDebugInfo["data"]> {
  const url = new URL(`${META_GRAPH_API_URL}/debug_token`);
  url.searchParams.set("input_token", inputToken);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorData = (await response.json()) as ApiError;
    throw new Error(
      `Failed to debug token: ${errorData.error?.message || response.statusText}`,
    );
  }

  const data = (await response.json()) as TokenDebugInfo;
  return data.data;
}

/**
 * Check if a token needs to be exchanged (is short-lived or expiring soon)
 */
export async function shouldExchangeToken(token: string): Promise<boolean> {
  try {
    const debugInfo = await debugToken(token, token);

    // If expires_at is 0, it's a long-lived token that doesn't expire
    if (debugInfo.expires_at === 0) {
      return false;
    }

    // Check if token expires in less than 7 days
    const expiresIn = debugInfo.expires_at * 1000 - Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    return expiresIn < sevenDays;
  } catch {
    // If we can't debug, try to exchange anyway
    return true;
  }
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
 * Detect if the access token is a User Token or Page Token
 */
export async function detectTokenType(
  accessToken: string,
): Promise<"user" | "page"> {
  try {
    const response = await makeRequest<{
      id: string;
      name?: string;
      category?: string;
      tasks?: string[];
    }>({ accessToken }, "/me", {
      params: {
        fields: "id,name,category,tasks",
      },
    });

    // If response has 'category' or 'tasks', it's a Page Token
    if (response.category || response.tasks) {
      return "page";
    }

    // Otherwise, it's a User Token
    return "user";
  } catch (error) {
    // If error accessing /me, default to user (safer fallback)
    console.warn(
      "[Meta Ads] Could not detect token type, defaulting to user:",
      error,
    );
    return "user";
  }
}

/**
 * Meta Ads Client class
 */
export class MetaAdsClient {
  private config: MetaClientConfig;
  private tokenType: "user" | "page" | null = null;

  constructor(config: MetaClientConfig) {
    this.config = config;
  }

  /**
   * Get the detected token type (lazy detection)
   */
  async getTokenType(): Promise<"user" | "page"> {
    if (!this.tokenType) {
      this.tokenType = await detectTokenType(this.config.accessToken);
    }
    return this.tokenType;
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
   * @deprecated Use getUserAccountPages or getPageInfo instead
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

  // ============ User Token Methods ============

  /**
   * Get all ad accounts accessible by the current user (User Token only)
   */
  async getUserAdAccounts(
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
   * Get pages associated with the current user (User Token only)
   */
  async getUserAccountPages(
    limit: number = 50,
  ): Promise<PaginatedResponse<Page>> {
    return makeRequest<PaginatedResponse<Page>>(this.config, "/me/accounts", {
      params: {
        fields: "id,name,category,access_token,tasks",
        limit: limit.toString(),
      },
    });
  }

  // ============ Page Token Methods ============

  /**
   * Get information about the current page (Page Token only)
   */
  async getPageInfo(fields?: string): Promise<Page> {
    return makeRequest<Page>(this.config, "/me", {
      params: {
        fields:
          fields || "id,name,category,access_token,tasks,about,phone,website",
      },
    });
  }

  /**
   * Get ad accounts associated with the current page (Page Token only)
   */
  async getPageAdAccounts(
    limit: number = 50,
    fields?: string,
  ): Promise<PaginatedResponse<AdAccount>> {
    return makeRequest<PaginatedResponse<AdAccount>>(
      this.config,
      "/me/adaccounts",
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
   * Get the current page info (Page Token only)
   * This returns the page itself, not a list
   */
  async getPageAccountPages(): Promise<Page> {
    return this.getPageInfo();
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

  /**
   * Create a new campaign
   */
  async createCampaign(
    accountId: string,
    params: CreateCampaignParams,
  ): Promise<MutationResponse> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const body: Record<string, unknown> = {
      name: params.name,
      objective: params.objective,
      status: params.status || "PAUSED",
      special_ad_categories: params.special_ad_categories || [],
    };

    // Add optional budget fields
    if (params.daily_budget) {
      body.daily_budget = params.daily_budget;
    }
    if (params.lifetime_budget) {
      body.lifetime_budget = params.lifetime_budget;
    }
    if (params.start_time) {
      body.start_time = params.start_time;
    }
    if (params.stop_time) {
      body.stop_time = params.stop_time;
    }
    if (params.buying_type) {
      body.buying_type = params.buying_type;
    }
    if (params.bid_strategy) {
      body.bid_strategy = params.bid_strategy;
    }

    return makeRequest<MutationResponse>(
      this.config,
      `/${formattedId}/campaigns`,
      {
        method: "POST",
        body,
      },
    );
  }

  /**
   * Update an existing campaign
   */
  async updateCampaign(
    campaignId: string,
    params: UpdateCampaignParams,
  ): Promise<MutationResponse> {
    const body: Record<string, unknown> = {};

    if (params.name !== undefined) {
      body.name = params.name;
    }
    if (params.status !== undefined) {
      body.status = params.status;
    }
    if (params.daily_budget !== undefined) {
      body.daily_budget = params.daily_budget;
    }
    if (params.lifetime_budget !== undefined) {
      body.lifetime_budget = params.lifetime_budget;
    }
    if (params.start_time !== undefined) {
      body.start_time = params.start_time;
    }
    if (params.stop_time !== undefined) {
      body.stop_time = params.stop_time;
    }
    if (params.bid_strategy !== undefined) {
      body.bid_strategy = params.bid_strategy;
    }

    return makeRequest<MutationResponse>(this.config, `/${campaignId}`, {
      method: "POST",
      body,
    });
  }

  /**
   * Delete a campaign
   */
  async deleteCampaign(campaignId: string): Promise<DeleteResponse> {
    return makeRequest<DeleteResponse>(this.config, `/${campaignId}`, {
      method: "DELETE",
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

  /**
   * Create a new ad set
   */
  async createAdSet(
    accountId: string,
    params: CreateAdSetParams,
  ): Promise<MutationResponse> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const body: Record<string, unknown> = {
      campaign_id: params.campaign_id,
      name: params.name,
      status: params.status || "PAUSED",
      targeting: JSON.stringify(params.targeting), // Meta API expects targeting as JSON string
      optimization_goal: params.optimization_goal,
      billing_event: params.billing_event,
    };

    // Add optional fields
    if (params.bid_strategy) {
      body.bid_strategy = params.bid_strategy;
    }
    if (params.bid_amount) {
      body.bid_amount = params.bid_amount;
    }
    if (params.daily_budget) {
      body.daily_budget = params.daily_budget;
    }
    if (params.lifetime_budget) {
      body.lifetime_budget = params.lifetime_budget;
    }
    if (params.start_time) {
      body.start_time = params.start_time;
    }
    if (params.end_time) {
      body.end_time = params.end_time;
    }
    if (params.promoted_object) {
      body.promoted_object = params.promoted_object;
    }
    if (params.destination_type) {
      body.destination_type = params.destination_type;
    }
    if (params.attribution_spec) {
      body.attribution_spec = params.attribution_spec;
    }

    return makeRequest<MutationResponse>(
      this.config,
      `/${formattedId}/adsets`,
      {
        method: "POST",
        body,
      },
    );
  }

  /**
   * Update an existing ad set
   */
  async updateAdSet(
    adsetId: string,
    params: UpdateAdSetParams,
  ): Promise<MutationResponse> {
    const body: Record<string, unknown> = {};

    if (params.name !== undefined) {
      body.name = params.name;
    }
    if (params.status !== undefined) {
      body.status = params.status;
    }
    if (params.targeting !== undefined) {
      body.targeting = JSON.stringify(params.targeting); // Meta API expects targeting as JSON string
    }
    if (params.optimization_goal !== undefined) {
      body.optimization_goal = params.optimization_goal;
    }
    if (params.billing_event !== undefined) {
      body.billing_event = params.billing_event;
    }
    if (params.bid_strategy !== undefined) {
      body.bid_strategy = params.bid_strategy;
    }
    if (params.bid_amount !== undefined) {
      body.bid_amount = params.bid_amount;
    }
    if (params.daily_budget !== undefined) {
      body.daily_budget = params.daily_budget;
    }
    if (params.lifetime_budget !== undefined) {
      body.lifetime_budget = params.lifetime_budget;
    }
    if (params.start_time !== undefined) {
      body.start_time = params.start_time;
    }
    if (params.end_time !== undefined) {
      body.end_time = params.end_time;
    }

    return makeRequest<MutationResponse>(this.config, `/${adsetId}`, {
      method: "POST",
      body,
    });
  }

  /**
   * Delete an ad set
   */
  async deleteAdSet(adsetId: string): Promise<DeleteResponse> {
    return makeRequest<DeleteResponse>(this.config, `/${adsetId}`, {
      method: "DELETE",
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

  /**
   * Create a new ad
   */
  async createAd(
    accountId: string,
    params: CreateAdParams,
  ): Promise<MutationResponse> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const body: Record<string, unknown> = {
      adset_id: params.adset_id,
      name: params.name,
      status: params.status || "PAUSED",
      creative: params.creative,
    };

    if (params.tracking_specs) {
      body.tracking_specs = params.tracking_specs;
    }
    if (params.conversion_domain) {
      body.conversion_domain = params.conversion_domain;
    }

    return makeRequest<MutationResponse>(this.config, `/${formattedId}/ads`, {
      method: "POST",
      body,
    });
  }

  /**
   * Update an existing ad
   */
  async updateAd(
    adId: string,
    params: UpdateAdParams,
  ): Promise<MutationResponse> {
    const body: Record<string, unknown> = {};

    if (params.name !== undefined) {
      body.name = params.name;
    }
    if (params.status !== undefined) {
      body.status = params.status;
    }
    if (params.creative !== undefined) {
      body.creative = params.creative;
    }

    return makeRequest<MutationResponse>(this.config, `/${adId}`, {
      method: "POST",
      body,
    });
  }

  /**
   * Delete an ad
   */
  async deleteAd(adId: string): Promise<DeleteResponse> {
    return makeRequest<DeleteResponse>(this.config, `/${adId}`, {
      method: "DELETE",
    });
  }

  /**
   * Upload an image to use in ad creatives
   * @param accountId - The ad account ID
   * @param imageUrl - URL of the image to upload (Meta will fetch it)
   * @returns Image hash and URL
   */
  async uploadAdImage(
    accountId: string,
    imageUrl: string,
  ): Promise<ImageUploadResponse> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const response = await makeRequest<{
      images: Record<
        string,
        { hash: string; url: string; width?: number; height?: number }
      >;
    }>(this.config, `/${formattedId}/adimages`, {
      method: "POST",
      body: {
        url: imageUrl,
      },
    });

    // The response contains the image info keyed by filename
    const imageKey = Object.keys(response.images)[0];
    const imageData = response.images[imageKey];

    return {
      hash: imageData.hash,
      url: imageData.url,
      width: imageData.width,
      height: imageData.height,
    };
  }

  /**
   * Upload an image using base64 encoded bytes
   * @param accountId - The ad account ID
   * @param imageBytes - Base64 encoded image bytes
   * @param filename - Optional filename for the image
   * @returns Image hash and URL
   */
  async uploadAdImageBytes(
    accountId: string,
    imageBytes: string,
    filename?: string,
  ): Promise<ImageUploadResponse> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const body: Record<string, unknown> = {
      bytes: imageBytes,
    };

    if (filename) {
      body.filename = filename;
    }

    const response = await makeRequest<{
      images: Record<
        string,
        { hash: string; url: string; width?: number; height?: number }
      >;
    }>(this.config, `/${formattedId}/adimages`, {
      method: "POST",
      body,
    });

    const imageKey = Object.keys(response.images)[0];
    const imageData = response.images[imageKey];

    return {
      hash: imageData.hash,
      url: imageData.url,
      width: imageData.width,
      height: imageData.height,
    };
  }

  /**
   * Create an ad creative
   */
  async createAdCreative(
    accountId: string,
    params: CreateAdCreativeParams,
  ): Promise<MutationResponse> {
    const formattedId = accountId.startsWith("act_")
      ? accountId
      : `act_${accountId}`;

    const body: Record<string, unknown> = {};

    if (params.name) {
      body.name = params.name;
    }
    if (params.object_story_spec) {
      body.object_story_spec = params.object_story_spec;
    }
    if (params.effective_object_story_id) {
      body.effective_object_story_id = params.effective_object_story_id;
    }
    if (params.source_instagram_media_id) {
      body.source_instagram_media_id = params.source_instagram_media_id;
    }
    if (params.object_url) {
      body.object_url = params.object_url;
    }
    if (params.title) {
      body.title = params.title;
    }
    if (params.body) {
      body.body = params.body;
    }
    if (params.image_hash) {
      body.image_hash = params.image_hash;
    }
    if (params.video_id) {
      body.video_id = params.video_id;
    }
    if (params.link_url) {
      body.link_url = params.link_url;
    }
    if (params.call_to_action_type) {
      body.call_to_action_type = params.call_to_action_type;
    }
    if (params.url_tags) {
      body.url_tags = params.url_tags;
    }
    if (params.degrees_of_freedom_spec) {
      body.degrees_of_freedom_spec = params.degrees_of_freedom_spec;
    }

    return makeRequest<MutationResponse>(
      this.config,
      `/${formattedId}/adcreatives`,
      {
        method: "POST",
        body,
      },
    );
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
