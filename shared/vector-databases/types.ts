/**
 * Shared types for vector database operations.
 *
 * These types are used across all vector database adapters.
 */

/**
 * Vector representation with optional metadata and sparse values
 */
export interface Vector {
  /** Unique identifier for the vector */
  id: string;
  /** Dense vector embedding values */
  values: number[];
  /** Optional metadata associated with the vector */
  metadata?: Record<string, string | number | boolean | string[]>;
  /** Optional sparse vector values for hybrid search */
  sparseValues?: {
    indices: number[];
    values: number[];
  };
}

/**
 * Match result from a similarity query
 */
export interface Match {
  /** Vector ID */
  id: string;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
  /** Vector values (if requested) */
  values?: number[];
  /** Vector metadata (if requested) */
  metadata?: Record<string, string | number | boolean | string[]>;
  /** Sparse vector values (if available) */
  sparseValues?: {
    indices: number[];
    values: number[];
  };
}

/**
 * Result of an upsert operation
 */
export interface UpsertResult {
  /** Number of vectors successfully upserted */
  upsertedCount: number;
}

/**
 * Parameters for querying vectors
 */
export interface QueryParams {
  /** Query vector (mutually exclusive with id) */
  vector?: number[];
  /** ID of existing vector to use as query (mutually exclusive with vector) */
  id?: string;
  /** Number of top results to return */
  topK: number;
  /** Optional namespace to search within */
  namespace?: string;
  /** Optional metadata filter */
  filter?: Record<string, any>;
  /** Whether to include metadata in results */
  includeMetadata?: boolean;
  /** Whether to include vector values in results */
  includeValues?: boolean;
  /** Optional sparse vector for hybrid search */
  sparseVector?: {
    indices: number[];
    values: number[];
  };
}

/**
 * Result of a query operation
 */
export interface QueryResult {
  /** Array of matching vectors with scores */
  matches: Match[];
  /** Namespace searched (if applicable) */
  namespace?: string;
}

/**
 * Result of a fetch operation
 */
export interface FetchResult {
  /** Map of vector IDs to vector data */
  vectors: Record<string, Vector>;
  /** Namespace fetched from (if applicable) */
  namespace?: string;
}

/**
 * Parameters for deleting vectors
 */
export interface DeleteParams {
  /** Specific vector IDs to delete */
  ids?: string[];
  /** Delete all vectors in namespace */
  deleteAll?: boolean;
  /** Optional namespace to delete from */
  namespace?: string;
  /** Optional metadata filter to select vectors to delete */
  filter?: Record<string, any>;
}
