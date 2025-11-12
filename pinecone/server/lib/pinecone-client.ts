/**
 * Pinecone client for vector operations.
 *
 * Simple client wrapper around Pinecone REST API.
 * Follows the same pattern as other MCPs (veo, nanobanana, object-storage).
 */

import type { Env } from "../main.ts";
import type {
  Vector,
  UpsertResult,
  QueryParams,
  QueryResult,
  FetchResult,
  DeleteParams,
} from "@decocms/mcps-shared/vector-databases";

/**
 * Pinecone client configuration
 */
export interface PineconeClientConfig {
  /** Pinecone API key */
  apiKey: string;
  /** Pinecone index host URL */
  indexHost: string;
}

/**
 * Makes a request to the Pinecone API
 */
async function makeRequest<T>(
  config: PineconeClientConfig,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${config.indexHost}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Api-Key": config.apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinecone API error (${response.status}): ${errorText}`);
  }

  // Delete returns empty response
  if (response.status === 200 && endpoint.includes("/delete")) {
    return {} as T;
  }

  return response.json();
}

/**
 * Factory function to create Pinecone client from environment
 */
export const createPineconeClient = (env: Env) => {
  const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
  const config: PineconeClientConfig = {
    apiKey: state.apiKey,
    indexHost: state.indexHost,
  };

  return {
    /**
     * Upsert vectors into the index
     */
    upsert: async (
      vectors: Vector[],
      namespace?: string,
    ): Promise<UpsertResult> => {
      const response = await makeRequest<{ upsertedCount: number }>(
        config,
        "/vectors/upsert",
        {
          method: "POST",
          body: JSON.stringify({
            vectors,
            namespace,
          }),
        },
      );

      return {
        upsertedCount: response.upsertedCount,
      };
    },

    /**
     * Query vectors by similarity
     */
    query: async (params: QueryParams): Promise<QueryResult> => {
      const response = await makeRequest<{
        matches: Array<{
          id: string;
          score: number;
          values?: number[];
          metadata?: Record<string, string | number | boolean | string[]>;
          sparseValues?: {
            indices: number[];
            values: number[];
          };
        }>;
        namespace?: string;
      }>(config, "/query", {
        method: "POST",
        body: JSON.stringify({
          vector: params.vector,
          id: params.id,
          topK: params.topK,
          namespace: params.namespace,
          filter: params.filter,
          includeMetadata: params.includeMetadata,
          includeValues: params.includeValues,
          sparseVector: params.sparseVector,
        }),
      });

      return {
        matches: response.matches,
        namespace: response.namespace,
      };
    },

    /**
     * Fetch vectors by IDs
     */
    fetch: async (ids: string[], namespace?: string): Promise<FetchResult> => {
      const params = new URLSearchParams();
      ids.forEach((id) => params.append("ids", id));
      if (namespace) {
        params.append("namespace", namespace);
      }

      const response = await makeRequest<{
        vectors: Record<
          string,
          {
            id: string;
            values: number[];
            metadata?: Record<string, string | number | boolean | string[]>;
            sparseValues?: {
              indices: number[];
              values: number[];
            };
          }
        >;
        namespace?: string;
      }>(config, `/vectors/fetch?${params.toString()}`);

      return {
        vectors: response.vectors,
        namespace: response.namespace,
      };
    },

    /**
     * Delete vectors from the index
     */
    delete: async (params: DeleteParams): Promise<void> => {
      await makeRequest(config, "/vectors/delete", {
        method: "POST",
        body: JSON.stringify({
          ids: params.ids,
          deleteAll: params.deleteAll,
          namespace: params.namespace,
          filter: params.filter,
        }),
      });
    },
  };
};
