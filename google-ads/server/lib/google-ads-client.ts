/**
 * Google Ads API client
 * Handles all communication with the Google Ads API v18
 */

import { ENDPOINTS, DEFAULT_PAGE_SIZE, GAQL_QUERIES } from "../constants.ts";
import {
  GoogleAdsApiError,
  type Customer,
  type Campaign,
  type AdGroup,
  type AdGroupAd,
  type AdGroupCriterion,
  type ListAccessibleCustomersResponse,
  type SearchGoogleAdsResponse,
  type SearchGoogleAdsStreamResponse,
  type GoogleAdsRow,
  type MutateCampaignsResponse,
  type MutateCampaignBudgetsResponse,
  type MutateAdGroupsResponse,
  type MutateAdGroupAdsResponse,
  type MutateAdGroupCriteriaResponse,
  type CreateCampaignInput,
  type UpdateCampaignInput,
  type CreateCampaignBudgetInput,
  type CreateAdGroupInput,
  type UpdateAdGroupInput,
  type CreateResponsiveSearchAdInput,
  type UpdateAdGroupAdInput,
  type CreateKeywordInput,
  type UpdateKeywordInput,
  type ApiErrorResponse,
  type GoogleAdsError,
  type CampaignStatus,
  type AdGroupStatus,
  type AdGroupAdStatus,
  type AdGroupCriterionStatus,
} from "./types.ts";

export interface GoogleAdsClientConfig {
  accessToken: string;
  developerToken: string;
}

/**
 * Google Ads API Client
 * Provides typed methods for interacting with Google Ads resources
 */
export class GoogleAdsClient {
  private accessToken: string;
  private developerToken: string;

  constructor(config: GoogleAdsClientConfig) {
    this.accessToken = config.accessToken;
    this.developerToken = config.developerToken;
  }

