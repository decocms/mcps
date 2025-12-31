/**
 * Type definitions for the postgres-memory MCP
 */

// ============================================================================
// Database Types
// ============================================================================

/**
 * Memory record as stored in the database
 */
export interface MemoryRecord {
  id: string;
  namespace: string;
  created_at: Date;
  updated_at: Date;
  source_type: string;
  source_id: string | null;
  source_url: string | null;
  title: string | null;
  content: string;
  content_hash: string;
  tags: string[];
  metadata: Record<string, unknown>;
  embedding: number[];
}

/**
 * Memory edge as stored in the database
 */
export interface MemoryEdge {
  id: string;
  namespace: string;
  created_at: Date;
  from_id: string;
  to_id: string;
  rel_type: "updates" | "extends" | "derives" | "mentions";
  weight: number;
  metadata: Record<string, unknown>;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Memory returned from API (without embedding)
 */
export interface Memory {
  id: string;
  namespace: string;
  created_at: string;
  updated_at: string;
  source_type: string;
  source_id: string | null;
  source_url: string | null;
  title: string | null;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

/**
 * Search result with similarity score
 */
export interface MemorySearchResult extends Memory {
  score: number;
}

/**
 * Search response with optional related memories
 */
export interface SearchResponse {
  results: MemorySearchResult[];
  related?: Memory[];
}

// ============================================================================
// Input Types
// ============================================================================

export interface AddMemoryInput {
  namespace: string;
  content: string;
  title?: string;
  tags?: string[];
  source_type?: string;
  source_id?: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
  dedupe?: boolean;
}

export interface GetMemoryInput {
  namespace: string;
  id: string;
}

export interface SearchMemoryInput {
  namespace: string;
  query: string;
  topK?: number;
  tagFilter?: string[];
  sourceTypeFilter?: string[];
  dateFrom?: string;
  dateTo?: string;
  includeNeighbors?: boolean;
  neighborsHop?: number;
}

export interface LinkMemoryInput {
  namespace: string;
  from_id: string;
  to_id: string;
  rel_type: "updates" | "extends" | "derives" | "mentions";
  weight?: number;
  metadata?: Record<string, unknown>;
}
