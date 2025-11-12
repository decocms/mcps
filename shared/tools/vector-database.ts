/**
 * Generic factory functions for creating vector database MCP tools.
 *
 * These functions create standard MCP tools that work with any vector database client
 * that implements the required methods (upsert, query, fetch, delete).
 * This allows for consistent tool interfaces across different vector database providers
 * (Pinecone, Qdrant, Weaviate, etc.).
 */

import { createTool } from "@decocms/runtime/mastra";
import type {
  Vector,
  UpsertResult,
  QueryParams,
  QueryResult,
  FetchResult,
  DeleteParams,
} from "../vector-databases/types.ts";
import {
  UpsertVectorsInputSchema,
  QueryVectorsInputSchema,
  FetchVectorsInputSchema,
  DeleteVectorsInputSchema,
} from "../vector-databases/schemas.ts";

/**
 * Minimal interface for a vector database client
 * Can be implemented by adapters or simple clients
 */
export interface VectorDatabaseClient {
  upsert(vectors: Vector[], namespace?: string): Promise<UpsertResult>;
  query(params: QueryParams): Promise<QueryResult>;
  fetch(ids: string[], namespace?: string): Promise<FetchResult>;
  delete(params: DeleteParams): Promise<void>;
}

/**
 * Configuration for vector database tool creation
 */
export interface VectorDatabaseToolsConfig {
  /**
   * Function to get the vector database client instance
   * This is called on each tool execution
   * Can return an adapter or a direct client (e.g., PineconeClient)
   */
  getClient: () => VectorDatabaseClient;

  /**
   * Optional function to get the default namespace
   * If not provided, tools will use undefined as default
   */
  getDefaultNamespace?: () => string | undefined;

  /**
   * Optional custom tool ID prefix (default: empty string)
   * Useful to differentiate tools when multiple vector DBs are used
   */
  toolIdPrefix?: string;
}

/**
 * Creates a complete set of vector database tools (upsert, query, fetch, delete)
 *
 * @param config - Configuration for tool creation
 * @returns Object containing all vector database tools
 *
 * @example
 * ```typescript
 * const tools = createVectorDatabaseTools({
 *   getClient: () => createPineconeClient(env),
 *   getDefaultNamespace: () => state.namespace,
 * });
 * ```
 */
export const createVectorDatabaseTools = (
  config: VectorDatabaseToolsConfig,
) => {
  const { getClient, getDefaultNamespace, toolIdPrefix = "" } = config;

  return {
    upsert: createUpsertVectorsTool(
      getClient,
      getDefaultNamespace,
      toolIdPrefix,
    ),
    query: createQueryVectorsTool(getClient, getDefaultNamespace, toolIdPrefix),
    fetch: createFetchVectorsTool(getClient, getDefaultNamespace, toolIdPrefix),
    delete: createDeleteVectorsTool(
      getClient,
      getDefaultNamespace,
      toolIdPrefix,
    ),
  };
};

/**
 * Creates an UPSERT_VECTORS tool
 */
export const createUpsertVectorsTool = (
  getClient: () => VectorDatabaseClient,
  getDefaultNamespace?: () => string | undefined,
  toolIdPrefix = "",
) =>
  createTool({
    id: `${toolIdPrefix}UPSERT_VECTORS`,
    description:
      "Insert or update vectors in the vector database index. If a vector with the same ID exists, it will be updated. Supports batch operations with multiple vectors at once. Use this to add embeddings to your vector database.",
    inputSchema: UpsertVectorsInputSchema,
    execute: async (ctx: any) => {
      const { input } = ctx;
      try {
        const client = getClient();
        const namespace = input.namespace || getDefaultNamespace?.();

        const result = await client.upsert(input.vectors, namespace);

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
 * Creates a QUERY_VECTORS tool
 */
export const createQueryVectorsTool = (
  getClient: () => VectorDatabaseClient,
  getDefaultNamespace?: () => string | undefined,
  toolIdPrefix = "",
) =>
  createTool({
    id: `${toolIdPrefix}QUERY_VECTORS`,
    description:
      "Query vectors by similarity using either a query vector or an existing vector ID. Returns the most similar vectors ranked by score. Use this for semantic search, finding similar items, or recommendation systems. You can filter results by metadata and control which data is included in the response.",
    inputSchema: QueryVectorsInputSchema,
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

        const client = getClient();
        const namespace = input.namespace || getDefaultNamespace?.();

        const result = await client.query({
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
 * Creates a FETCH_VECTORS tool
 */
export const createFetchVectorsTool = (
  getClient: () => VectorDatabaseClient,
  getDefaultNamespace?: () => string | undefined,
  toolIdPrefix = "",
) =>
  createTool({
    id: `${toolIdPrefix}FETCH_VECTORS`,
    description:
      "Fetch specific vectors by their IDs. Returns the complete vector data including values and metadata. Use this to retrieve known vectors by their identifiers. Maximum 1000 IDs per request.",
    inputSchema: FetchVectorsInputSchema,
    execute: async (ctx: any) => {
      const { input } = ctx;
      try {
        const client = getClient();
        const namespace = input.namespace || getDefaultNamespace?.();

        const result = await client.fetch(input.ids, namespace);

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
 * Creates a DELETE_VECTORS tool
 */
export const createDeleteVectorsTool = (
  getClient: () => VectorDatabaseClient,
  getDefaultNamespace?: () => string | undefined,
  toolIdPrefix = "",
) =>
  createTool({
    id: `${toolIdPrefix}DELETE_VECTORS`,
    description:
      "Delete vectors from the vector database index. You can delete specific vectors by IDs, delete all vectors in a namespace, or delete vectors matching a metadata filter. Use with caution as this operation is irreversible.",
    inputSchema: DeleteVectorsInputSchema,
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

        const client = getClient();
        const namespace = input.namespace || getDefaultNamespace?.();

        await client.delete({
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

/**
 * Convenience function to get all tools as an array
 * Useful for passing directly to the MCP server
 *
 * @param config - Configuration for tool creation
 * @returns Array of all vector database tools
 */
export const getVectorDatabaseToolsArray = (
  config: VectorDatabaseToolsConfig,
) => {
  const tools = createVectorDatabaseTools(config);
  return [tools.upsert, tools.query, tools.fetch, tools.delete];
};
