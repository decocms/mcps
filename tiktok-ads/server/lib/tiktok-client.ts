/**
 * TikTok Marketing API client
 * Handles all communication with the TikTok Marketing API
 */

import { ENDPOINTS, DEFAULT_PAGE_SIZE } from "../constants.ts";
import type {
  Campaign,
  CampaignListResponse,
  CreateCampaignInput,
  UpdateCampaignInput,
  ListCampaignsInput,
  AdGroup,
  AdGroupListResponse,
  CreateAdGroupInput,
  UpdateAdGroupInput,
  ListAdGroupsInput,
  Ad,
  AdListResponse,
  CreateAdInput,
  UpdateAdInput,
  ListAdsInput,
  ReportResponse,
  GetReportInput,
  Advertiser,
  AdvertiserInfoResponse,
  GetAdvertiserInfoInput,
  ApiResponse,
} from "./types.ts";

export interface TikTokClientConfig {
  accessToken: string;
}

export class TikTokClient {
  private accessToken: string;

  constructor(config: TikTokClientConfig) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `TikTok Marketing API error: ${response.status} - ${error}`,
      );
    }

    const result = (await response.json()) as ApiResponse<T>;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return result.data;
  }

  // ==================== Campaign Methods ====================

  /**
   * List campaigns for an advertiser
   */
  async listCampaigns(input: ListCampaignsInput): Promise<{
    campaigns: Campaign[];
    page_info: {
      page: number;
      page_size: number;
      total_number: number;
      total_page: number;
    };
  }> {
    const body: any = {
      advertiser_id: input.advertiser_id,
      page: input.page || 1,
      page_size: input.page_size || DEFAULT_PAGE_SIZE,
    };

    if (input.campaign_ids?.length) {
      body.filtering = { ...body.filtering, campaign_ids: input.campaign_ids };
    }
    if (input.filtering) {
      body.filtering = { ...body.filtering, ...input.filtering };
    }

    const response = await fetch(ENDPOINTS.CAMPAIGN_GET, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as CampaignListResponse;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return {
      campaigns: result.data.list,
      page_info: result.data.page_info,
    };
  }

  /**
   * Create a new campaign
   */
  async createCampaign(
    input: CreateCampaignInput,
  ): Promise<{ campaign_id: string }> {
    const response = await fetch(ENDPOINTS.CAMPAIGN_CREATE, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as ApiResponse<{
      campaign_id: string;
    }>;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return result.data;
  }

  /**
   * Update an existing campaign
   */
  async updateCampaign(
    input: UpdateCampaignInput,
  ): Promise<{ campaign_id: string }> {
    const response = await fetch(ENDPOINTS.CAMPAIGN_UPDATE, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as ApiResponse<{
      campaign_id: string;
    }>;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return result.data;
  }

  // ==================== Ad Group Methods ====================

  /**
   * List ad groups for an advertiser
   */
  async listAdGroups(input: ListAdGroupsInput): Promise<{
    adgroups: AdGroup[];
    page_info: {
      page: number;
      page_size: number;
      total_number: number;
      total_page: number;
    };
  }> {
    const body: any = {
      advertiser_id: input.advertiser_id,
      page: input.page || 1,
      page_size: input.page_size || DEFAULT_PAGE_SIZE,
    };

    if (input.campaign_ids?.length) {
      body.filtering = { ...body.filtering, campaign_ids: input.campaign_ids };
    }
    if (input.adgroup_ids?.length) {
      body.filtering = { ...body.filtering, adgroup_ids: input.adgroup_ids };
    }
    if (input.filtering) {
      body.filtering = { ...body.filtering, ...input.filtering };
    }

    const response = await fetch(ENDPOINTS.ADGROUP_GET, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as AdGroupListResponse;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return {
      adgroups: result.data.list,
      page_info: result.data.page_info,
    };
  }

  /**
   * Create a new ad group
   */
  async createAdGroup(
    input: CreateAdGroupInput,
  ): Promise<{ adgroup_id: string }> {
    const response = await fetch(ENDPOINTS.ADGROUP_CREATE, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as ApiResponse<{
      adgroup_id: string;
    }>;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return result.data;
  }

  /**
   * Update an existing ad group
   */
  async updateAdGroup(
    input: UpdateAdGroupInput,
  ): Promise<{ adgroup_id: string }> {
    const response = await fetch(ENDPOINTS.ADGROUP_UPDATE, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as ApiResponse<{
      adgroup_id: string;
    }>;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return result.data;
  }

  // ==================== Ad Methods ====================

  /**
   * List ads for an advertiser
   */
  async listAds(input: ListAdsInput): Promise<{
    ads: Ad[];
    page_info: {
      page: number;
      page_size: number;
      total_number: number;
      total_page: number;
    };
  }> {
    const body: any = {
      advertiser_id: input.advertiser_id,
      page: input.page || 1,
      page_size: input.page_size || DEFAULT_PAGE_SIZE,
    };

    if (input.campaign_ids?.length) {
      body.filtering = { ...body.filtering, campaign_ids: input.campaign_ids };
    }
    if (input.adgroup_ids?.length) {
      body.filtering = { ...body.filtering, adgroup_ids: input.adgroup_ids };
    }
    if (input.ad_ids?.length) {
      body.filtering = { ...body.filtering, ad_ids: input.ad_ids };
    }
    if (input.filtering) {
      body.filtering = { ...body.filtering, ...input.filtering };
    }

    const response = await fetch(ENDPOINTS.AD_GET, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as AdListResponse;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return {
      ads: result.data.list,
      page_info: result.data.page_info,
    };
  }

  /**
   * Create a new ad
   */
  async createAd(input: CreateAdInput): Promise<{ ad_id: string }> {
    const response = await fetch(ENDPOINTS.AD_CREATE, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as ApiResponse<{ ad_id: string }>;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return result.data;
  }

  /**
   * Update an existing ad
   */
  async updateAd(input: UpdateAdInput): Promise<{ ad_id: string }> {
    const response = await fetch(ENDPOINTS.AD_UPDATE, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as ApiResponse<{ ad_id: string }>;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return result.data;
  }

  // ==================== Report Methods ====================

  /**
   * Get integrated report data
   */
  async getReport(input: GetReportInput): Promise<{
    rows: Array<{
      dimensions: Record<string, string>;
      metrics: Record<string, number>;
    }>;
    page_info: {
      page: number;
      page_size: number;
      total_number: number;
      total_page: number;
    };
  }> {
    const body: any = {
      advertiser_id: input.advertiser_id,
      data_level: input.data_level,
      dimensions: input.dimensions,
      metrics: input.metrics,
      start_date: input.start_date,
      end_date: input.end_date,
      page: input.page || 1,
      page_size: input.page_size || DEFAULT_PAGE_SIZE,
    };

    if (input.filters) {
      body.filtering = input.filters;
    }

    const response = await fetch(ENDPOINTS.REPORT_INTEGRATED, {
      method: "POST",
      headers: {
        "Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as ReportResponse;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return {
      rows: result.data.list.map((row) => {
        // Extract only numeric metrics, excluding dimensions
        const { dimensions, ...metrics } = row;
        return {
          dimensions,
          metrics: metrics as Record<string, number>,
        };
      }),
      page_info: result.data.page_info,
    };
  }

  // ==================== Advertiser Methods ====================

  /**
   * Get advertiser information
   */
  async getAdvertiserInfo(
    input: GetAdvertiserInfoInput,
  ): Promise<Advertiser[]> {
    // For GET requests, we need to use query params
    const url = new URL(ENDPOINTS.ADVERTISER_INFO);
    url.searchParams.set(
      "advertiser_ids",
      JSON.stringify(input.advertiser_ids),
    );
    if (input.fields?.length) {
      url.searchParams.set("fields", JSON.stringify(input.fields));
    }

    const getResponse = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Access-Token": this.accessToken,
      },
    });

    if (!getResponse.ok) {
      const error = await getResponse.text();
      throw new Error(`TikTok API error: ${getResponse.status} - ${error}`);
    }

    const result = (await getResponse.json()) as AdvertiserInfoResponse;

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.code} - ${result.message}`);
    }

    return result.data.list;
  }
}

// Re-export getTikTokAccessToken from env.ts for convenience
export { getTikTokAccessToken as getAccessToken } from "./env.ts";
