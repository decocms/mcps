/**
 * BigQuery API client
 * Handles all communication with the Google BigQuery API
 */

import { ENDPOINTS, DEFAULTS } from "../constants.ts";
import type {
  DatasetsListResponse,
  Dataset,
  TablesListResponse,
  Table,
  QueryRequest,
  QueryResponse,
  GetQueryResultsResponse,
  TableSchema,
  TableRow,
} from "./types.ts";

export interface BigQueryClientConfig {
  accessToken: string;
}

export class BigQueryClient {
  private accessToken: string;

  constructor(config: BigQueryClientConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Make a request to the BigQuery API
   */
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
      throw new Error(`BigQuery API error: ${response.status} - ${error}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  // ==================== Dataset Methods ====================

  /**
   * List all datasets in a project
   */
  async listDatasets(
    projectId: string,
    options?: {
      maxResults?: number;
      pageToken?: string;
      all?: boolean;
    },
  ): Promise<DatasetsListResponse> {
    const url = new URL(ENDPOINTS.DATASETS(projectId));

    if (options?.maxResults) {
      url.searchParams.set("maxResults", String(options.maxResults));
    }
    if (options?.pageToken) {
      url.searchParams.set("pageToken", options.pageToken);
    }
    if (options?.all) {
      url.searchParams.set("all", "true");
    }

    return this.request<DatasetsListResponse>(url.toString());
  }

  /**
   * Get a specific dataset
   */
  async getDataset(projectId: string, datasetId: string): Promise<Dataset> {
    return this.request<Dataset>(ENDPOINTS.DATASET(projectId, datasetId));
  }

  // ==================== Table Methods ====================

  /**
   * List all tables in a dataset
   */
  async listTables(
    projectId: string,
    datasetId: string,
    options?: {
      maxResults?: number;
      pageToken?: string;
    },
  ): Promise<TablesListResponse> {
    const url = new URL(ENDPOINTS.TABLES(projectId, datasetId));

    if (options?.maxResults) {
      url.searchParams.set("maxResults", String(options.maxResults));
    }
    if (options?.pageToken) {
      url.searchParams.set("pageToken", options.pageToken);
    }

    return this.request<TablesListResponse>(url.toString());
  }

  /**
   * Get a specific table with its schema
   */
  async getTable(
    projectId: string,
    datasetId: string,
    tableId: string,
  ): Promise<Table> {
    return this.request<Table>(ENDPOINTS.TABLE(projectId, datasetId, tableId));
  }

  /**
   * Get table schema only
   */
  async getTableSchema(
    projectId: string,
    datasetId: string,
    tableId: string,
  ): Promise<TableSchema> {
    const table = await this.getTable(projectId, datasetId, tableId);
    return table.schema || { fields: [] };
  }

  // ==================== Query Methods ====================

  /**
   * Execute a SQL query
   */
  async query(
    projectId: string,
    options: {
      query: string;
      useLegacySql?: boolean;
      maxResults?: number;
      timeoutMs?: number;
      dryRun?: boolean;
      useQueryCache?: boolean;
      defaultDataset?: {
        projectId: string;
        datasetId: string;
      };
    },
  ): Promise<QueryResponse> {
    const queryRequest: QueryRequest = {
      query: options.query,
      useLegacySql: options.useLegacySql ?? DEFAULTS.USE_LEGACY_SQL,
      maxResults: options.maxResults ?? DEFAULTS.MAX_RESULTS,
      timeoutMs: options.timeoutMs ?? DEFAULTS.QUERY_TIMEOUT_MS,
      dryRun: options.dryRun ?? false,
      useQueryCache: options.useQueryCache ?? DEFAULTS.USE_QUERY_CACHE,
    };

    if (options.defaultDataset) {
      queryRequest.defaultDataset = options.defaultDataset;
    }

    return this.request<QueryResponse>(ENDPOINTS.QUERY(projectId), {
      method: "POST",
      body: JSON.stringify(queryRequest),
    });
  }

  /**
   * Get query results (for long-running queries)
   */
  async getQueryResults(
    projectId: string,
    jobId: string,
    options?: {
      maxResults?: number;
      pageToken?: string;
      startIndex?: string;
      timeoutMs?: number;
    },
  ): Promise<GetQueryResultsResponse> {
    const url = new URL(ENDPOINTS.QUERY_RESULTS(projectId, jobId));

    if (options?.maxResults) {
      url.searchParams.set("maxResults", String(options.maxResults));
    }
    if (options?.pageToken) {
      url.searchParams.set("pageToken", options.pageToken);
    }
    if (options?.startIndex) {
      url.searchParams.set("startIndex", options.startIndex);
    }
    if (options?.timeoutMs) {
      url.searchParams.set("timeoutMs", String(options.timeoutMs));
    }

    return this.request<GetQueryResultsResponse>(url.toString());
  }

  /**
   * Execute query and wait for complete results
   * Handles pagination and job completion automatically
   */
  async queryAndWait(
    projectId: string,
    options: {
      query: string;
      useLegacySql?: boolean;
      maxResults?: number;
      timeoutMs?: number;
      useQueryCache?: boolean;
      defaultDataset?: {
        projectId: string;
        datasetId: string;
      };
      maxWaitMs?: number;
    },
  ): Promise<{
    schema: TableSchema;
    rows: TableRow[];
    totalRows: string;
    cacheHit: boolean;
    totalBytesProcessed: string;
  }> {
    // Initial query
    let response = await this.query(projectId, options);

    // Wait for job completion if not complete
    const maxWaitMs = options.maxWaitMs ?? 300000; // 5 minutes default
    const pollIntervalMs = 1000;
    const startTime = Date.now();

    while (!response.jobComplete && response.jobReference) {
      // Check if we've exceeded the maximum wait time
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(
          `Query timeout: Job did not complete within ${maxWaitMs / 1000} seconds. ` +
            `Job ID: ${response.jobReference.jobId}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const results = await this.getQueryResults(
        projectId,
        response.jobReference.jobId,
        {
          timeoutMs: options.timeoutMs ?? DEFAULTS.QUERY_TIMEOUT_MS,
        },
      );
      response = {
        ...response,
        ...results,
        jobComplete: results.jobComplete,
      };
    }

    // Check for errors
    if (response.errors && response.errors.length > 0) {
      throw new Error(
        `Query error: ${response.errors.map((e) => e.message).join(", ")}`,
      );
    }

    return {
      schema: response.schema || { fields: [] },
      rows: response.rows || [],
      totalRows: response.totalRows || "0",
      cacheHit: response.cacheHit || false,
      totalBytesProcessed: response.totalBytesProcessed || "0",
    };
  }
}

// Re-export getGoogleAccessToken from env.ts for convenience
export { getGoogleAccessToken as getAccessToken } from "./env.ts";
