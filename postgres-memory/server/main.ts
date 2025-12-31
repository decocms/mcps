/**
 * Postgres Memory MCP Server
 *
 * A minimal, production-ready MCP server for AI memory storage
 * using Postgres + pgvector for semantic search.
 *
 * Features:
 * - Semantic search with pgvector (HNSW index)
 * - Namespace isolation (org, project, user level)
 * - Graph relationships between memories
 * - OpenRouter-compatible embeddings
 * - Automatic deduplication
 */

import { serve } from "@decocms/mcps-shared/serve";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  addMemoryTool,
  getMemoryTool,
  searchMemoryTool,
  linkMemoryTool,
} from "./tools/index.ts";

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Required environment variables:
 * - DATABASE_URL: Postgres connection string (Supabase or any Postgres with pgvector)
 * - EMBEDDINGS_BASE_URL: OpenRouter-compatible embeddings API base URL
 * - EMBEDDINGS_API_KEY: API key for embeddings provider
 * - EMBEDDINGS_MODEL: Model to use for embeddings (e.g., "openai/text-embedding-3-small")
 * - EMBEDDINGS_DIM: Embedding dimensions (default: 1536)
 */

function validateEnv(): void {
  const required = [
    "DATABASE_URL",
    "EMBEDDINGS_BASE_URL",
    "EMBEDDINGS_API_KEY",
    "EMBEDDINGS_MODEL",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nSee README.md for configuration details.");
    process.exit(1);
  }
}

// ============================================================================
// MCP Server Setup
// ============================================================================

function createServer(): McpServer {
  const server = new McpServer({
    name: "postgres-memory",
    version: "1.0.0",
  });

  // Helper to register a tool with type erasure
  function registerTool(
    id: string,
    description: string,
    inputSchema: z.ZodType,
    execute: (input: unknown) => Promise<unknown>,
  ) {
    const jsonSchema = zodToJsonSchema(inputSchema, {
      target: "openApi3",
    });

    server.registerTool(
      id,
      {
        description,
        inputSchema: jsonSchema as unknown as undefined,
      },
      async (args) => {
        try {
          const input = inputSchema.parse(args);
          const result = await execute(input);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error: ${message}`,
              },
            ],
          };
        }
      },
    );
  }

  // Register all tools
  registerTool(
    addMemoryTool.id,
    addMemoryTool.description,
    addMemoryTool.inputSchema,
    addMemoryTool.execute as (input: unknown) => Promise<unknown>,
  );

  registerTool(
    getMemoryTool.id,
    getMemoryTool.description,
    getMemoryTool.inputSchema,
    getMemoryTool.execute as (input: unknown) => Promise<unknown>,
  );

  registerTool(
    searchMemoryTool.id,
    searchMemoryTool.description,
    searchMemoryTool.inputSchema,
    searchMemoryTool.execute as (input: unknown) => Promise<unknown>,
  );

  registerTool(
    linkMemoryTool.id,
    linkMemoryTool.description,
    linkMemoryTool.inputSchema,
    linkMemoryTool.execute as (input: unknown) => Promise<unknown>,
  );

  return server;
}

// ============================================================================
// HTTP Handler
// ============================================================================

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Health check endpoint
  if (url.pathname === "/health" || url.pathname === "/") {
    return new Response(
      JSON.stringify({
        status: "ok",
        name: "postgres-memory",
        version: "1.0.0",
        tools: ["memory.add", "memory.get", "memory.search", "memory.link"],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response("Not Found", { status: 404 });
}

// ============================================================================
// Main Entry Point
// ============================================================================

const isStdio = process.argv.includes("--stdio");

console.error("🧠 Postgres Memory MCP Server starting...");
validateEnv();
console.error("✅ Environment validated");
console.error(`📊 Embeddings: ${process.env.EMBEDDINGS_MODEL}`);
console.error(
  `💾 Database: ${process.env.DATABASE_URL?.split("@")[1] ?? "configured"}`,
);

if (isStdio) {
  // STDIO mode for direct MCP connection
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Server running in STDIO mode");
} else {
  // HTTP mode for web access
  serve(handleRequest);
  console.error(`🚀 Server running on port ${process.env.PORT || 8001}`);
}
