/**
 * Pinecone vector database adapter.
 *
 * Implements the VectorDatabase interface for Pinecone.
 */

import type { VectorDatabase } from "../interface.ts";
import type {
  Vector,
  UpsertResult,
  QueryParams,
  QueryResult,
  FetchResult,
  DeleteParams,
} from "../types.ts";

/**
 * Configuration for Pinecone adapter
 */
export interface PineconeConfig {
  /** Pinecone API key */
  apiKey: string;
  /** Pinecone index host URL */
  indexHost: string;
}

/**
 * Pinecone vector database adapter
 */
export class PineconeAdapter implements VectorDatabase {
  private apiKey: string;
  private indexHost: string;

  constructor(config: PineconeConfig) {
    this.apiKey = config.apiKey;
    this.indexHost = config.indexHost;
  }

  /**
   * Makes a request to the Pinecone API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.indexHost}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Api-Key": this.apiKey,
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

  async upsert(vectors: Vector[], namespace?: string): Promise<UpsertResult> {
    const response = await this.request<{ upsertedCount: number }>(
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
  }

  async query(params: QueryParams): Promise<QueryResult> {
    const response = await this.request<{
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
    }>("/query", {
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
  }

  async fetch(ids: string[], namespace?: string): Promise<FetchResult> {
    const params = new URLSearchParams();
    ids.forEach((id) => params.append("ids", id));
    if (namespace) {
      params.append("namespace", namespace);
    }

    const response = await this.request<{
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
    }>(`/vectors/fetch?${params.toString()}`);

    return {
      vectors: response.vectors,
      namespace: response.namespace,
    };
  }

  async delete(params: DeleteParams): Promise<void> {
    await this.request("/vectors/delete", {
      method: "POST",
      body: JSON.stringify({
        ids: params.ids,
        deleteAll: params.deleteAll,
        namespace: params.namespace,
        filter: params.filter,
      }),
    });
  }
}

/**
 * Factory function to create Pinecone adapter from configuration
 */
export const createPineconeAdapter = (
  config: PineconeConfig,
): VectorDatabase => {
  return new PineconeAdapter(config);
};
