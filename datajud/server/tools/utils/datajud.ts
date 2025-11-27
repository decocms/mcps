/**
 * HTTP client for interacting with the Datajud Public API.
 *
 * Documentation: https://datajud-wiki.cnj.jus.br/api-publica/
 */

import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";
import type {
  DatajudClientConfig,
  DatajudSearchResponse,
  ProcessoDatajud,
} from "../../lib/types.ts";

/**
 * Makes an authenticated request to the Datajud Public API
 */
async function makeRequest(
  config: DatajudClientConfig,
  query: Record<string, unknown>,
): Promise<DatajudSearchResponse> {
  const tribunal = config.tribunal.toLowerCase();
  const baseUrl = `https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal}/_search`;

  const response = await makeApiRequest(
    baseUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `APIKey ${config.apiKey}`,
      },
      body: JSON.stringify(query),
    },
    "Datajud",
  );
  return response as DatajudSearchResponse;
}

/**
 * Searches for a specific process by number
 */
async function getProcessByNumber(
  config: DatajudClientConfig,
  numeroProcesso: string,
): Promise<ProcessoDatajud | null> {
  const query = {
    query: {
      term: {
        "numeroProcesso.keyword": numeroProcesso,
      },
    },
    size: 1,
  };

  const response = await makeRequest(config, query);

  if (response.hits.hits.length === 0) {
    return null;
  }

  return response.hits.hits[0]._source;
}

/**
 * Searches processes with filters
 */
async function searchProcesses(
  config: DatajudClientConfig,
  params: {
    filters?: Record<string, unknown>;
    size?: number;
    from?: number;
    sort?: Array<Record<string, unknown>>;
  },
): Promise<DatajudSearchResponse> {
  const { filters = {}, size = 10, from = 0, sort } = params;

  const query: Record<string, unknown> = {
    query: {
      bool: {
        must: [],
        filter: [],
      },
    },
    size,
    from,
  };

  // Add filters to query
  if (Object.keys(filters).length > 0) {
    (query.query as any).bool.filter = Object.entries(filters).map(
      ([key, value]) => {
        if (typeof value === "object" && value !== null) {
          return { [key]: value };
        }
        // For strings, use match for more flexible search
        if (typeof value === "string") {
          return { match: { [key]: value } };
        }
        // For other types, use term for exact match
        return { term: { [key]: value } };
      },
    );
  }

  // Add sorting if specified
  if (sort && sort.length > 0) {
    query.sort = sort;
  }

  return await makeRequest(config, query);
}

/**
 * Executes aggregations for statistics
 */
async function aggregateStatistics(
  config: DatajudClientConfig,
  params: {
    aggregations: Record<string, unknown>;
    filters?: Record<string, unknown>;
  },
): Promise<DatajudSearchResponse> {
  const { aggregations, filters = {} } = params;

  const query: Record<string, unknown> = {
    size: 0, // Don't return documents, only aggregations
    aggs: aggregations,
  };

  // Add filters if specified
  if (Object.keys(filters).length > 0) {
    query.query = {
      bool: {
        filter: Object.entries(filters).map(([key, value]) => {
          if (typeof value === "object" && value !== null) {
            return { [key]: value };
          }
          if (typeof value === "string") {
            return { match: { [key]: value } };
          }
          return { term: { [key]: value } };
        }),
      },
    };
  }

  return await makeRequest(config, query);
}

/**
 * Creates a Datajud client with all available methods
 */
export function createDatajudClient(config: DatajudClientConfig) {
  return {
    getProcessByNumber: (numeroProcesso: string) =>
      getProcessByNumber(config, numeroProcesso),
    searchProcesses: (params: {
      filters?: Record<string, unknown>;
      size?: number;
      from?: number;
      sort?: Array<Record<string, unknown>>;
    }) => searchProcesses(config, params),
    aggregateStatistics: (params: {
      aggregations: Record<string, unknown>;
      filters?: Record<string, unknown>;
    }) => aggregateStatistics(config, params),
  };
}
