import {
  GRAIN_BASE_URL,
  GRAIN_RECORDINGS_ENDPOINT,
  GRAIN_VIEWS_ENDPOINT,
  GRAIN_HOOKS_ENDPOINT,
  GRAIN_HOOKS_VERSION,
} from "../constants.ts";
import type {
  ListRecordingsParams,
  ListRecordingsResponse,
  RecordingDetails,
  CreateHookParams,
  CreateHookResponse,
  ListHooksResponse,
  ListViewsResponse,
  TranscriptEntry,
} from "./types.ts";

export interface GrainClientConfig {
  apiKey: string;
}

export class GrainAPIError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly statusText: string,
    public readonly details: string,
    public readonly endpoint: string,
  ) {
    super(`Grain API error (${statusCode}): ${details}`);
    this.name = "GrainAPIError";
  }

  isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  isServerError(): boolean {
    return this.statusCode >= 500 && this.statusCode < 600;
  }

  getUserMessage(): string {
    if (this.isAuthError()) {
      return "Authentication failed. Please check your Grain API key at https://grain.com/app/settings/integrations?tab=api";
    }
    if (this.isRateLimited()) {
      return "Rate limit exceeded. Please wait a moment before trying again.";
    }
    if (this.statusCode === 404) {
      return "The requested resource was not found. Please check the recording ID.";
    }
    if (this.isServerError()) {
      return "Grain service is temporarily unavailable. Please try again later.";
    }
    return this.details || "An unexpected error occurred with the Grain API.";
  }
}

export class GrainClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: GrainClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = GRAIN_BASE_URL;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    options?: {
      params?: Record<string, string>;
      body?: Record<string, string | number | string[] | undefined>;
    },
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers: this.getHeaders(),
    };

    if (options?.body && method !== "GET") {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), fetchOptions);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new GrainAPIError(
        response.status,
        response.statusText,
        errorText,
        endpoint,
      );
    }

    return (await response.json()) as T;
  }

  async listRecordings(
    params?: ListRecordingsParams,
  ): Promise<ListRecordingsResponse> {
    const queryParams: Record<string, string> = {};

    if (params?.cursor) queryParams.cursor = params.cursor;
    if (params?.start_date) queryParams.start_date = params.start_date;
    if (params?.end_date) queryParams.end_date = params.end_date;
    if (params?.title) queryParams.title = params.title;
    if (params?.attendance) queryParams.attendance = params.attendance;
    if (params?.include_highlights) queryParams.include_highlights = "true";
    if (params?.include_participants) queryParams.include_participants = "true";

    return this.request<ListRecordingsResponse>(
      "GET",
      GRAIN_RECORDINGS_ENDPOINT,
      { params: queryParams },
    );
  }

  async getRecording(
    recordingId: string,
    options?: {
      include_highlights?: boolean;
      include_participants?: boolean;
      include_owners?: boolean;
      transcript_format?: "json" | "vtt";
      intelligence_notes_format?: "json" | "md" | "text";
    },
  ): Promise<RecordingDetails> {
    const params: Record<string, string> = {};

    if (options?.include_highlights) params.include_highlights = "true";
    if (options?.include_participants !== false)
      params.include_participants = "true";
    if (options?.include_owners !== false) params.include_owners = "true";
    if (options?.transcript_format)
      params.transcript_format = options.transcript_format;
    if (options?.intelligence_notes_format)
      params.intelligence_notes_format = options.intelligence_notes_format;

    return this.request<RecordingDetails>(
      "GET",
      `${GRAIN_RECORDINGS_ENDPOINT}/${recordingId}`,
      { params },
    );
  }

  /**
   * GET /_/public-api/recordings/:id/transcript       → JSON
   * GET /_/public-api/recordings/:id/transcript.txt   → plain text
   * GET /_/public-api/recordings/:id/transcript.vtt   → WebVTT (paid seat)
   * GET /_/public-api/recordings/:id/transcript.srt   → SRT (paid seat)
   */
  async getTranscript(
    recordingId: string,
    format: "json" | "txt" | "vtt" | "srt" = "txt",
  ): Promise<string | TranscriptEntry[]> {
    const suffix = format === "json" ? "" : `.${format}`;
    const endpoint = `${GRAIN_RECORDINGS_ENDPOINT}/${recordingId}/transcript${suffix}`;

    const url = new URL(`${this.baseUrl}${endpoint}`);
    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new GrainAPIError(
        response.status,
        response.statusText,
        errorText,
        endpoint,
      );
    }

    if (format === "json") {
      return (await response.json()) as TranscriptEntry[];
    }
    return await response.text();
  }

  /**
   * @see https://grainhq.notion.site/Grain-Personal-API (GET /_/public-api/views)
   */
  async listViews(): Promise<ListViewsResponse> {
    return this.request<ListViewsResponse>("GET", GRAIN_VIEWS_ENDPOINT, {
      params: { type_filter: "recordings" },
    });
  }

  /**
   * @see https://grainhq.notion.site/Grain-Personal-API (GET /_/public-api/hooks)
   */
  async listHooks(): Promise<ListHooksResponse> {
    return this.request<ListHooksResponse>("GET", GRAIN_HOOKS_ENDPOINT);
  }

  /**
   * @see https://grainhq.notion.site/Grain-Personal-API (POST /_/public-api/hooks)
   * Grain performs a reachability test on `hook_url`. The endpoint must respond 2xx.
   */
  async createHook(
    hookUrl: string,
    viewId: string,
    actions?: CreateHookParams["actions"],
  ): Promise<CreateHookResponse> {
    const body: Record<string, string | number | string[] | undefined> = {
      version: GRAIN_HOOKS_VERSION,
      hook_url: hookUrl,
      view_id: viewId,
    };
    if (actions) {
      body.actions = actions;
    }

    return this.request<CreateHookResponse>("POST", GRAIN_HOOKS_ENDPOINT, {
      body,
    });
  }

  /**
   * @see https://grainhq.notion.site/Grain-Personal-API (DELETE /_/public-api/hooks/:id)
   */
  async deleteHook(hookId: string): Promise<void> {
    await this.request<{ success: boolean }>(
      "DELETE",
      `${GRAIN_HOOKS_ENDPOINT}/${hookId}`,
    );
  }
}
