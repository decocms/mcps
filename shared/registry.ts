import type { EVENT_BUS_BINDING } from "@decocms/bindings";
import type { createCollectionBindings } from "@decocms/bindings/collections";
import type { BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

export type ConnectionBinding = {
  COLLECTION_CONNECTIONS_UPDATE: (params: {
    id: string;
    data: {
      configuration_state: object;
      configuration_scopes: string[];
    };
  }) => Promise<unknown>;
  COLLECTION_CONNECTIONS_GET: (params: { id: string }) => Promise<{
    item: {
      configuration_state: object;
      configuration_scopes: string[];
      tools: {
        name: string;
        description: string;
        inputSchema: object;
        outputSchema: object;
      }[];
    };
  }>;
  // Accepts an (empty) object because MCP tool validation rejects `undefined` inputs.
  COLLECTION_CONNECTIONS_LIST: (params?: Record<string, never>) => Promise<{
    items: {
      id: string;
      title: string;
      tools: {
        name: string;
        description: string;
        inputSchema: object;
        outputSchema: object;
      }[];
    }[];
  }>;
};
const ConnectionSchema = z.object({
  configuration_state: z.object({}),
  configuration_scopes: z.array(z.string()),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    }),
  ),
});

export interface Registry extends BindingRegistry {
  "@deco/event-bus": typeof EVENT_BUS_BINDING;
  "@deco/connection": ReturnType<
    typeof createCollectionBindings<typeof ConnectionSchema, "connections">
  >;
  "@deco/postgres": [
    {
      name: "DATABASES_RUN_SQL";
      description: "Run a SQL query against the database";
      inputSchema: z.ZodType<{
        sql: string;
        params?: unknown[];
      }>;
      outputSchema: z.ZodType<{
        result: {
          results?: unknown[];
          success?: boolean;
        }[];
      }>;
    },
  ];
  "@deco/wallet": [
    {
      name: "COMMIT_PRE_AUTHORIZED_AMOUNT";
      inputSchema: z.ZodType<{
        identifier?: string;
        contractId: string;
        vendorId: string;
        amount: string; // in microdollars
        metadata?: Record<string, unknown>;
      }>;
      outputSchema: z.ZodType<{
        id: string;
      }>;
    },
    {
      name: "PRE_AUTHORIZE_AMOUNT";
      inputSchema: z.ZodType<{
        amount: string; // in microdollars
        metadata?: Record<string, unknown>;
      }>;
      outputSchema: z.ZodType<{
        id: string;
      }>;
    },
  ];

  /**
   * Perplexity binding - matches official @perplexity-ai/mcp-server
   *
   * Tools: perplexity_ask, perplexity_reason, perplexity_research
   * All accept messages array with role/content
   */
  "@deco/perplexity-ai": [
    {
      name: "perplexity_ask";
      inputSchema: z.ZodType<{
        messages: Array<{ role: string; content: string }>;
      }>;
      outputSchema: z.ZodType<{
        content: string;
        citations?: string[];
      }>;
    },
    {
      name: "perplexity_research";
      inputSchema: z.ZodType<{
        messages: Array<{ role: string; content: string }>;
      }>;
      outputSchema: z.ZodType<{
        content: string;
        citations?: string[];
      }>;
      opt?: true;
    },
    {
      name: "perplexity_reason";
      inputSchema: z.ZodType<{
        messages: Array<{ role: string; content: string }>;
      }>;
      outputSchema: z.ZodType<{
        content: string;
      }>;
      opt?: true;
    },
  ];

  /**
   * Firecrawl binding - matches official firecrawl-mcp
   *
   * Tools: firecrawl_scrape, firecrawl_crawl, firecrawl_map, firecrawl_search, etc.
   */
  "@deco/firecrawl": [
    {
      name: "firecrawl_scrape";
      inputSchema: z.ZodType<{
        url: string;
        formats?: string[];
        onlyMainContent?: boolean;
      }>;
      outputSchema: z.ZodType<{
        success: boolean;
        data?: unknown;
        error?: string;
      }>;
    },
    {
      name: "firecrawl_crawl";
      inputSchema: z.ZodType<{
        url: string;
        maxDepth?: number;
        limit?: number;
      }>;
      outputSchema: z.ZodType<{
        success: boolean;
        data?: unknown;
        error?: string;
      }>;
      opt?: true;
    },
    {
      name: "firecrawl_map";
      inputSchema: z.ZodType<{
        url: string;
        search?: string;
        limit?: number;
      }>;
      outputSchema: z.ZodType<{
        success: boolean;
        data?: unknown;
        error?: string;
      }>;
      opt?: true;
    },
  ];

  /**
   * Local FS binding - matches @decocms/mcp-local-fs (Mesh-style names)
   *
   * Tools: FILE_READ, FILE_WRITE for basic file operations
   */
  "@deco/local-fs": [
    {
      name: "FILE_READ";
      inputSchema: z.ZodType<{
        path: string;
        encoding?: "utf-8" | "base64";
      }>;
      outputSchema: z.ZodType<{
        content: string;
        metadata: {
          id: string;
          title: string;
          path: string;
          mimeType: string;
          size: number;
        };
      }>;
    },
    {
      name: "FILE_WRITE";
      inputSchema: z.ZodType<{
        path: string;
        content: string;
        encoding?: "utf-8" | "base64";
        createParents?: boolean;
        overwrite?: boolean;
      }>;
      outputSchema: z.ZodType<{
        file: {
          id: string;
          title: string;
          path: string;
          mimeType: string;
          size: number;
        };
      }>;
    },
    {
      name: "FILE_DELETE";
      inputSchema: z.ZodType<{
        path: string;
        recursive?: boolean;
      }>;
      outputSchema: z.ZodType<{
        success: boolean;
        path: string;
      }>;
      opt?: true;
    },
    {
      name: "list_directory";
      inputSchema: z.ZodType<{
        path: string;
      }>;
      outputSchema: z.ZodType<string>;
      opt?: true;
    },
  ];

  /**
   * MCP Filesystem binding - matches official @modelcontextprotocol/server-filesystem
   *
   * This is a drop-in compatible binding that works with:
   * - @modelcontextprotocol/server-filesystem (official)
   * - @decocms/mcp-local-fs (our implementation)
   *
   * Tools: read_file, write_file, list_directory, create_directory
   */
  "@deco/mcp-filesystem": [
    {
      name: "read_file";
      inputSchema: z.ZodType<{
        path: string;
      }>;
      outputSchema: z.ZodType<unknown>;
    },
    {
      name: "write_file";
      inputSchema: z.ZodType<{
        path: string;
        content: string;
      }>;
      outputSchema: z.ZodType<unknown>;
    },
    {
      name: "list_directory";
      inputSchema: z.ZodType<{
        path: string;
      }>;
      outputSchema: z.ZodType<unknown>;
      opt?: true;
    },
    {
      name: "create_directory";
      inputSchema: z.ZodType<{
        path: string;
      }>;
      outputSchema: z.ZodType<unknown>;
      opt?: true;
    },
  ];
}
