/**
 * Google Analytics API client
 * Handles all communication with the Google Analytics Data API and Admin API
 */

import { ENDPOINTS } from "../constants.ts";
import type {
  RunReportRequest,
  RunReportResponse,
  RunRealtimeReportRequest,
  RunRealtimeReportResponse,
  ListPropertiesResponse,
  Property,
  ListDataStreamsResponse,
  DataStream,
  RunReportInput,
  RunRealtimeReportInput,
  ListPropertiesInput,
  ListDataStreamsInput,
} from "./types.ts";

export interface AnalyticsClientConfig {
  accessToken: string;
}

export class AnalyticsClient {
  private accessToken: string;

  constructor(config: AnalyticsClientConfig) {
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
        `Google Analytics API error: ${response.status} - ${error}`,
      );
    }

    return response.json() as Promise<T>;
  }

  // ==================== Data API Methods ====================

  /**
   * Run a report on Google Analytics 4 data
   */
  async runReport(input: RunReportInput): Promise<RunReportResponse> {
    const request: RunReportRequest = {
      dateRanges: input.dateRanges,
      dimensions: input.dimensions?.map((name) => ({ name })),
      metrics: input.metrics.map((name) => ({ name })),
      limit: input.limit,
      offset: input.offset,
      orderBys: input.orderBys,
      dimensionFilter: input.dimensionFilter,
      metricFilter: input.metricFilter,
      keepEmptyRows: input.keepEmptyRows,
      returnPropertyQuota: input.returnPropertyQuota,
    };

    return this.request<RunReportResponse>(
      ENDPOINTS.RUN_REPORT(input.propertyId),
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  }

  /**
   * Run a realtime report on Google Analytics 4 data
   */
  async runRealtimeReport(
    input: RunRealtimeReportInput,
  ): Promise<RunRealtimeReportResponse> {
    const request: RunRealtimeReportRequest = {
      dimensions: input.dimensions?.map((name) => ({ name })),
      metrics: input.metrics.map((name) => ({ name })),
      limit: input.limit,
      orderBys: input.orderBys,
      minuteRanges: input.minuteRanges,
    };

    return this.request<RunRealtimeReportResponse>(
      ENDPOINTS.RUN_REALTIME_REPORT(input.propertyId),
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  }

  // ==================== Admin API Methods ====================

  /**
   * List all properties the user has access to
   */
  async listProperties(
    input: ListPropertiesInput = {},
  ): Promise<ListPropertiesResponse> {
    const url = new URL(ENDPOINTS.PROPERTIES);

    if (input.filter) url.searchParams.set("filter", input.filter);
    if (input.pageSize)
      url.searchParams.set("pageSize", String(input.pageSize));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    if (input.showDeleted !== undefined)
      url.searchParams.set("showDeleted", String(input.showDeleted));

    return this.request<ListPropertiesResponse>(url.toString());
  }

  /**
   * Get a specific property by ID
   */
  async getProperty(propertyId: string): Promise<Property> {
    return this.request<Property>(ENDPOINTS.PROPERTY(propertyId));
  }

  /**
   * List data streams for a property
   */
  async listDataStreams(
    input: ListDataStreamsInput,
  ): Promise<ListDataStreamsResponse> {
    const url = new URL(ENDPOINTS.DATA_STREAMS(input.propertyId));

    if (input.pageSize)
      url.searchParams.set("pageSize", String(input.pageSize));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);

    return this.request<ListDataStreamsResponse>(url.toString());
  }

  /**
   * Get a specific data stream
   */
  async getDataStream(
    propertyId: string,
    streamId: string,
  ): Promise<DataStream> {
    return this.request<DataStream>(
      ENDPOINTS.DATA_STREAM(propertyId, streamId),
    );
  }
}

// Re-export getGoogleAccessToken from env.ts for convenience
export { getGoogleAccessToken as getAccessToken } from "./env.ts";
