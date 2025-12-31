/**
 * Database Client for Postgres Memory
 *
 * Uses the postgres library for efficient database access.
 * Supports pgvector for semantic similarity search.
 */

import postgres from "postgres";
import type {
  Memory,
  MemorySearchResult,
  MemoryEdge,
  AddMemoryInput,
  SearchMemoryInput,
  LinkMemoryInput,
} from "./types.ts";

export interface MemoryDbClient {
  /**
   * Add a new memory to the database
   * Returns existing memory if dedupe is true and content already exists
   */
  addMemory(input: AddMemoryInput, embedding: number[]): Promise<Memory>;

  /**
   * Get a memory by ID
   */
  getMemory(namespace: string, id: string): Promise<Memory | null>;

  /**
   * Search memories by semantic similarity
   */
  searchMemories(
    input: SearchMemoryInput,
    queryEmbedding: number[],
  ): Promise<MemorySearchResult[]>;

  /**
   * Get neighbor memories (1-hop graph traversal)
   */
  getNeighbors(
    namespace: string,
    memoryIds: string[],
    hop?: number,
  ): Promise<Memory[]>;

  /**
   * Create an edge between two memories
   */
  linkMemories(input: LinkMemoryInput): Promise<MemoryEdge>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;
}

/**
 * Hash content using SHA-256 for deduplication
 */
async function hashContent(
  namespace: string,
  content: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${namespace}:${content}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Convert database row to Memory API type
 */
function toMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    namespace: row.namespace as string,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
    source_type: row.source_type as string,
    source_id: row.source_id as string | null,
    source_url: row.source_url as string | null,
    title: row.title as string | null,
    content: row.content as string,
    tags: row.tags as string[],
    metadata: row.metadata as Record<string, unknown>,
  };
}

/**
 * Convert database row to MemorySearchResult
 */
function toSearchResult(row: Record<string, unknown>): MemorySearchResult {
  // Convert cosine distance to similarity score (1 - distance)
  const distance = row.distance as number;
  const score = 1 - distance;

  return {
    ...toMemory(row),
    score,
  };
}

/**
 * Format embedding array for pgvector
 */
function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Create a memory database client
 */
