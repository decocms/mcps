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
  GRAIN_HOOKS_CREATE_ENDPOINT,
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
   * Uses POST method with cursor-based pagination
   */
  async listRecordings(params: ListRecordingsParams = {}): Promise<{
    recordings: RecordingSummary[];
    total: number;
    hasMore: boolean;
    cursor?: string;
  }> {
    const body: Record<string, unknown> = {
      limit: params.limit || DEFAULT_PAGE_SIZE,
    };

    // Add cursor if provided (for pagination)
    if (params.cursor) {
      body.cursor = params.cursor;
    }

    // Add filters
    if (params.meeting_type) body.meeting_type = params.meeting_type;
    if (params.meeting_platform)
      body.meeting_platform = params.meeting_platform;
    if (params.tags) body.tags = params.tags;
    if (params.participant_email) {
      body.participant_email = params.participant_email;
    }
    if (params.from_date) body.from_date = params.from_date;
    if (params.to_date) body.to_date = params.to_date;
    if (params.status) body.status = params.status;
    if (params.sort_by) body.sort_by = params.sort_by;
    if (params.sort_order) body.sort_order = params.sort_order;

    const response = await this.request<GrainAPIResponse<RecordingSummary[]>>(
      GRAIN_RECORDINGS_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    return {
      recordings: response.data,
      total: response.meta?.total || response.data.length,
      hasMore: response.meta?.has_more || false,
      cursor: response.meta?.cursor,
    };
  }

  /**
   * Create a webhook (hook) for receiving events
   */
  async createHook(hookUrl: string): Promise<{ id: string; hook_url: string }> {
    const response = await this.request<{ id: string; hook_url: string }>(
      GRAIN_HOOKS_CREATE_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify({
          hook_url: hookUrl,
        }),
      },
    );

    return response;
  }
}
