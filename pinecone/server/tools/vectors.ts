/**
 * Pinecone vector operations tools.
 *
 * This file contains all tools related to Pinecone vector operations including:
 * - Upserting vectors (insert/update)
 * - Querying vectors by similarity
 * - Fetching vectors by IDs
 * - Deleting vectors
 */

import { z } from "zod";
import { createTool } from "@decocms/runtime/mastra";
import { PineconeAdapter } from "@decocms/mcps-shared/vector-databases";

import type { Env } from "../main.ts";

/**
 * Schema for a vector with optional metadata
 */
const VectorSchema = z.object({
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
 * UPSERT_VECTORS - Insert or update vectors in the Pinecone index
 */
export const createUpsertVectorsTool = (env: Env) =>
  createTool({
    id: "UPSERT_VECTORS",
    description:
      "Insert or update vectors in the Pinecone index. If a vector with the same ID exists, it will be updated. Supports batch operations with multiple vectors at once. Use this to add embeddings to your vector database.",
    inputSchema: z.object({
      vectors: z
        .array(VectorSchema)
        .min(1)
        .max(1000)
        .describe("Array of vectors to upsert (max 1000 per request)"),
      namespace: z
        .string()
        .optional()
        .describe(
          "Optional namespace to organize vectors (uses state default if not provided)",
        ),
    }),
    execute: async (ctx: any) => {
      const { input } = ctx;
      try {
        const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

        // Create vector database adapter
        const vectorDB = new PineconeAdapter({
          apiKey: state.apiKey,
          indexHost: state.indexHost,
        });

        // Use input namespace or fall back to state namespace
        const namespace = input.namespace || state.namespace;

        const result = await vectorDB.upsert(input.vectors, namespace);

        return {
          success: true,
          upsertedCount: result.upsertedCount,
          namespace: namespace || "default",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          upsertedCount: 0,
        };
      }
    },
  });

/**
 * QUERY_VECTORS - Query vectors by similarity
 */
export const createQueryVectorsTool = (env: Env) =>
  createTool({
    id: "QUERY_VECTORS",
    description:
      "Query vectors by similarity using either a query vector or an existing vector ID. Returns the most similar vectors ranked by score. Use this for semantic search, finding similar items, or recommendation systems. You can filter results by metadata and control which data is included in the response.",
    inputSchema: z.object({
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
          "Optional namespace to search within (uses state default if not provided)",
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
        .describe(
          "Whether to include vector values in results (default: false)",
        ),
      sparseVector: z
        .object({
          indices: z.array(z.number()).describe("Indices of non-zero values"),
          values: z.array(z.number()).describe("Non-zero values"),
        })
        .optional()
        .describe("Optional sparse vector for hybrid search"),
    }),
    execute: async (ctx: any) => {
      const { input } = ctx;
      try {
        // Validate that either vector or id is provided, but not both
        if (!input.vector && !input.id) {
          return {
            success: false,
            error: "Either 'vector' or 'id' must be provided",
            matches: [],
          };
        }

        if (input.vector && input.id) {
          return {
            success: false,
            error: "Cannot provide both 'vector' and 'id' - choose one",
            matches: [],
          };
        }

        const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

        // Create vector database adapter
        const vectorDB = new PineconeAdapter({
          apiKey: state.apiKey,
          indexHost: state.indexHost,
        });

        // Use input namespace or fall back to state namespace
        const namespace = input.namespace || state.namespace;

        const result = await vectorDB.query({
          vector: input.vector,
          id: input.id,
          topK: input.topK,
          namespace,
          filter: input.filter,
          includeMetadata: input.includeMetadata,
          includeValues: input.includeValues,
          sparseVector: input.sparseVector,
        });

        return {
          success: true,
          matches: result.matches,
          namespace: namespace || "default",
          count: result.matches.length,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          matches: [],
        };
      }
    },
  });

/**
 * FETCH_VECTORS - Fetch vectors by their IDs
 */
export const createFetchVectorsTool = (env: Env) =>
  createTool({
    id: "FETCH_VECTORS",
    description:
      "Fetch specific vectors by their IDs. Returns the complete vector data including values and metadata. Use this to retrieve known vectors by their identifiers. Maximum 1000 IDs per request.",
    inputSchema: z.object({
      ids: z
        .array(z.string())
        .min(1)
        .max(1000)
        .describe("Array of vector IDs to fetch (max 1000)"),
      namespace: z
        .string()
        .optional()
        .describe(
          "Optional namespace to fetch from (uses state default if not provided)",
        ),
    }),
    execute: async (ctx: any) => {
      const { input } = ctx;
      try {
        const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

        // Create vector database adapter
        const vectorDB = new PineconeAdapter({
          apiKey: state.apiKey,
          indexHost: state.indexHost,
        });

        // Use input namespace or fall back to state namespace
        const namespace = input.namespace || state.namespace;

        const result = await vectorDB.fetch(input.ids, namespace);

        return {
          success: true,
          vectors: result.vectors,
          namespace: namespace || "default",
          count: Object.keys(result.vectors).length,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          vectors: {},
        };
      }
    },
  });

/**
 * DELETE_VECTORS - Delete vectors from the index
 */
export const createDeleteVectorsTool = (env: Env) =>
  createTool({
    id: "DELETE_VECTORS",
    description:
      "Delete vectors from the Pinecone index. You can delete specific vectors by IDs, delete all vectors in a namespace, or delete vectors matching a metadata filter. Use with caution as this operation is irreversible.",
    inputSchema: z.object({
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
          "Optional namespace to delete from (uses state default if not provided)",
        ),
      filter: z
        .record(z.any())
        .optional()
        .describe(
          "Optional metadata filter to select vectors to delete (e.g., {status: 'archived'})",
        ),
    }),
    execute: async (ctx: any) => {
      const { input } = ctx;
      try {
        // Validate that at least one deletion method is provided
        if (!input.ids && !input.deleteAll && !input.filter) {
          return {
            success: false,
            error:
              "Must provide either 'ids', 'deleteAll', or 'filter' for deletion",
          };
        }

        const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

        // Create vector database adapter
        const vectorDB = new PineconeAdapter({
          apiKey: state.apiKey,
          indexHost: state.indexHost,
        });

        // Use input namespace or fall back to state namespace
        const namespace = input.namespace || state.namespace;

        await vectorDB.delete({
          ids: input.ids,
          deleteAll: input.deleteAll,
          namespace,
          filter: input.filter,
        });

        // Construct a descriptive message
        let message = "Vectors deleted successfully";
        if (input.deleteAll) {
          message = `All vectors deleted from namespace '${namespace || "default"}'`;
        } else if (input.ids) {
          message = `Deleted ${input.ids.length} vector(s)`;
        } else if (input.filter) {
          message = `Deleted vectors matching filter in namespace '${namespace || "default"}'`;
        }

        return {
          success: true,
          message,
          namespace: namespace || "default",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

// Export all vector tools as an array
export const vectorTools = [
  createUpsertVectorsTool,
  createQueryVectorsTool,
  createFetchVectorsTool,
  createDeleteVectorsTool,
];
