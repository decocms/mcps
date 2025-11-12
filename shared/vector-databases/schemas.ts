/**
 * Zod schemas for vector database operations.
 *
 * These schemas are used for validation in MCP tools across all vector database adapters.
 */

import { z } from "zod";

/**
 * Schema for a vector with optional metadata and sparse values
 */
export const VectorSchema = z.object({
  id: z.string().describe("Unique identifier for the vector"),
  values: z.array(z.number()).describe("Vector embedding values"),
  metadata: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional()
    .describe("Optional metadata associated with the vector"),
  sparseValues: z
    .object({
      indices: z.array(z.number()).describe("Indices of non-zero values"),
      values: z.array(z.number()).describe("Non-zero values"),
    })
    .optional()
    .describe("Optional sparse vector values for hybrid search"),
});

/**
 * Schema for upserting vectors
 */
export const UpsertVectorsInputSchema = z.object({
  vectors: z
    .array(VectorSchema)
    .min(1)
    .max(1000)
    .describe("Array of vectors to upsert (max 1000 per request)"),
  namespace: z
    .string()
    .optional()
    .describe(
      "Optional namespace to organize vectors (uses default if not provided)",
    ),
});

/**
 * Schema for querying vectors
 */
export const QueryVectorsInputSchema = z.object({
  vector: z
    .array(z.number())
    .optional()
    .describe("Query vector to search with (mutually exclusive with id)"),
  id: z
    .string()
    .optional()
    .describe(
      "ID of an existing vector to use as query (mutually exclusive with vector)",
    ),
  topK: z
    .number()
    .min(1)
    .max(10000)
    .default(10)
    .describe("Number of most similar results to return (default: 10)"),
  namespace: z
    .string()
    .optional()
    .describe(
      "Optional namespace to search within (uses default if not provided)",
    ),
  filter: z
    .record(z.any())
    .optional()
    .describe(
      "Optional metadata filter to apply (e.g., {category: 'electronics'})",
    ),
  includeMetadata: z
    .boolean()
    .default(true)
    .describe("Whether to include metadata in results (default: true)"),
  includeValues: z
    .boolean()
    .default(false)
    .describe("Whether to include vector values in results (default: false)"),
  sparseVector: z
    .object({
      indices: z.array(z.number()).describe("Indices of non-zero values"),
      values: z.array(z.number()).describe("Non-zero values"),
    })
    .optional()
    .describe("Optional sparse vector for hybrid search"),
});

/**
 * Schema for fetching vectors by IDs
 */
export const FetchVectorsInputSchema = z.object({
  ids: z
    .array(z.string())
    .min(1)
    .max(1000)
    .describe("Array of vector IDs to fetch (max 1000)"),
  namespace: z
    .string()
    .optional()
    .describe(
      "Optional namespace to fetch from (uses default if not provided)",
    ),
});

/**
 * Schema for deleting vectors
 */
export const DeleteVectorsInputSchema = z.object({
  ids: z
    .array(z.string())
    .optional()
    .describe("Optional array of vector IDs to delete"),
  deleteAll: z
    .boolean()
    .optional()
    .describe(
      "If true, deletes all vectors in the namespace (use with caution)",
    ),
  namespace: z
    .string()
    .optional()
    .describe(
      "Optional namespace to delete from (uses default if not provided)",
    ),
  filter: z
    .record(z.any())
    .optional()
    .describe(
      "Optional metadata filter to select vectors to delete (e.g., {status: 'archived'})",
    ),
});