  /**
   * Make a request to the Google Ads API
   * @throws GoogleAdsApiError on API errors with details
   */
  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "developer-token": this.developerToken,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Google Ads API error: ${response.status}`;
      let errorDetails: GoogleAdsError | undefined;

      try {
        const errorData = JSON.parse(errorText) as ApiErrorResponse;
        errorMessage = errorData.error?.message || errorMessage;

        // Extract detailed error information if available
        if (errorData.error?.details) {
          const googleAdsDetails = errorData.error.details.find(
            (d) => d["@type"]?.includes("GoogleAdsFailure") && d.errors,
          );
          if (googleAdsDetails?.errors) {
            errorDetails = { errors: googleAdsDetails.errors };
          }
        }
      } catch {
        errorMessage = `${errorMessage} - ${errorText}`;
      }

      throw new GoogleAdsApiError(
        errorMessage,
        response.status,
        response.statusText,
        errorDetails,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  /**
   * Execute a GAQL query using the search endpoint
   * @param customerId - Customer ID (without hyphens)
   * @param query - GAQL query string
   * @param pageToken - Optional page token for pagination
   * @param pageSize - Optional page size (default: 1000)
   */
  async search(
    customerId: string,
    query: string,
    pageToken?: string,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<SearchGoogleAdsResponse> {
    const body: Record<string, string | number> = {
      query: query.trim(),
      pageSize,
    };

    if (pageToken) {
      body.pageToken = pageToken;
    }

    return this.request<SearchGoogleAdsResponse>(ENDPOINTS.SEARCH(customerId), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Execute a GAQL query using the search stream endpoint
   * Returns all results without pagination
   * @param customerId - Customer ID (without hyphens)
   * @param query - GAQL query string
   */
  async searchStream(
    customerId: string,
    query: string,
  ): Promise<SearchGoogleAdsStreamResponse> {
    // searchStream returns array of response objects, we need to combine them
    const responses = await this.request<SearchGoogleAdsStreamResponse[]>(
      ENDPOINTS.SEARCH_STREAM(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          query: query.trim(),
        }),
      },
    );

    // Combine all results from the stream
    const combinedResults: GoogleAdsRow[] = [];
    let fieldMask: string | undefined;
    let requestId: string | undefined;

    if (Array.isArray(responses)) {
      for (const response of responses) {
        if (response.results) {
          combinedResults.push(...response.results);
        }
        if (response.fieldMask) {
          fieldMask = response.fieldMask;
        }
        if (response.requestId) {
          requestId = response.requestId;
        }
      }
    }

    return {
      results: combinedResults,
      fieldMask,
      requestId,
    };
  }

  // ==================== Account Methods ====================

  /**
   * List all accessible customers for the authenticated user
   */
  async listAccessibleCustomers(): Promise<ListAccessibleCustomersResponse> {
    return this.request<ListAccessibleCustomersResponse>(
      ENDPOINTS.LIST_ACCESSIBLE_CUSTOMERS,
    );
  }

  /**
   * Get customer details using GAQL
   * @param customerId - Customer ID (without hyphens)
   */
  async getCustomer(customerId: string): Promise<Customer | null> {
    const response = await this.search(customerId, GAQL_QUERIES.GET_CUSTOMER);
    return response.results?.[0]?.customer || null;
  }

  // ==================== Campaign Methods ====================

  /**
   * List all campaigns for a customer
   * @param customerId - Customer ID
   * @param statusFilter - Optional status filter
   */
  async listCampaigns(
    customerId: string,
    statusFilter?: CampaignStatus,
  ): Promise<Campaign[]> {
    const query = statusFilter
      ? `
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
        WHERE campaign.status = '${statusFilter}'
        ORDER BY campaign.name
      `
      : GAQL_QUERIES.LIST_CAMPAIGNS;

    const response = await this.searchStream(customerId, query);
    return response.results
      .filter(
        (row): row is GoogleAdsRow & { campaign: Campaign } => !!row.campaign,
      )
      .map((row) => row.campaign);
  }

  /**
   * Get a specific campaign by ID
   * @param customerId - Customer ID
   * @param campaignId - Campaign ID
   */
  async getCampaign(
    customerId: string,
    campaignId: string,
  ): Promise<Campaign | null> {
    const query = `
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
        campaign.serving_status,
        campaign.network_settings.target_google_search,
        campaign.network_settings.target_search_network,
        campaign.network_settings.target_content_network
      FROM campaign
      WHERE campaign.id = ${campaignId}
    `;

    const response = await this.search(customerId, query);
    return response.results?.[0]?.campaign || null;
  }

  /**
   * Create a campaign budget
   * @param customerId - Customer ID
   * @param input - Budget creation input
   */
  async createCampaignBudget(
    customerId: string,
    input: CreateCampaignBudgetInput,
  ): Promise<MutateCampaignBudgetsResponse> {
    const operation = {
      create: {
        name: input.name,
        amountMicros: input.amountMicros,
        deliveryMethod: input.deliveryMethod || "STANDARD",
        explicitlyShared: input.explicitlyShared ?? false,
      },
    };

    return this.request<MutateCampaignBudgetsResponse>(
      ENDPOINTS.CAMPAIGN_BUDGETS_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [operation],
        }),
      },
    );
  }

  /**
   * Create a new campaign
   * @param customerId - Customer ID
   * @param input - Campaign creation input
   */
  async createCampaign(
    customerId: string,
    input: CreateCampaignInput,
  ): Promise<MutateCampaignsResponse> {
    const campaign: Record<string, unknown> = {
      name: input.name,
      advertisingChannelType: input.advertisingChannelType,
      status: input.status || "PAUSED",
      campaignBudget: input.campaignBudget,
    };

    if (input.startDate) {
      campaign.startDate = input.startDate;
    }
    if (input.endDate) {
      campaign.endDate = input.endDate;
    }
    if (input.networkSettings) {
      campaign.networkSettings = input.networkSettings;
    }
    if (input.manualCpc) {
      campaign.manualCpc = input.manualCpc;
    }
    if (input.targetCpaMicros) {
      campaign.targetCpa = { targetCpaMicros: input.targetCpaMicros };
    }
    if (input.targetRoas) {
      campaign.targetRoas = { targetRoas: input.targetRoas };
    }

    return this.request<MutateCampaignsResponse>(
      ENDPOINTS.CAMPAIGNS_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [{ create: campaign }],
        }),
      },
    );
  }

  /**
   * Update an existing campaign
   * @param customerId - Customer ID
   * @param input - Campaign update input
   */
  async updateCampaign(
    customerId: string,
    input: UpdateCampaignInput,
  ): Promise<MutateCampaignsResponse> {
    const campaign: Record<string, unknown> = {
      resourceName: input.resourceName,
    };
    const updateMask: string[] = [];

    if (input.name !== undefined) {
      campaign.name = input.name;
      updateMask.push("name");
    }
    if (input.status !== undefined) {
      campaign.status = input.status;
      updateMask.push("status");
    }
    if (input.startDate !== undefined) {
      campaign.startDate = input.startDate;
      updateMask.push("start_date");
    }
    if (input.endDate !== undefined) {
      campaign.endDate = input.endDate;
      updateMask.push("end_date");
    }
    if (input.networkSettings !== undefined) {
      campaign.networkSettings = input.networkSettings;
      updateMask.push("network_settings");
    }
    if (input.targetCpaMicros !== undefined) {
      campaign.targetCpa = { targetCpaMicros: input.targetCpaMicros };
      updateMask.push("target_cpa.target_cpa_micros");
    }
    if (input.targetRoas !== undefined) {
      campaign.targetRoas = { targetRoas: input.targetRoas };
      updateMask.push("target_roas.target_roas");
    }

    return this.request<MutateCampaignsResponse>(
      ENDPOINTS.CAMPAIGNS_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [
            {
              update: campaign,
              updateMask: updateMask.join(","),
            },
          ],
        }),
      },
    );
  }

  /**
   * Update campaign status (pause, enable, remove)
   * @param customerId - Customer ID
   * @param campaignResourceName - Campaign resource name
   * @param status - New status
   */
  async updateCampaignStatus(
    customerId: string,
    campaignResourceName: string,
    status: CampaignStatus,
  ): Promise<MutateCampaignsResponse> {
    return this.updateCampaign(customerId, {
      resourceName: campaignResourceName,
      status,
    });
  }

  // ==================== Ad Group Methods ====================

  /**
   * List ad groups for a customer
   * @param customerId - Customer ID
   * @param campaignId - Optional campaign ID to filter by
   */
  async listAdGroups(
    customerId: string,
    campaignId?: string,
  ): Promise<AdGroup[]> {
    const query = campaignId
      ? GAQL_QUERIES.LIST_AD_GROUPS_BY_CAMPAIGN(campaignId)
      : GAQL_QUERIES.LIST_AD_GROUPS;

    const response = await this.searchStream(customerId, query);
    return response.results
      .filter(
        (row): row is GoogleAdsRow & { adGroup: AdGroup } => !!row.adGroup,
      )
      .map((row) => row.adGroup);
  }

  /**
   * Get a specific ad group by ID
   * @param customerId - Customer ID
   * @param adGroupId - Ad group ID
   */
  async getAdGroup(
    customerId: string,
    adGroupId: string,
  ): Promise<AdGroup | null> {
    const query = `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.campaign,
        ad_group.status,
        ad_group.type,
        ad_group.cpc_bid_micros,
        ad_group.cpm_bid_micros,
        ad_group.target_cpa_micros
      FROM ad_group
      WHERE ad_group.id = ${adGroupId}
    `;

    const response = await this.search(customerId, query);
    return response.results?.[0]?.adGroup || null;
  }

  /**
   * Create a new ad group
   * @param customerId - Customer ID
   * @param input - Ad group creation input
   */
  async createAdGroup(
    customerId: string,
    input: CreateAdGroupInput,
  ): Promise<MutateAdGroupsResponse> {
    const adGroup: Record<string, unknown> = {
      name: input.name,
      campaign: input.campaign,
      status: input.status || "PAUSED",
    };

    if (input.type) {
      adGroup.type = input.type;
    }
    if (input.cpcBidMicros) {
      adGroup.cpcBidMicros = input.cpcBidMicros;
    }
    if (input.cpmBidMicros) {
      adGroup.cpmBidMicros = input.cpmBidMicros;
    }
    if (input.targetCpaMicros) {
      adGroup.targetCpaMicros = input.targetCpaMicros;
    }

    return this.request<MutateAdGroupsResponse>(
      ENDPOINTS.AD_GROUPS_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [{ create: adGroup }],
        }),
      },
    );
  }

  /**
   * Update an existing ad group
   * @param customerId - Customer ID
   * @param input - Ad group update input
   */
  async updateAdGroup(
    customerId: string,
    input: UpdateAdGroupInput,
  ): Promise<MutateAdGroupsResponse> {
    const adGroup: Record<string, unknown> = {
      resourceName: input.resourceName,
    };
    const updateMask: string[] = [];

    if (input.name !== undefined) {
      adGroup.name = input.name;
      updateMask.push("name");
    }
    if (input.status !== undefined) {
      adGroup.status = input.status;
      updateMask.push("status");
    }
    if (input.cpcBidMicros !== undefined) {
      adGroup.cpcBidMicros = input.cpcBidMicros;
      updateMask.push("cpc_bid_micros");
    }
    if (input.cpmBidMicros !== undefined) {
      adGroup.cpmBidMicros = input.cpmBidMicros;
      updateMask.push("cpm_bid_micros");
    }
    if (input.targetCpaMicros !== undefined) {
      adGroup.targetCpaMicros = input.targetCpaMicros;
      updateMask.push("target_cpa_micros");
    }

    return this.request<MutateAdGroupsResponse>(
      ENDPOINTS.AD_GROUPS_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [
            {
              update: adGroup,
              updateMask: updateMask.join(","),
            },
          ],
        }),
      },
    );
  }

  /**
   * Update ad group status
   * @param customerId - Customer ID
   * @param adGroupResourceName - Ad group resource name
   * @param status - New status
   */
  async updateAdGroupStatus(
    customerId: string,
    adGroupResourceName: string,
    status: AdGroupStatus,
  ): Promise<MutateAdGroupsResponse> {
    return this.updateAdGroup(customerId, {
      resourceName: adGroupResourceName,
      status,
    });
  }

  // ==================== Ad Methods ====================

  /**
   * List ads for a customer
   * @param customerId - Customer ID
   * @param adGroupId - Optional ad group ID to filter by
   */
  async listAds(customerId: string, adGroupId?: string): Promise<AdGroupAd[]> {
    const query = adGroupId
      ? GAQL_QUERIES.LIST_ADS_BY_AD_GROUP(adGroupId)
      : GAQL_QUERIES.LIST_ADS;

    const response = await this.searchStream(customerId, query);
    return response.results
      .filter(
        (row): row is GoogleAdsRow & { adGroupAd: AdGroupAd } =>
          !!row.adGroupAd,
      )
      .map((row) => row.adGroupAd);
  }

  /**
   * Get a specific ad by ID
   * @param customerId - Customer ID
   * @param adGroupId - Ad group ID
   * @param adId - Ad ID
   */
  async getAd(
    customerId: string,
    adGroupId: string,
    adId: string,
  ): Promise<AdGroupAd | null> {
    const query = `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.display_url,
        ad_group_ad.ad_group,
        ad_group_ad.status,
        ad_group_ad.policy_summary.approval_status,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad.responsive_search_ad.path1,
        ad_group_ad.ad.responsive_search_ad.path2
      FROM ad_group_ad
      WHERE ad_group.id = ${adGroupId}
        AND ad_group_ad.ad.id = ${adId}
    `;

    const response = await this.search(customerId, query);
    return response.results?.[0]?.adGroupAd || null;
  }

  /**
   * Create a responsive search ad
   * @param customerId - Customer ID
   * @param input - Ad creation input
   */
  async createResponsiveSearchAd(
    customerId: string,
    input: CreateResponsiveSearchAdInput,
  ): Promise<MutateAdGroupAdsResponse> {
    const adGroupAd = {
      adGroup: input.adGroup,
      status: input.status || "PAUSED",
      ad: {
        finalUrls: input.finalUrls,
        responsiveSearchAd: {
          headlines: input.headlines,
          descriptions: input.descriptions,
          path1: input.path1,
          path2: input.path2,
        },
      },
    };

    return this.request<MutateAdGroupAdsResponse>(
      ENDPOINTS.AD_GROUP_ADS_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [{ create: adGroupAd }],
        }),
      },
    );
  }

  /**
   * Update an ad (mainly status changes)
   * @param customerId - Customer ID
   * @param input - Ad update input
   */
  async updateAdGroupAd(
    customerId: string,
    input: UpdateAdGroupAdInput,
  ): Promise<MutateAdGroupAdsResponse> {
    const adGroupAd: Record<string, unknown> = {
      resourceName: input.resourceName,
    };
    const updateMask: string[] = [];

    if (input.status !== undefined) {
      adGroupAd.status = input.status;
      updateMask.push("status");
    }

    return this.request<MutateAdGroupAdsResponse>(
      ENDPOINTS.AD_GROUP_ADS_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [
            {
              update: adGroupAd,
              updateMask: updateMask.join(","),
            },
          ],
        }),
      },
    );
  }

  /**
   * Update ad status
   * @param customerId - Customer ID
   * @param adResourceName - Ad resource name
   * @param status - New status
   */
  async updateAdStatus(
    customerId: string,
    adResourceName: string,
    status: AdGroupAdStatus,
  ): Promise<MutateAdGroupAdsResponse> {
    return this.updateAdGroupAd(customerId, {
      resourceName: adResourceName,
      status,
    });
  }

  // ==================== Keyword Methods ====================

  /**
   * List keywords for a customer
   * @param customerId - Customer ID
   * @param adGroupId - Optional ad group ID to filter by
   */
  async listKeywords(
    customerId: string,
    adGroupId?: string,
  ): Promise<AdGroupCriterion[]> {
    const query = adGroupId
      ? GAQL_QUERIES.LIST_KEYWORDS_BY_AD_GROUP(adGroupId)
      : GAQL_QUERIES.LIST_KEYWORDS;

    const response = await this.searchStream(customerId, query);
    return response.results
      .filter(
        (row): row is GoogleAdsRow & { adGroupCriterion: AdGroupCriterion } =>
          !!row.adGroupCriterion,
      )
      .map((row) => row.adGroupCriterion);
  }

  /**
   * Get a specific keyword by criterion ID
   * @param customerId - Customer ID
   * @param adGroupId - Ad group ID
   * @param criterionId - Criterion ID
   */
  async getKeyword(
    customerId: string,
    adGroupId: string,
    criterionId: string,
  ): Promise<AdGroupCriterion | null> {
    const query = `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.ad_group,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.cpc_bid_micros,
        ad_group_criterion.negative,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.position_estimates.first_page_cpc_micros,
        ad_group_criterion.position_estimates.top_of_page_cpc_micros
      FROM ad_group_criterion
      WHERE ad_group.id = ${adGroupId}
        AND ad_group_criterion.criterion_id = ${criterionId}
        AND ad_group_criterion.type = 'KEYWORD'
    `;

    const response = await this.search(customerId, query);
    return response.results?.[0]?.adGroupCriterion || null;
  }

  /**
   * Create a new keyword
   * @param customerId - Customer ID
   * @param input - Keyword creation input
   */
  async createKeyword(
    customerId: string,
    input: CreateKeywordInput,
  ): Promise<MutateAdGroupCriteriaResponse> {
    const criterion: Record<string, unknown> = {
      adGroup: input.adGroup,
      status: input.status || "ENABLED",
      keyword: {
        text: input.keyword.text,
        matchType: input.keyword.matchType,
      },
    };

    if (input.cpcBidMicros) {
      criterion.cpcBidMicros = input.cpcBidMicros;
    }
    if (input.finalUrls) {
      criterion.finalUrls = input.finalUrls;
    }
    if (input.negative !== undefined) {
      criterion.negative = input.negative;
    }

    return this.request<MutateAdGroupCriteriaResponse>(
      ENDPOINTS.AD_GROUP_CRITERIA_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [{ create: criterion }],
        }),
      },
    );
  }

  /**
   * Update an existing keyword
   * @param customerId - Customer ID
   * @param input - Keyword update input
   */
  async updateKeyword(
    customerId: string,
    input: UpdateKeywordInput,
  ): Promise<MutateAdGroupCriteriaResponse> {
    const criterion: Record<string, unknown> = {
      resourceName: input.resourceName,
    };
    const updateMask: string[] = [];

    if (input.status !== undefined) {
      criterion.status = input.status;
      updateMask.push("status");
    }
    if (input.cpcBidMicros !== undefined) {
      criterion.cpcBidMicros = input.cpcBidMicros;
      updateMask.push("cpc_bid_micros");
    }
    if (input.finalUrls !== undefined) {
      criterion.finalUrls = input.finalUrls;
      updateMask.push("final_urls");
    }

    return this.request<MutateAdGroupCriteriaResponse>(
      ENDPOINTS.AD_GROUP_CRITERIA_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [
            {
              update: criterion,
              updateMask: updateMask.join(","),
            },
          ],
        }),
      },
    );
  }

  /**
   * Update keyword status
   * @param customerId - Customer ID
   * @param keywordResourceName - Keyword resource name
   * @param status - New status
   */
  async updateKeywordStatus(
    customerId: string,
    keywordResourceName: string,
    status: AdGroupCriterionStatus,
  ): Promise<MutateAdGroupCriteriaResponse> {
    return this.updateKeyword(customerId, {
      resourceName: keywordResourceName,
      status,
    });
  }

  /**
   * Remove a keyword
   * @param customerId - Customer ID
   * @param keywordResourceName - Keyword resource name
   */
  async removeKeyword(
    customerId: string,
    keywordResourceName: string,
  ): Promise<MutateAdGroupCriteriaResponse> {
    return this.request<MutateAdGroupCriteriaResponse>(
      ENDPOINTS.AD_GROUP_CRITERIA_MUTATE(customerId),
      {
        method: "POST",
        body: JSON.stringify({
          operations: [{ remove: keywordResourceName }],
        }),
      },
    );
  }

  // ==================== Report Methods ====================

  /**
   * Get account performance report
   * @param customerId - Customer ID
   * @param dateRange - Date range preset (e.g., LAST_30_DAYS)
   */
  async getAccountPerformance(
    customerId: string,
    dateRange: string,
  ): Promise<GoogleAdsRow[]> {
    const query = GAQL_QUERIES.ACCOUNT_PERFORMANCE_REPORT(dateRange);
    const response = await this.search(customerId, query);
    return response.results || [];
  }

  /**
   * Get campaign performance report
   * @param customerId - Customer ID
   * @param dateRange - Date range preset
   * @param campaignId - Optional campaign ID to filter
   */
  async getCampaignPerformance(
    customerId: string,
    dateRange: string,
    campaignId?: string,
  ): Promise<GoogleAdsRow[]> {
    let query = GAQL_QUERIES.CAMPAIGN_PERFORMANCE_REPORT(dateRange);

    if (campaignId) {
      query = `
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
        WHERE campaign.id = ${campaignId}
          AND segments.date DURING ${dateRange}
        ORDER BY segments.date DESC
      `;
    }

    const response = await this.searchStream(customerId, query);
    return response.results || [];
  }

  /**
   * Get ad group performance report
   * @param customerId - Customer ID
   * @param dateRange - Date range preset
   * @param campaignId - Optional campaign ID to filter
   */
  async getAdGroupPerformance(
    customerId: string,
    dateRange: string,
    campaignId?: string,
  ): Promise<GoogleAdsRow[]> {
    let whereClause = `segments.date DURING ${dateRange}`;
    if (campaignId) {
      whereClause += ` AND campaign.id = ${campaignId}`;
    }

    const query = `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.campaign,
        ad_group.status,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM ad_group
      WHERE ${whereClause}
      ORDER BY segments.date DESC
    `;

    const response = await this.searchStream(customerId, query);
    return response.results || [];
  }

  /**
   * Get keyword performance report
   * @param customerId - Customer ID
   * @param dateRange - Date range preset
   * @param adGroupId - Optional ad group ID to filter
   */
  async getKeywordPerformance(
    customerId: string,
    dateRange: string,
    adGroupId?: string,
  ): Promise<GoogleAdsRow[]> {
    let whereClause = `ad_group_criterion.type = 'KEYWORD' AND segments.date DURING ${dateRange}`;
    if (adGroupId) {
      whereClause += ` AND ad_group.id = ${adGroupId}`;
    }

    const query = `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group.name,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        ad_group_criterion.quality_info.quality_score
      FROM ad_group_criterion
      WHERE ${whereClause}
      ORDER BY metrics.impressions DESC
    `;

    const response = await this.searchStream(customerId, query);
    return response.results || [];
  }
}

// Re-export helpers from env.ts for convenience
export {
  getGoogleAccessToken as getAccessToken,
  getDeveloperToken,
  createGoogleAdsClient,
} from "./env.ts";