export function createMemoryDbClient(connectionString: string): MemoryDbClient {
  const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return {
    async addMemory(
      input: AddMemoryInput,
      embedding: number[],
    ): Promise<Memory> {
      const {
        namespace,
        content,
        title = null,
        tags = [],
        source_type = "agent",
        source_id = null,
        source_url = null,
        metadata = {},
        dedupe = true,
      } = input;

      const contentHash = await hashContent(namespace, content);
      const embeddingStr = formatEmbedding(embedding);

      if (dedupe) {
        // Try to find existing memory first
        const existing = await sql`
          SELECT id, namespace, created_at, updated_at, source_type, source_id, 
                 source_url, title, content, tags, metadata
          FROM memories
          WHERE namespace = ${namespace} AND content_hash = ${contentHash}
        `;

        if (existing.length > 0) {
          return toMemory(existing[0]);
        }
      }

      // Insert new memory
      const result = await sql`
        INSERT INTO memories (
          namespace, content, content_hash, title, tags, 
          source_type, source_id, source_url, metadata, embedding
        )
        VALUES (
          ${namespace}, ${content}, ${contentHash}, ${title}, ${tags},
          ${source_type}, ${source_id}, ${source_url}, ${JSON.stringify(metadata)},
          ${sql.unsafe(`'${embeddingStr}'::vector`)}
        )
        ON CONFLICT (namespace, content_hash) DO UPDATE SET updated_at = NOW()
        RETURNING id, namespace, created_at, updated_at, source_type, source_id,
                  source_url, title, content, tags, metadata
      `;

      return toMemory(result[0]);
    },

    async getMemory(namespace: string, id: string): Promise<Memory | null> {
      const result = await sql`
        SELECT id, namespace, created_at, updated_at, source_type, source_id,
               source_url, title, content, tags, metadata
        FROM memories
        WHERE namespace = ${namespace} AND id = ${id}::uuid
      `;

      if (result.length === 0) {
        return null;
      }

      return toMemory(result[0]);
    },

    async searchMemories(
      input: SearchMemoryInput,
      queryEmbedding: number[],
    ): Promise<MemorySearchResult[]> {
      const {
        namespace,
        topK = 10,
        tagFilter = [],
        sourceTypeFilter = [],
        dateFrom,
        dateTo,
      } = input;

      const embeddingStr = formatEmbedding(queryEmbedding);

      // Build dynamic WHERE conditions
      let conditions = sql`namespace = ${namespace}`;

      if (tagFilter.length > 0) {
        conditions = sql`${conditions} AND tags && ${tagFilter}::text[]`;
      }

      if (sourceTypeFilter.length > 0) {
        conditions = sql`${conditions} AND source_type = ANY(${sourceTypeFilter})`;
      }

      if (dateFrom) {
        conditions = sql`${conditions} AND created_at >= ${dateFrom}::timestamptz`;
      }

      if (dateTo) {
        conditions = sql`${conditions} AND created_at <= ${dateTo}::timestamptz`;
      }

      // Execute vector similarity search
      const result = await sql`
        SELECT 
          id, namespace, created_at, updated_at, source_type, source_id,
          source_url, title, content, tags, metadata,
          embedding <=> ${sql.unsafe(`'${embeddingStr}'::vector`)} as distance
        FROM memories
        WHERE ${conditions}
        ORDER BY distance ASC
        LIMIT ${topK}
      `;

      return result.map((row) => toSearchResult(row));
    },

    async getNeighbors(
      namespace: string,
      memoryIds: string[],
      hop: number = 1,
    ): Promise<Memory[]> {
      if (memoryIds.length === 0 || hop < 1) {
        return [];
      }

      // For now, implement 1-hop traversal
      // Future: implement multi-hop with recursive CTE
      const result = await sql`
        SELECT DISTINCT 
          m.id, m.namespace, m.created_at, m.updated_at, m.source_type, 
          m.source_id, m.source_url, m.title, m.content, m.tags, m.metadata
        FROM memories m
        INNER JOIN memory_edges e ON (m.id = e.to_id OR m.id = e.from_id)
        WHERE e.namespace = ${namespace}
          AND (e.from_id = ANY(${memoryIds}::uuid[]) OR e.to_id = ANY(${memoryIds}::uuid[]))
          AND m.id != ALL(${memoryIds}::uuid[])
      `;

      return result.map((row) => toMemory(row));
    },

    async linkMemories(input: LinkMemoryInput): Promise<MemoryEdge> {
      const {
        namespace,
        from_id,
        to_id,
        rel_type,
        weight = 1.0,
        metadata = {},
      } = input;

      const result = await sql`
        INSERT INTO memory_edges (namespace, from_id, to_id, rel_type, weight, metadata)
        VALUES (${namespace}, ${from_id}::uuid, ${to_id}::uuid, ${rel_type}, ${weight}, ${JSON.stringify(metadata)})
        RETURNING id, namespace, created_at, from_id, to_id, rel_type, weight, metadata
      `;

      const row = result[0];
      return {
        id: row.id as string,
        namespace: row.namespace as string,
        created_at: row.created_at as Date,
        from_id: row.from_id as string,
        to_id: row.to_id as string,
        rel_type: row.rel_type as MemoryEdge["rel_type"],
        weight: row.weight as number,
        metadata: row.metadata as Record<string, unknown>,
      };
    },

    async close(): Promise<void> {
      await sql.end();
    },
  };
}

// Singleton database client
let cachedClient: MemoryDbClient | null = null;

/**
 * Get the database client (creates it lazily)
 */
export function getMemoryDbClient(): MemoryDbClient {
  if (!cachedClient) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    cachedClient = createMemoryDbClient(connectionString);
  }
  return cachedClient;
}
