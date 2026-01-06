/**
 * Grain API client
 * Handles all communication with the Grain API
 */

import {
  GRAIN_BASE_URL,
  GRAIN_LIST_RECORDINGS_ENDPOINT,
  GRAIN_RECORDING_ENDPOINT,
  GRAIN_CREATE_WEBHOOK_ENDPOINT,
  GRAIN_LIST_WEBHOOKS_ENDPOINT,
  GRAIN_DELETE_WEBHOOK_ENDPOINT,
  GRAIN_API_VERSION,
} from "../constants.ts";
import type {
  ListRecordingsParams,
  ListRecordingsResponse,
  RecordingDetails,
  WebhookConfig,
  CreateWebhookResponse,
  ListWebhooksResponse,
} from "./types.ts";

export interface GrainClientConfig {
  apiKey: string;
}

export class GrainClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: GrainClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = GRAIN_BASE_URL;
  }

  /**
   * Build headers for API requests
   * Note: API v2 requires the Public-Api-Version header
   */
  private getHeaders(includeApiVersion = false): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (includeApiVersion) {
      headers["Public-Api-Version"] = GRAIN_API_VERSION;
    }

    return headers;
  }

  /**
   * Make a GET request to the Grain API
   */
  private async get<T>(
    endpoint: string,
    params?: Record<string, string>,
    includeApiVersion = false,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(includeApiVersion),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Grain API error (${response.status}): ${errorText}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Make a POST request to the Grain API
   */
  private async post<T>(
    endpoint: string,
    body?: Record<string, unknown>,
    includeApiVersion = false,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: this.getHeaders(includeApiVersion),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Grain API error (${response.status}): ${errorText}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Make a DELETE request to the Grain API
   */
  private async delete(
    endpoint: string,
    includeApiVersion = false,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "DELETE",
      headers: this.getHeaders(includeApiVersion),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Grain API error (${response.status}): ${errorText}`);
    }
  }

  /**
   * List all recordings with optional filters
   * NOTE: Grain API uses GET with query parameters and cursor-based pagination
   */
  async listRecordings(
    params?: ListRecordingsParams,
  ): Promise<ListRecordingsResponse> {
    const queryParams: Record<string, string> = {};

    // Add query parameters
    if (params?.limit !== undefined) {
      queryParams.limit = params.limit.toString();
    }
    // Note: Grain API uses offset for initial pagination
    if (params?.offset !== undefined) {
      queryParams.offset = params.offset.toString();
    }
    if (params?.start_date) {
      queryParams.start_date = params.start_date;
    }
    if (params?.end_date) {
      queryParams.end_date = params.end_date;
    }
    if (params?.status) {
      queryParams.status = params.status;
    }
    if (params?.search) {
      queryParams.search = params.search;
    }

    return await this.get<ListRecordingsResponse>(
      GRAIN_LIST_RECORDINGS_ENDPOINT,
      queryParams,
    );
  }

  /**
   * Get detailed information about a specific recording
   */
  async getRecording(recordingId: string): Promise<RecordingDetails> {
    return await this.get<RecordingDetails>(
      `${GRAIN_RECORDING_ENDPOINT}/${recordingId}`,
    );
  }

  /**
   * Search recordings by text
   */
  async searchRecordings(
    query: string,
    params?: Omit<ListRecordingsParams, "search">,
  ): Promise<ListRecordingsResponse> {
    return await this.listRecordings({
      ...params,
      search: query,
    });
  }

  /**
   * Create a webhook to receive real-time notifications from Grain
   * API v2 endpoint: POST /_/public-api/v2/hooks/create
   *
   * Note: Grain performs a reachability test on the provided URL.
   * The endpoint MUST respond with a 2xx status for the hook to be created.
   *
   * @param config - Webhook configuration with hook_url and optional filter/include
   * @returns Created webhook details
   */
  async createWebhook(config: WebhookConfig): Promise<CreateWebhookResponse> {
    const response = await fetch(
      `${this.baseUrl}${GRAIN_CREATE_WEBHOOK_ENDPOINT}`,
      {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify(config),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Grain API error (${response.status}): ${errorText}`);
    }

    return (await response.json()) as CreateWebhookResponse;
  }

  /**
   * List all webhooks configured for this account
   * API v2 endpoint: POST /_/public-api/v2/hooks (yes, it's POST not GET!)
   * @returns List of webhooks
   */
  async listWebhooks(): Promise<ListWebhooksResponse> {
    return await this.post<ListWebhooksResponse>(
      GRAIN_LIST_WEBHOOKS_ENDPOINT,
      undefined,
      true, // includeApiVersion
    );
  }

  /**
   * Delete a webhook by its ID
   * API v2 endpoint: DELETE /_/public-api/v2/hooks/{id}
   * @param webhookId - The ID of the webhook to delete
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    return await this.delete(
      `${GRAIN_DELETE_WEBHOOK_ENDPOINT}/${webhookId}`,
      true, // includeApiVersion
    );
  }
}
