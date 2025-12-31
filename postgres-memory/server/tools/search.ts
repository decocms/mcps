/**
 * memory.search Tool
 *
 * Search memories by semantic similarity using vector search.
 */

import { z } from "zod";
import { getMemoryDbClient } from "../lib/db.ts";
import { getEmbeddingsProvider } from "../lib/embeddings.ts";
import { MemorySchema } from "./get.ts";

export const SearchMemoryInputSchema = z.object({
  namespace: z.string().min(1).describe("The namespace to search in"),
  query: z
    .string()
    .min(1)
    .describe("The search query (will be embedded for semantic search)"),
  topK: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum number of results to return (default: 10, max: 100)"),
  tagFilter: z
    .array(z.string())
    .optional()
    .describe("Filter results to only include memories with any of these tags"),
  sourceTypeFilter: z
    .array(z.string())
    .optional()
    .describe(
      "Filter results to only include memories from these source types",
    ),
  dateFrom: z
    .string()
    .optional()
    .describe("Filter results to memories created on or after this ISO date"),
  dateTo: z
    .string()
    .optional()
    .describe("Filter results to memories created on or before this ISO date"),
  includeNeighbors: z
    .boolean()
    .default(false)
    .describe("If true, also return related memories connected by edges"),
  neighborsHop: z
    .number()
    .int()
    .min(1)
    .max(3)
    .default(1)
    .describe("Number of hops for neighbor traversal (default: 1, max: 3)"),
});

export const SearchResultSchema = MemorySchema.extend({
  score: z.number().describe("Similarity score (0-1, higher is more similar)"),
});

export const SearchMemoryOutputSchema = z.object({
  results: z
    .array(SearchResultSchema)
    .describe("Search results ordered by similarity"),
  related: z
    .array(MemorySchema)
    .optional()
    .describe(
      "Related memories from graph traversal (if includeNeighbors is true)",
    ),
});

export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;
export type SearchMemoryOutput = z.infer<typeof SearchMemoryOutputSchema>;

/**
 * Execute the memory.search tool
 */
export async function executeSearchMemory(
  input: SearchMemoryInput,
): Promise<SearchMemoryOutput> {
  const db = getMemoryDbClient();
  const embeddings = getEmbeddingsProvider();

  // Generate embedding for the query
  const [queryEmbedding] = await embeddings.embed([input.query]);

  // Search memories
  const results = await db.searchMemories(
    {
      namespace: input.namespace,
      query: input.query,
      topK: input.topK,
      tagFilter: input.tagFilter,
      sourceTypeFilter: input.sourceTypeFilter,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    },
    queryEmbedding,
  );

  // Optionally fetch related memories via graph traversal
  let related: SearchMemoryOutput["related"];
  if (input.includeNeighbors && results.length > 0) {
    const memoryIds = results.map((r) => r.id);
    related = await db.getNeighbors(
      input.namespace,
      memoryIds,
      input.neighborsHop,
    );
  }

  return {
    results,
    related,
  };
}
