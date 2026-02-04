import { DATAFORSEO_BASE_URL } from "../constants.ts";
import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";
import type { Env } from "../types/env.ts";

export interface DataForSeoClientConfig {
  login: string;
  password: string;
}

export interface DataForSeoTaskResponse {
  version: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    result_count: number;
    path: string[];
    data: unknown;
    result?: unknown[];
  }>;
}

export interface KeywordData {
  keyword: string;
  search_volume: number;
  cpc: number;
  competition: number;
  competition_level: string;
  monthly_searches: Array<{
    year: number;
    month: number;
    search_volume: number;
  }>;
}

export interface SerpItem {
  type: string;
  rank_group: number;
  rank_absolute: number;
  position: string;
  url: string;
  domain: string;
  title: string;
  description: string;
  breadcrumb?: string;
  is_paid?: boolean;
  rating?: {
    value: number;
    votes_count: number;
  };
}

export interface BacklinksOverview {
  target: string;
  total_backlinks: number;
  total_pages: number;
  total_domains: number;
  broken_backlinks: number;
  broken_pages: number;
  referring_domains: number;
  referring_main_domains: number;
  referring_ips: number;
  referring_subnets: number;
  referring_pages: number;
  dofollow: number;
  nofollow: number;
  gov_domains: number;
  edu_domains: number;
  rank: number;
  main_domain_rank: number;
  last_updated_time: string;
}

export interface TrafficOverview {
  target: string;
  date: string;
  rank: number;
  visits: number;
  unique_visitors: number;
  pages_per_visit: number;
  avg_visit_duration: number;
  bounce_rate: number;
  users_expected_visits_rate: number;
}

async function makeDataForSeoRequest(
  config: DataForSeoClientConfig,
  endpoint: string,
  method: "GET" | "POST",
  body?: any,
): Promise<DataForSeoTaskResponse> {
  // Validate credentials
  if (!config.login || !config.password) {
    throw new Error(
      "DataForSEO credentials are required. Please configure login and password in the MCP settings.",
    );
  }

  const url = `${DATAFORSEO_BASE_URL}${endpoint}`;
  const basicAuth = btoa(`${config.login}:${config.password}`);

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
  };

  if (body && method === "POST") {
    options.body = JSON.stringify(body);
  }

  const response = (await makeApiRequest(
    url,
    options,
    "DataForSEO",
  )) as DataForSeoTaskResponse;

  // Check for authentication errors
  if (response.status_code === 40100) {
    throw new Error(
      "DataForSEO authentication failed. Please verify your credentials at https://app.dataforseo.com/api-access",
    );
  }

  return response;
}

// Keywords Data API
async function getSearchVolume(
  config: DataForSeoClientConfig,
  keywords: string[],
  languageName?: string,
  locationName?: string,
  languageCode?: string,
  locationCode?: number,
): Promise<DataForSeoTaskResponse> {
  return makeDataForSeoRequest(
    config,
    "/keywords_data/google/search_volume/live",
    "POST",
    [
      {
        keywords,
        language_name: languageName,
        location_name: locationName,
        language_code: languageCode,
        location_code: locationCode,
      },
    ],
  );
}

async function getRelatedKeywords(
  config: DataForSeoClientConfig,
  keyword: string,
  locationName: string = "United States",
  languageName: string = "English",
  locationCode?: number,
  languageCode?: string,
  depth?: number,
  limit?: number,
): Promise<DataForSeoTaskResponse> {
  return makeDataForSeoRequest(
    config,
    "/dataforseo_labs/google/related_keywords/live",
    "POST",
    [
      {
        keyword,
        location_name: locationName,
        language_name: languageName,
        location_code: locationCode,
        language_code: languageCode,
        depth,
        limit,
        include_seed_keyword: false,
        include_serp_info: true,
      },
    ],
  );
}

// SERP API
async function getOrganicSerpLive(
  config: DataForSeoClientConfig,
  keyword: string,
  languageCode?: string,
  locationCode?: number,
  device?: "desktop" | "mobile",
  depth?: number,
): Promise<DataForSeoTaskResponse> {
  return makeDataForSeoRequest(
    config,
    "/serp/google/organic/live/advanced",
    "POST",
    [
      {
        keyword,
        language_code: languageCode,
        location_code: locationCode,
        device,
        depth,
        load_serp_features: true,
        calculate_rectangles: false,
      },
    ],
  );
}

