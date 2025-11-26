import type {
  Actor,
  ActorRun,
  ActorRunResponse,
  ActorsResponse,
  ActorRunsResponse,
} from "./types";
import type { Env } from "server/main";
import {
  assertEnvKey,
  makeApiRequest,
} from "@decocms/mcps-shared/tools/utils/api-client";
import { APIFY_API_BASE_URL } from "../../constants";

interface ApifyRequestOptions {
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
}

// MCP-compatible wrapper for array responses
interface DataWrapper<T> {
  data: T;
}

/**
 * Helper function to make requests to Apify API
 * Uses makeApiRequest as middleware and handles Apify-specific response formatting
 */
async function makeApifyRequest<T = unknown>(
  env: Env,
  method: "GET" | "POST",
  path: string,
  options?: ApifyRequestOptions,
): Promise<T> {
  assertEnvKey(env, "APIFY_TOKEN");
  const token = (env as unknown as Record<string, string>).APIFY_TOKEN;

  let url = `${APIFY_API_BASE_URL}${path}`;

  // Build query parameters
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

  const requestInit: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  };

  // Use makeApiRequest as middleware for fetch + error handling
  const result = await makeApiRequest(url, requestInit, "Apify");

  // MCPs don't support returning arrays directly - wrap in object
  if (Array.isArray(result)) {
    return { data: result } as unknown as T;
  }

  if (result && typeof result === "object" && "data" in result) {
    return result as T;
  }

  return result as T;
}

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
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    });
  }

  private async makeRequest<T = unknown>(
    method: "GET" | "POST",
    path: string,
    options?: ApifyRequestOptions,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    // Build query parameters
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

    const fetchOptions: RequestInit = {
      method,
      headers: this.getHeaders(),
    };

    // Add body only for POST requests
    if (method === "POST" && options?.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    // Handle empty responses
    const contentLength = response.headers.get("content-length");
    if (contentLength === "0" || !response.body) {
      return { data: [] } as unknown as T;
    }

    const text = await response.text();
    if (!text) {
      return { data: [] } as unknown as T;
    }

    return JSON.parse(text) as T;
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
   * Run actor synchronously and get the run details with usage information
   * POST /v2/acts/:actorId/run-sync
   */
  async runActorSync(
    actorId: string,
    input: Record<string, unknown>,
    options?: {
      timeout?: number;
      memory?: number;
      build?: string;
    },
  ): Promise<ActorRun> {
    return this.makeRequest<ActorRun>("POST", `/v2/acts/${actorId}/run-sync`, {
      body: input,
      query: {
        timeout: options?.timeout,
        memory: options?.memory,
        build: options?.build,
      },
    });
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
  ): Promise<DataWrapper<Array<Record<string, unknown>>>> {
    return this.makeRequest<DataWrapper<Array<Record<string, unknown>>>>(
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
    return this.makeRequest<ActorRun>(
      "GET",
      `/v2/acts/${actorId}/runs/${runId}`,
    );
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
  ): Promise<DataWrapper<Array<Record<string, unknown>>>> {
    return this.makeRequest<DataWrapper<Array<Record<string, unknown>>>>(
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
 * Standalone functions that work with env directly (Sora pattern)
 */
export async function listActors(
  env: Env,
  options?: {
    limit?: number;
    offset?: number;
    my?: boolean;
    desc?: boolean;
  },
): Promise<ActorsResponse> {
  return makeApifyRequest(env, "GET", "/v2/acts", {
    query: {
      limit: options?.limit ?? 10,
      offset: options?.offset ?? 0,
      my: options?.my ?? false,
      desc: options?.desc ?? true,
    },
  });
}

export async function getActor(env: Env, actorId: string): Promise<Actor> {
  return makeApifyRequest(env, "GET", `/v2/acts/${actorId}`);
}

export async function runActorSync(
  env: Env,
  actorId: string,
  input: Record<string, unknown>,
  options?: {
    timeout?: number;
    memory?: number;
    build?: string;
  },
): Promise<ActorRun> {
  return makeApifyRequest(env, "POST", `/v2/acts/${actorId}/run-sync`, {
    body: input,
    query: {
      timeout: options?.timeout,
      memory: options?.memory,
      build: options?.build,
    },
  });
}

export async function runActorSyncGetDatasetItems(
  env: Env,
  actorId: string,
  input: Record<string, unknown>,
  options?: {
    timeout?: number;
    memory?: number;
    build?: string;
  },
): Promise<DataWrapper<Array<Record<string, unknown>>>> {
  return makeApifyRequest(
    env,
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

export async function runActor(
  env: Env,
  actorId: string,
  input: Record<string, unknown>,
  options?: {
    timeout?: number;
    memory?: number;
    build?: string;
  },
): Promise<ActorRunResponse> {
  return makeApifyRequest(env, "POST", `/v2/acts/${actorId}/runs`, {
    body: input,
    query: {
      timeout: options?.timeout,
      memory: options?.memory,
      build: options?.build,
    },
  });
}

export async function getActorRuns(
  env: Env,
  actorId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
    desc?: boolean;
  },
): Promise<ActorRunsResponse> {
  return makeApifyRequest(env, "GET", `/v2/acts/${actorId}/runs`, {
    query: {
      limit: options?.limit ?? 10,
      offset: options?.offset ?? 0,
      status: options?.status,
      desc: options?.desc ?? true,
    },
  });
}

export async function getActorRun(
  env: Env,
  actorId: string,
  runId: string,
): Promise<ActorRun> {
  return makeApifyRequest(env, "GET", `/v2/acts/${actorId}/runs/${runId}`);
}

export async function getDatasetItems(
  env: Env,
  datasetId: string,
  options?: {
    format?: string;
    limit?: number;
    offset?: number;
    clean?: boolean;
  },
): Promise<DataWrapper<Array<Record<string, unknown>>>> {
  return makeApifyRequest(env, "GET", `/v2/datasets/${datasetId}/items`, {
    query: {
      format: options?.format ?? "json",
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      clean: options?.clean ?? true,
    },
  });
}

/**
 * Factory function to create an Apify client instance
 * Returns an object with methods that capture the env in closure (Sora pattern)
 */
export function createApifyClient(env: Env) {
  return {
    listActors: (options?: Parameters<typeof listActors>[1]) =>
      listActors(env, options),
    getActor: (actorId: string) => getActor(env, actorId),
    runActorSync: (
      actorId: string,
      input: Record<string, unknown>,
      options?: Parameters<typeof runActorSync>[3],
    ) => runActorSync(env, actorId, input, options),
    runActorSyncGetDatasetItems: (
      actorId: string,
      input: Record<string, unknown>,
      options?: Parameters<typeof runActorSyncGetDatasetItems>[3],
    ) => runActorSyncGetDatasetItems(env, actorId, input, options),
    runActor: (
      actorId: string,
      input: Record<string, unknown>,
      options?: Parameters<typeof runActor>[3],
    ) => runActor(env, actorId, input, options),
    getActorRuns: (
      actorId: string,
      options?: Parameters<typeof getActorRuns>[2],
    ) => getActorRuns(env, actorId, options),
    getActorRun: (actorId: string, runId: string) =>
      getActorRun(env, actorId, runId),
    getDatasetItems: (
      datasetId: string,
      options?: Parameters<typeof getDatasetItems>[2],
    ) => getDatasetItems(env, datasetId, options),
  };
}
