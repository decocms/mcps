import type {
  Actor,
  ActorRun,
  ActorRunResponse,
  ActorsResponse,
  ActorRunsResponse,
} from "./types";

const APIFY_API_BASE_URL = "https://api.apify.com";

/**
 * Standalone Apify API client for MCP
 * Handles API communication without depending on Deco's createHttpClient
 */
export class ApifyClient {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl: string = APIFY_API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private getHeaders(): Headers {
    return new Headers({
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
    });
  }

  private async makeRequest<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    // Add query parameters
    if (options?.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  /**
   * List actors
   * GET /v2/acts
   */
  async listActors(options?: {
    limit?: number;
    offset?: number;
    my?: boolean;
    desc?: boolean;
  }): Promise<ActorsResponse> {
    return this.makeRequest<ActorsResponse>("GET", "/v2/acts", {
      query: {
        limit: options?.limit ?? 10,
        offset: options?.offset ?? 0,
        my: options?.my ?? false,
        desc: options?.desc ?? true,
      },
    });
  }

  /**
   * Get a specific actor
   * GET /v2/acts/:actorId
   */
  async getActor(actorId: string): Promise<Actor> {
    return this.makeRequest<Actor>("GET", `/v2/acts/${actorId}`);
  }

  /**
   * Run actor synchronously and get dataset items
   * POST /v2/acts/:actorId/run-sync-get-dataset-items
   */
  async runActorSyncGetDatasetItems(
    actorId: string,
    input: Record<string, unknown>,
    options?: {
      timeout?: number;
      memory?: number;
      build?: string;
    },
  ): Promise<Array<Record<string, unknown>>> {
    return this.makeRequest<Array<Record<string, unknown>>>(
      "POST",
      `/v2/acts/${actorId}/run-sync-get-dataset-items`,
      {
        body: input,
        query: {
          timeout: options?.timeout,
          memory: options?.memory,
          build: options?.build,
        },
      },
    );
  }

  /**
   * Run actor asynchronously
   * POST /v2/acts/:actorId/runs
   */
  async runActor(
    actorId: string,
    input: Record<string, unknown>,
    options?: {
      timeout?: number;
      memory?: number;
      build?: string;
    },
  ): Promise<ActorRunResponse> {
    return this.makeRequest<ActorRunResponse>(
      "POST",
      `/v2/acts/${actorId}/runs`,
      {
        body: input,
        query: {
          timeout: options?.timeout,
          memory: options?.memory,
          build: options?.build,
        },
      },
    );
  }

  /**
   * Get actor runs
   * GET /v2/acts/:actorId/runs
   */
  async getActorRuns(
    actorId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
      desc?: boolean;
    },
  ): Promise<ActorRunsResponse> {
    return this.makeRequest<ActorRunsResponse>(
      "GET",
      `/v2/acts/${actorId}/runs`,
      {
        query: {
          limit: options?.limit ?? 10,
          offset: options?.offset ?? 0,
          status: options?.status,
          desc: options?.desc ?? true,
        },
      },
    );
  }

  /**
   * Get a specific actor run
   * GET /v2/acts/:actorId/runs/:runId
   */
  async getActorRun(actorId: string, runId: string): Promise<ActorRun> {
    return this.makeRequest<ActorRun>("GET", `/v2/acts/${actorId}/runs/${runId}`);
  }

  /**
   * Get dataset items
   * GET /v2/datasets/:datasetId/items
   */
  async getDatasetItems(
    datasetId: string,
    options?: {
      format?: string;
      limit?: number;
      offset?: number;
      clean?: boolean;
    },
  ): Promise<Array<Record<string, unknown>>> {
    return this.makeRequest<Array<Record<string, unknown>>>(
      "GET",
      `/v2/datasets/${datasetId}/items`,
      {
        query: {
          format: options?.format ?? "json",
          limit: options?.limit ?? 100,
          offset: options?.offset ?? 0,
          clean: options?.clean ?? true,
        },
      },
    );
  }
}

/**
 * Factory function to create an Apify client instance
 */
export function createApifyClient(token: string): ApifyClient {
  return new ApifyClient(token);
}

