/**
 * Grain API client
 * Handles all communication with the Grain API
 *
 * Grain is an AI-powered meeting recorder and note-taking tool that
 * automatically joins calls, records, transcribes, and creates notes.
 */

import {
  DEFAULT_PAGE_SIZE,
  GRAIN_BASE_URL,
  GRAIN_RECORDINGS_ENDPOINT,
  GRAIN_TRANSCRIPT_ENDPOINT,
} from "../constants.ts";
import type {
  GrainAPIError,
  GrainAPIResponse,
  ListRecordingsParams,
  Recording,
  RecordingSummary,
  Transcript,
} from "./types.ts";

export interface GrainClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export class GrainClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: GrainClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || GRAIN_BASE_URL;
  }

  /**
   * Make an authenticated request to the Grain API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({
        error: {
          code: "UNKNOWN_ERROR",
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      }))) as GrainAPIError;

      throw new Error(
        `Grain API error: ${error.error.message} (${error.error.code})`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * List recordings with filters and pagination
   */
  async listRecordings(params: ListRecordingsParams = {}): Promise<{
    recordings: RecordingSummary[];
    total: number;
    hasMore: boolean;
  }> {
    const queryParams = new URLSearchParams();

    if (params.meeting_type) {
      queryParams.set("meeting_type", params.meeting_type);
    }
    if (params.meeting_platform) {
      queryParams.set("meeting_platform", params.meeting_platform);
    }
    if (params.tags) queryParams.set("tags", params.tags.join(","));
    if (params.participant_email) {
      queryParams.set("participant_email", params.participant_email);
    }
    if (params.from_date) queryParams.set("from_date", params.from_date);
    if (params.to_date) queryParams.set("to_date", params.to_date);
    if (params.status) queryParams.set("status", params.status);
    if (params.sort_by) queryParams.set("sort_by", params.sort_by);
    if (params.sort_order) queryParams.set("sort_order", params.sort_order);

    queryParams.set("limit", String(params.limit || DEFAULT_PAGE_SIZE));
    queryParams.set("offset", String(params.offset || 0));

    const response = await this.request<GrainAPIResponse<RecordingSummary[]>>(
      `${GRAIN_RECORDINGS_ENDPOINT}?${queryParams.toString()}`,
    );

    return {
      recordings: response.data,
      total: response.meta?.total || response.data.length,
      hasMore: response.meta?.has_more || false,
    };
  }
}
