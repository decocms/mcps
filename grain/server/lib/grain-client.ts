import {
  GRAIN_API_VERSION,
  GRAIN_BASE_URL,
  GRAIN_RECORDINGS_ENDPOINT,
} from "../constants.ts";
import {
  type GrainRecordingV2,
  type ListRecordingsParams,
  type ListRecordingsResponse,
  type RecordingDetails,
  type RecordingsInclude,
  type TranscriptEntry,
  toDetails,
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

/** v2 wants full date-times; the tools accept plain dates ("2025-01-01") too. */
export function isoDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

export class GrainClient {
  private apiKey: string;

  constructor(config: GrainClientConfig) {
    this.apiKey = config.apiKey;
  }

  private headers(accept = "application/json"): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Public-Api-Version": GRAIN_API_VERSION,
      "Content-Type": "application/json",
      Accept: accept,
    };
  }

  private async request<T>(
    method: "POST" | "DELETE",
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${GRAIN_BASE_URL}${endpoint}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
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
    return (await response.json()) as T;
  }

  /** POST /v2/recordings — filters go in the body; `after_datetime` = on/after. */
  async listRecordings(
    params?: ListRecordingsParams,
  ): Promise<ListRecordingsResponse> {
    const filter: Record<string, string> = {};
    if (params?.start_date)
      filter.after_datetime = isoDateTime(params.start_date);
    if (params?.end_date) filter.before_datetime = isoDateTime(params.end_date);
    if (params?.title) filter.title_search = params.title;
    if (params?.attendance) filter.attendance = params.attendance;
    return this.request<ListRecordingsResponse>(
      "POST",
      GRAIN_RECORDINGS_ENDPOINT,
      {
        ...(params?.cursor ? { cursor: params.cursor } : {}),
        filter,
        include: {
          highlights: Boolean(params?.include_highlights),
          participants: Boolean(params?.include_participants),
        },
      },
    );
  }

  /** POST /v2/recordings/:id, normalized to the MCP's stable shape. */
  async getRecording(
    recordingId: string,
    include: RecordingsInclude = { participants: true, ai_summary: true },
  ): Promise<RecordingDetails> {
    const recording = await this.request<GrainRecordingV2>(
      "POST",
      `${GRAIN_RECORDINGS_ENDPOINT}/${recordingId}`,
      { include },
    );
    return toDetails(recording);
  }

  /**
   * GET /v2/recordings/:id/transcript       → JSON segments
   * GET /v2/recordings/:id/transcript.txt   → plain text (also .vtt / .srt)
   */
  async getTranscript(
    recordingId: string,
    format: "json" | "txt" | "vtt" | "srt" = "txt",
  ): Promise<string | TranscriptEntry[]> {
    const suffix = format === "json" ? "" : `.${format}`;
    const endpoint = `${GRAIN_RECORDINGS_ENDPOINT}/${recordingId}/transcript${suffix}`;
    const response = await fetch(`${GRAIN_BASE_URL}${endpoint}`, {
      headers: this.headers(
        format === "json" ? "application/json" : "text/plain",
      ),
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
    if (format !== "json") return await response.text();
    const segments = (await response.json()) as {
      speaker: string;
      text: string;
      start?: number;
      end?: number;
    }[];
    return segments.map((s) => ({
      speaker: s.speaker,
      text: s.text,
      start_time: s.start,
      end_time: s.end,
    }));
  }
}
