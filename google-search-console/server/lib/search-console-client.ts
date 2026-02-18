/**
 * Google Search Console API client
 * Handles all communication with the Google Search Console API
 */

import { ENDPOINTS } from "../constants.ts";
import type {
  SitesListResponse,
  SiteEntry,
  SearchAnalyticsResponse,
  SearchAnalyticsRequest,
  SitemapsListResponse,
  Sitemap,
  UrlInspectionResult,
  InspectUrlRequest,
} from "./types.ts";

export interface SearchConsoleClientConfig {
  accessToken: string;
}

export class SearchConsoleClient {
  private accessToken: string;

  constructor(config: SearchConsoleClientConfig) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Google Search Console API error: ${response.status} - ${error}`,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // ==================== Sites Methods ====================

  /**
   * List all sites for the authenticated user
   */
  async listSites(): Promise<SitesListResponse> {
    return this.request<SitesListResponse>(ENDPOINTS.SITES);
  }

  /**
   * Get a specific site by URL
   */
  async getSite(siteUrl: string): Promise<SiteEntry> {
    return this.request<SiteEntry>(ENDPOINTS.SITE(siteUrl));
  }

  /**
   * Add a new site
   */
  async addSite(siteUrl: string): Promise<void> {
    await this.request<void>(ENDPOINTS.SITE(siteUrl), {
      method: "PUT",
    });
  }

  /**
   * Remove a site
   */
  async removeSite(siteUrl: string): Promise<void> {
    await this.request<void>(ENDPOINTS.SITE(siteUrl), {
      method: "DELETE",
    });
  }

  // ==================== Search Analytics Methods ====================

  /**
   * Query search analytics data
   */
  async querySearchAnalytics(
    siteUrl: string,
    request: SearchAnalyticsRequest,
  ): Promise<SearchAnalyticsResponse> {
    return this.request<SearchAnalyticsResponse>(
      ENDPOINTS.SEARCH_ANALYTICS_QUERY(siteUrl),
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  }

  // ==================== Sitemaps Methods ====================

  /**
   * List all sitemaps for a site
   */
  async listSitemaps(siteUrl: string): Promise<SitemapsListResponse> {
    return this.request<SitemapsListResponse>(ENDPOINTS.SITEMAPS(siteUrl));
  }

  /**
   * Get a specific sitemap by feedpath
   */
  async getSitemap(siteUrl: string, feedpath: string): Promise<Sitemap> {
    return this.request<Sitemap>(ENDPOINTS.SITEMAP(siteUrl, feedpath));
  }

  /**
   * Submit a sitemap
   */
  async submitSitemap(siteUrl: string, feedpath: string): Promise<void> {
    await this.request<void>(ENDPOINTS.SITEMAP(siteUrl, feedpath), {
      method: "PUT",
    });
  }

  /**
   * Delete a sitemap
   */
  async deleteSitemap(siteUrl: string, feedpath: string): Promise<void> {
    await this.request<void>(ENDPOINTS.SITEMAP(siteUrl, feedpath), {
      method: "DELETE",
    });
  }

  // ==================== URL Inspection Methods ====================

  /**
   * Inspect a URL's index status
   * Uses the v1 API endpoint (different base URL)
   */
  async inspectUrl(request: InspectUrlRequest): Promise<UrlInspectionResult> {
    return this.request<UrlInspectionResult>(ENDPOINTS.URL_INSPECTION, {
      method: "POST",
      body: JSON.stringify({
        siteUrl: request.siteUrl,
        inspectionUrl: request.inspectionUrl,
        languageCode: request.languageCode,
      }),
    });
  }
}

// Re-export getGoogleAccessToken from env.ts for convenience
export { getGoogleAccessToken as getAccessToken } from "./env.ts";
