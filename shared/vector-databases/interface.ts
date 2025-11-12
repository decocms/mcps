/**
 * Core interface for vector database operations.
 *
 * This interface provides a unified API for working with different
 * vector database providers (Pinecone, Qdrant, Weaviate, etc.).
 */

import type {
  Vector,
  UpsertResult,
  QueryParams,
  QueryResult,
  FetchResult,
  DeleteParams,
} from "./types.ts";

/**
 * Core vector database interface with essential operations.
 * All vector database adapters must implement this interface.
 */
export interface VectorDatabase {
  /**
   * Insert or update vectors in the database.
   *
   * @param vectors - Array of vectors to upsert
   * @param namespace - Optional namespace to organize vectors
   * @returns Result with count of upserted vectors
   */
  upsert(vectors: Vector[], namespace?: string): Promise<UpsertResult>;

  /**
   * Query vectors by similarity.
   *
   * @param params - Query parameters including vector/id, topK, filters, etc.
   * @returns Query results with matching vectors and scores
   */
  query(params: QueryParams): Promise<QueryResult>;

  /**
   * Fetch specific vectors by their IDs.
   *
   * @param ids - Array of vector IDs to fetch
   * @param namespace - Optional namespace to fetch from
   * @returns Fetched vectors with their data
   */
  fetch(ids: string[], namespace?: string): Promise<FetchResult>;

  /**
   * Delete vectors from the database.
   *
   * @param params - Delete parameters (ids, filters, or deleteAll flag)
   * @returns Promise that resolves when deletion is complete
   */
  delete(params: DeleteParams): Promise<void>;
}

/**
 * Extended vector database interface with additional operations.
 * Optional methods that some providers may not support.
 */
export interface ExtendedVectorDatabase extends VectorDatabase {
  /**
   * Get statistics about the index.
   *
   * @param namespace - Optional namespace to get stats for
   * @returns Index statistics (vector count, dimensions, etc.)
   */
  getStats?(namespace?: string): Promise<{
    vectorCount: number;
    dimensions?: number;
    namespaces?: Record<string, { vectorCount: number }>;
  }>;

  /**
   * List all namespaces in the index.
   *
   * @returns Array of namespace names
   */
  listNamespaces?(): Promise<string[]>;

  /**
   * Update vector metadata without changing the vector values.
   *
   * @param id - Vector ID
   * @param metadata - New metadata
   * @param namespace - Optional namespace
   */
  updateMetadata?(
    id: string,
    metadata: Record<string, string | number | boolean | string[]>,
    namespace?: string,
  ): Promise<void>;
}