async function getNewsSerpLive(
  config: DataForSeoClientConfig,
  keyword: string,
  languageCode?: string,
  locationCode?: number,
  sortBy?: "relevance" | "date",
  timeRange?: "all" | "1h" | "1d" | "1w" | "1m" | "1y",
): Promise<DataForSeoTaskResponse> {
  return makeDataForSeoRequest(
    config,
    "/serp/google/news/live/advanced",
    "POST",
    [
      {
        keyword,
        language_code: languageCode,
        location_code: locationCode,
        sort_by: sortBy,
        time_range: timeRange,
        load_serp_features: true,
      },
    ],
  );
}

// Backlinks API
async function getBacklinksOverview(
  config: DataForSeoClientConfig,
  target: string,
): Promise<DataForSeoTaskResponse> {
  return makeDataForSeoRequest(config, "/backlinks/summary/live", "POST", [
    {
      target,
    },
  ]);
}

async function getBacklinks(
  config: DataForSeoClientConfig,
  target: string,
  limit?: number,
  offset?: number,
): Promise<DataForSeoTaskResponse> {
  return makeDataForSeoRequest(config, "/backlinks/backlinks/live", "POST", [
    {
      target,
      limit,
      offset,
    },
  ]);
}

async function getReferringDomains(
  config: DataForSeoClientConfig,
  target: string,
  limit?: number,
  offset?: number,
): Promise<DataForSeoTaskResponse> {
  return makeDataForSeoRequest(
    config,
    "/backlinks/referring_domains/live",
    "POST",
    [
      {
        target,
        limit,
        offset,
      },
    ],
  );
}

export const createDataForSeoClient = (config: DataForSeoClientConfig) => ({
  // Keywords
  getSearchVolume: (
    keywords: string[],
    languageName?: string,
    locationName?: string,
    languageCode?: string,
    locationCode?: number,
  ) =>
    getSearchVolume(
      config,
      keywords,
      languageName,
      locationName,
      languageCode,
      locationCode,
    ),
  getRelatedKeywords: (
    keyword: string,
    locationName?: string,
    languageName?: string,
    locationCode?: number,
    languageCode?: string,
    depth?: number,
    limit?: number,
  ) =>
    getRelatedKeywords(
      config,
      keyword,
      locationName,
      languageName,
      locationCode,
      languageCode,
      depth,
      limit,
    ),

  // SERP
  getOrganicSerpLive: (
    keyword: string,
    languageCode?: string,
    locationCode?: number,
    device?: "desktop" | "mobile",
    depth?: number,
  ) =>
    getOrganicSerpLive(
      config,
      keyword,
      languageCode,
      locationCode,
      device,
      depth,
    ),
  getNewsSerpLive: (
    keyword: string,
    languageCode?: string,
    locationCode?: number,
    sortBy?: "relevance" | "date",
    timeRange?: "all" | "1h" | "1d" | "1w" | "1m" | "1y",
  ) =>
    getNewsSerpLive(
      config,
      keyword,
      languageCode,
      locationCode,
      sortBy,
      timeRange,
    ),

  // Backlinks
  getBacklinksOverview: (target: string) =>
    getBacklinksOverview(config, target),
  getBacklinks: (target: string, limit?: number, offset?: number) =>
    getBacklinks(config, target, limit, offset),
  getReferringDomains: (target: string, limit?: number, offset?: number) =>
    getReferringDomains(config, target, limit, offset),
});

// Helper to create client from environment
export const getClientFromEnv = (env: Env) => {
  const state = env.MESH_REQUEST_CONTEXT?.state;
  if (!state?.API_CREDENTIALS) {
    throw new Error(
      "DataForSEO credentials not configured. Please set API_CREDENTIALS in the MCP settings.",
    );
  }
  return createDataForSeoClient({
    login: state.API_CREDENTIALS.login,
    password: state.API_CREDENTIALS.password,
  });
};
