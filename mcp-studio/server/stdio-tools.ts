/**
 * MCP Studio - Stdio Tool Registration
 *
 * Adapts the runtime-based tools for standalone stdio transport.
 * Uses Mesh bindings to connect to database via Mesh's proxy API.
 *
 * Supports Mesh bindings via TWO mechanisms:
 * 1. Environment variables (primary for STDIO):
 *    - MESH_STATE: JSON with binding connection IDs
 *    - MESH_URL: Base URL of the Mesh instance
 *    - MESH_TOKEN: JWT token for authenticating with Mesh API
 *
 * 2. MCP tools (for dynamic configuration):
 *    - MCP_CONFIGURATION: Returns the state schema for the bindings UI
 *    - ON_MCP_CONFIGURATION: Receives configured bindings dynamically
 *
 * When bindings are configured, calls Mesh's API to run SQL queries.
 * The mesh token provides authentication and the binding's connection ID
 * routes the query to the correct database.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  isFilesystemMode,
  loadWorkflows,
  getCachedWorkflows,
  getWorkflowById,
  startWatching,
  getWorkflowSource,
} from "./workflow-loader.ts";

// ============================================================================
// Configuration State (Bindings)
// ============================================================================

/**
 * Creates a binding schema compatible with Mesh UI.
 * Uses @deco/ prefix for app-name based matching.
 */
const BindingOf = (bindingType: string) =>
  z.object({
    __type: z.literal(bindingType).default(bindingType),
    value: z.string().describe("Connection ID"),
  });

/**
 * Creates a binding schema with tool-based matching.
 * Uses non-@deco/ prefix to enable tool-based filtering in Mesh.
 */
const BindingWithTools = (bindingType: string, _tools: { name: string }[]) =>
  z.object({
    __type: z.literal(bindingType).default(bindingType),
    value: z.string().describe("Connection ID"),
  });

/**
 * Tool definitions for tool-based connection matching.
 */
const DATABASE_BINDING_TOOLS = [{ name: "DATABASES_RUN_SQL" }];

const EVENT_BUS_BINDING_TOOLS = [
  { name: "EVENT_PUBLISH" },
  { name: "EVENT_SUBSCRIBE" },
];

/**
 * State schema for stdio mode bindings.
 * Uses tool-based matching for DATABASE and EVENT_BUS,
 * and app-name matching for CONNECTION.
 */
const StdioStateSchema = z.object({
  // Tool-based matching: finds connections with DATABASES_RUN_SQL tool
  DATABASE: BindingWithTools("DATABASE", DATABASE_BINDING_TOOLS)
    .optional()
    .describe("PostgreSQL database binding"),
  // Tool-based matching: finds connections with EVENT_PUBLISH/EVENT_SUBSCRIBE tools
  EVENT_BUS: BindingWithTools("EVENT_BUS", EVENT_BUS_BINDING_TOOLS)
    .optional()
    .describe("Event bus for workflow events"),
  // App-name matching: finds connections with connection management tools
  CONNECTION: BindingOf("@deco/connection")
    .optional()
    .describe("Connection management"),
});

/**
 * Post-process the state schema to inject binding tool definitions.
 * This tells Mesh to match connections by the tools they provide.
 */
function injectBindingSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const props = schema.properties as Record<string, Record<string, unknown>>;

  // Inject DATABASE binding tools
  if (props?.DATABASE?.properties) {
    const dbProps = props.DATABASE.properties as Record<
      string,
      Record<string, unknown>
    >;
    dbProps.__binding = {
      const: DATABASE_BINDING_TOOLS,
    };
  }

  // Inject EVENT_BUS binding tools
  if (props?.EVENT_BUS?.properties) {
    const ebProps = props.EVENT_BUS.properties as Record<
      string,
      Record<string, unknown>
    >;
    ebProps.__binding = {
      const: EVENT_BUS_BINDING_TOOLS,
    };
  }

  return schema;
}

// ============================================================================
// Environment Variable Parsing (for STDIO mode)
// ============================================================================

interface BindingValue {
  __type: string;
  value: string;
}

interface EnvBindings {
  database?: string;
  eventBus?: string;
  connection?: string;
}

/**
 * Parse bindings from MESH_STATE environment variable.
 * Mesh passes this when spawning STDIO processes.
 */
function parseBindingsFromEnv(): EnvBindings {
  const meshStateJson = process.env.MESH_STATE;
  if (!meshStateJson) return {};

  try {
    const state = JSON.parse(meshStateJson) as Record<string, BindingValue>;
    return {
      database: state.DATABASE?.value,
      eventBus: state.EVENT_BUS?.value,
      connection: state.CONNECTION?.value,
    };
  } catch (e) {
    console.error("[mcp-studio] Failed to parse MESH_STATE:", e);
    return {};
  }
}

// ============================================================================
// Mesh Configuration
// ============================================================================

interface MeshConfig {
  meshUrl: string;
  meshToken: string;
  databaseConnectionId: string;
}

// Parse env bindings at module load
const envBindings = parseBindingsFromEnv();

// Initialize meshConfig from env vars if available
let meshConfig: MeshConfig | null = null;
let migrationsRan = false;

// Initialize from env vars (primary path for STDIO connections)
const meshUrl = process.env.MESH_URL;
const meshToken = process.env.MESH_TOKEN;

if (meshUrl && meshToken && envBindings.database) {
  meshConfig = {
    meshUrl,
    meshToken,
    databaseConnectionId: envBindings.database,
  };
  console.error(
    "[mcp-studio] ✅ Bindings initialized from MESH_STATE env var:",
  );
  console.error(`[mcp-studio]   MESH_URL: ${meshUrl}`);
  console.error(`[mcp-studio]   DATABASE: ${envBindings.database}`);
  if (envBindings.eventBus) {
    console.error(`[mcp-studio]   EVENT_BUS: ${envBindings.eventBus}`);
  }
  if (envBindings.connection) {
    console.error(`[mcp-studio]   CONNECTION: ${envBindings.connection}`);
  }
} else if (envBindings.database) {
  console.error(
    "[mcp-studio] ⚠️ DATABASE binding found but MESH_URL or MESH_TOKEN missing",
  );
  console.error(
    "[mcp-studio]   Database operations will fail until ON_MCP_CONFIGURATION is called",
  );
}

// ============================================================================
// Database Connection via Mesh API
// ============================================================================

/**
 * Call a tool on a Mesh connection via the proxy API.
 * This allows STDIO MCPs to use bindings just like HTTP MCPs.
 */
async function callMeshTool<T = unknown>(
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!meshConfig) {
    throw new Error(
      "Database not configured. Configure bindings in Mesh UI first.",
    );
  }

  const endpoint = `${meshConfig.meshUrl}/mcp/${connectionId}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${meshConfig.meshToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mesh API error (${response.status}): ${text}`);
  }

  // Handle both JSON and SSE responses
  const contentType = response.headers.get("Content-Type") || "";
  let json: {
    result?: { structuredContent?: T; content?: { text: string }[] };
    error?: { message: string };
  };

  if (contentType.includes("text/event-stream")) {
    // Parse SSE response - extract JSON from data lines
    const text = await response.text();
    const lines = text.split("\n");
    const dataLines = lines.filter((line) => line.startsWith("data: "));
    const lastData = dataLines[dataLines.length - 1];
    if (!lastData) {
      throw new Error("Empty SSE response from Mesh API");
    }
    json = JSON.parse(lastData.slice(6)); // Remove "data: " prefix
  } else {
    json = await response.json();
  }

  if (json.error) {
    throw new Error(`Mesh tool error: ${json.error.message}`);
  }

  return (json.result?.structuredContent ??
    JSON.parse(json.result?.content?.[0]?.text ?? "null")) as T;
}

/**
 * Run SQL query via Mesh's database binding proxy.
 * Uses DATABASES_RUN_SQL tool on the configured database connection.
 */
async function runSQL<T = unknown>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!meshConfig) {
    throw new Error(
      "Database not configured. Configure bindings in Mesh UI first.",
    );
  }

  const result = await callMeshTool<{
    result: { results?: T[] }[];
  }>(meshConfig.databaseConnectionId, "DATABASES_RUN_SQL", {
    sql: query,
    params,
  });

  return result.result?.[0]?.results ?? [];
}

// ============================================================================
// Database Migrations
// ============================================================================

/**
 * Run migrations to ensure all tables exist.
 * This mirrors the `configuration.onChange` behavior from HTTP mode.
 */
async function runMigrations(): Promise<void> {
  console.error("[mcp-studio] Running migrations...");

  // workflow_collection table
  await runSQL(`
    CREATE TABLE IF NOT EXISTS workflow_collection (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      input JSONB,
      gateway_id TEXT NOT NULL,
      description TEXT,
      steps JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      updated_by TEXT
    )
  `);

  await runSQL(`
    CREATE INDEX IF NOT EXISTS idx_workflow_collection_created_at ON workflow_collection(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_collection_updated_at ON workflow_collection(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_collection_title ON workflow_collection(title);
  `);

  // workflow table
  await runSQL(`
    CREATE TABLE IF NOT EXISTS workflow (
      id TEXT PRIMARY KEY,
      workflow_collection_id TEXT,
      steps JSONB NOT NULL DEFAULT '{}',
      input JSONB,
      gateway_id TEXT NOT NULL,
      created_at_epoch_ms BIGINT NOT NULL,
      created_by TEXT
    )
  `);

  await runSQL(`
    CREATE INDEX IF NOT EXISTS idx_workflow_created_at_epoch ON workflow(created_at_epoch_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_collection_id ON workflow(workflow_collection_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_gateway_id ON workflow(gateway_id);
  `);

  // workflow_execution table
  await runSQL(`
    CREATE TABLE IF NOT EXISTS workflow_execution (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('enqueued', 'cancelled', 'success', 'error', 'running')),
      input JSONB,
      output JSONB,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now())*1000)::bigint,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now())*1000)::bigint,
      start_at_epoch_ms BIGINT,
      started_at_epoch_ms BIGINT,
      completed_at_epoch_ms BIGINT,
      timeout_ms BIGINT,
      deadline_at_epoch_ms BIGINT,
      error JSONB,
      created_by TEXT
    )
  `);

  await runSQL(`
    CREATE INDEX IF NOT EXISTS idx_workflow_execution_status ON workflow_execution(status);
    CREATE INDEX IF NOT EXISTS idx_workflow_execution_created_at ON workflow_execution(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_execution_start_at ON workflow_execution(start_at_epoch_ms);
  `);

  // workflow_execution_step_result table
  await runSQL(`
    CREATE TABLE IF NOT EXISTS workflow_execution_step_result (
      execution_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      started_at_epoch_ms BIGINT,
      completed_at_epoch_ms BIGINT,
      output JSONB,
      error JSONB,
      PRIMARY KEY (execution_id, step_id),
      FOREIGN KEY (execution_id) REFERENCES workflow_execution(id)
    )
  `);

  await runSQL(`
    CREATE INDEX IF NOT EXISTS idx_workflow_execution_step_result_execution ON workflow_execution_step_result(execution_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_execution_step_result_started ON workflow_execution_step_result(started_at_epoch_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_execution_step_result_completed ON workflow_execution_step_result(completed_at_epoch_ms DESC);
  `);

  // assistants table
  await runSQL(`
    CREATE TABLE IF NOT EXISTS assistants (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      updated_by TEXT,
      description TEXT NOT NULL,
      instructions TEXT NOT NULL,
      tool_set JSONB NOT NULL DEFAULT '{}',
      avatar TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      gateway_id TEXT NOT NULL DEFAULT '',
      model JSONB NOT NULL DEFAULT '{"id":"","connectionId":""}'::jsonb
    )
  `);

  await runSQL(`
    CREATE INDEX IF NOT EXISTS idx_assistants_created_at ON assistants(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_assistants_updated_at ON assistants(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_assistants_title ON assistants(title);
  `);

  // prompts table
  await runSQL(`
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      updated_by TEXT,
      description TEXT,
      arguments JSONB NOT NULL DEFAULT '[]',
      icons JSONB NOT NULL DEFAULT '[]',
      messages JSONB NOT NULL DEFAULT '[]'
    )
  `);

  await runSQL(`
    CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompts_updated_at ON prompts(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompts_title ON prompts(title);
  `);

  console.error("[mcp-studio] Migrations complete");
}

// ============================================================================
// Tool Logging
// ============================================================================

function logTool(name: string, args: Record<string, unknown>) {
  const argStr = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)?.slice(0, 50)}`)
    .join(" ");
  console.error(`[mcp-studio] ${name}${argStr ? ` ${argStr}` : ""}`);
}

function withLogging<T extends Record<string, unknown>>(
  toolName: string,
  handler: (args: T) => Promise<CallToolResult>,
): (args: T) => Promise<CallToolResult> {
  return async (args: T) => {
    logTool(toolName, args as Record<string, unknown>);
    return handler(args);
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

export async function registerStdioTools(server: McpServer): Promise<void> {
  // =========================================================================
  // Initialize Filesystem Workflow Loading (if configured)
  // =========================================================================

  const filesystemMode = isFilesystemMode();
  if (filesystemMode) {
    console.error("[mcp-studio] Filesystem workflow mode enabled");
    await loadWorkflows();

    // Start watching for changes
    const source = getWorkflowSource();
    if (source.workflowDir) {
      await startWatching({
        ...source,
        watch: true,
        onChange: (workflows) => {
          console.error(
            `[mcp-studio] Workflows reloaded: ${workflows.length} workflow(s)`,
          );
        },
      });
    }
  }

  // =========================================================================
  // Run Migrations at Startup (if we have meshConfig from env vars)
  // =========================================================================

  if (meshConfig && !migrationsRan) {
    try {
      await runMigrations();
      migrationsRan = true;
      console.error(
        "[mcp-studio] ✅ Migrations completed at startup via Mesh API",
      );
    } catch (error) {
      console.error("[mcp-studio] ⚠️ Migration error at startup:", error);
      // Don't fail startup, let tools fail gracefully if needed
    }
  }

  // =========================================================================
  // MCP Configuration Tools (for Mesh bindings UI)
  // =========================================================================

  server.registerTool(
    "MCP_CONFIGURATION",
    {
      title: "MCP Configuration",
      description:
        "Returns the configuration schema for this MCP server. Used by Mesh to show the bindings UI.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    withLogging("MCP_CONFIGURATION", async () => {
      // Use Zod v4's built-in JSON schema conversion
      const rawStateSchema = z.toJSONSchema(StdioStateSchema);

      // Inject binding tool definitions for tool-based connection matching
      const stateSchema = injectBindingSchema(
        rawStateSchema as Record<string, unknown>,
      );

      const result = {
        stateSchema,
        scopes: [
          "DATABASE::DATABASES_RUN_SQL",
          "EVENT_BUS::*",
          "CONNECTION::*",
        ],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  // Binding schema for ON_MCP_CONFIGURATION input
  const BindingInputSchema = z
    .object({
      __type: z.string(),
      value: z.string(),
    })
    .optional();

  server.registerTool(
    "ON_MCP_CONFIGURATION",
    {
      title: "On MCP Configuration",
      description:
        "Called by Mesh when the user saves binding configuration. Applies the configured state and mesh credentials.",
      inputSchema: {
        state: z
          .object({
            DATABASE: BindingInputSchema,
            EVENT_BUS: BindingInputSchema,
            CONNECTION: BindingInputSchema,
          })
          .passthrough()
          .describe("The configured state from the bindings UI"),
        scopes: z.array(z.string()).describe("List of authorized scopes"),
        // Mesh credentials for STDIO connections to call back to Mesh API
        meshToken: z
          .string()
          .optional()
          .describe("JWT token for authenticating with Mesh API"),
        meshUrl: z
          .string()
          .optional()
          .describe("Base URL of the Mesh instance"),
      },
      annotations: { readOnlyHint: false },
    },
    withLogging("ON_MCP_CONFIGURATION", async (args) => {
      console.error("[mcp-studio] Received configuration");

      const state = args.state || {};
      const databaseConnectionId = state.DATABASE?.value;

      // Store mesh configuration if provided
      if (args.meshToken && args.meshUrl && databaseConnectionId) {
        meshConfig = {
          meshToken: args.meshToken,
          meshUrl: args.meshUrl,
          databaseConnectionId,
        };
        console.error(
          `[mcp-studio] Mesh binding configured: ${args.meshUrl} -> ${databaseConnectionId}`,
        );

        // Run migrations via Mesh API
        if (!migrationsRan) {
          try {
            await runMigrations();
            migrationsRan = true;
            console.error("[mcp-studio] Migrations completed via Mesh API");
          } catch (error) {
            console.error("[mcp-studio] Migration error:", error);
          }
        }
      } else if (databaseConnectionId) {
        console.error(
          `[mcp-studio] Database binding configured to: ${databaseConnectionId}`,
        );
        console.error(
          "[mcp-studio] Warning: No meshToken/meshUrl provided - database operations will fail",
        );
      }

      if (state.EVENT_BUS?.value) {
        console.error(
          `[mcp-studio] Event bus binding: ${state.EVENT_BUS.value}`,
        );
      }
      if (state.CONNECTION?.value) {
        console.error(
          `[mcp-studio] Connection binding: ${state.CONNECTION.value}`,
        );
      }

      const result = { success: true, configured: !!meshConfig };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }),
  );

  // =========================================================================
  // Workflow Collection Tools
  // =========================================================================

  server.registerTool(
    "COLLECTION_WORKFLOW_LIST",
    {
      title: "List Workflows",
      description: "List all workflows with optional pagination",
      inputSchema: {
        limit: z.number().default(50),
        offset: z.number().default(0),
        source: z
          .enum(["all", "filesystem", "database"])
          .default("all")
          .describe(
            "Filter by source: all (both), filesystem (from files), database (from PostgreSQL)",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("COLLECTION_WORKFLOW_LIST", async (args) => {
      const includeFilesystem =
        args.source === "all" || args.source === "filesystem";
      const includeDatabase =
        args.source === "all" || args.source === "database";

      let allItems: Record<string, unknown>[] = [];

      // Get filesystem workflows
      if (includeFilesystem && filesystemMode) {
        const fsWorkflows = getCachedWorkflows().map((w) => ({
          ...w,
          _source: "filesystem",
        }));
        allItems.push(...fsWorkflows);
      }

      // Get database workflows (only if we have mesh config)
      if (includeDatabase && meshConfig) {
        try {
          const dbItems = await runSQL<Record<string, unknown>>(
            "SELECT * FROM workflow_collection ORDER BY updated_at DESC",
            [],
          );
          const transformed = dbItems.map((item) => ({
            ...transformWorkflow(item),
            _source: "database",
          }));
          allItems.push(...transformed);
        } catch (error) {
          // Database not available, skip silently
          console.error(
            "[mcp-studio] Database query failed, using filesystem only",
          );
        }
      }

      // Apply pagination
      const totalCount = allItems.length;
      const paginatedItems = allItems.slice(
        args.offset,
        args.offset + args.limit,
      );

      const result = {
        items: paginatedItems,
        totalCount,
        hasMore: args.offset + paginatedItems.length < totalCount,
        mode: filesystemMode ? "filesystem" : "database",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_WORKFLOW_GET",
    {
      title: "Get Workflow",
      description: "Get a single workflow by ID",
      inputSchema: {
        id: z.string().describe("Workflow ID"),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("COLLECTION_WORKFLOW_GET", async (args) => {
      // Try filesystem first
      if (filesystemMode) {
        const fsWorkflow = getWorkflowById(args.id);
        if (fsWorkflow) {
          const result = {
            item: { ...fsWorkflow, _source: "filesystem" },
          };
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          };
        }
      }

      // Fall back to database
      if (meshConfig) {
        const items = await runSQL<Record<string, unknown>>(
          "SELECT * FROM workflow_collection WHERE id = ? LIMIT 1",
          [args.id],
        );

        const result = {
          item: items[0]
            ? { ...transformWorkflow(items[0]), _source: "database" }
            : null,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      }

      // No workflow found
      const result = { item: null };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_WORKFLOW_CREATE",
    {
      title: "Create Workflow",
      description: "Create a new workflow",
      inputSchema: {
        data: z.object({
          id: z.string().optional(),
          title: z.string(),
          description: z.string().optional(),
          steps: z.array(z.unknown()).optional(),
          gateway_id: z.string().optional(),
        }),
      },
      annotations: { readOnlyHint: false },
    },
    withLogging("COLLECTION_WORKFLOW_CREATE", async (args) => {
      const now = new Date().toISOString();
      const id = args.data.id || crypto.randomUUID();

      await runSQL(
        `INSERT INTO workflow_collection (id, title, description, steps, gateway_id, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          args.data.title,
          args.data.description || null,
          JSON.stringify(args.data.steps || []),
          args.data.gateway_id || "",
          now,
          now,
          "stdio-user",
          "stdio-user",
        ],
      );

      const items = await runSQL<Record<string, unknown>>(
        "SELECT * FROM workflow_collection WHERE id = ? LIMIT 1",
        [id],
      );

      const result = {
        item: items[0] ? transformWorkflow(items[0]) : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_WORKFLOW_UPDATE",
    {
      title: "Update Workflow",
      description: "Update an existing workflow",
      inputSchema: {
        id: z.string(),
        data: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          steps: z.array(z.unknown()).optional(),
        }),
      },
      annotations: { readOnlyHint: false },
    },
    withLogging("COLLECTION_WORKFLOW_UPDATE", async (args) => {
      const now = new Date().toISOString();
      const setClauses: string[] = ["updated_at = ?", "updated_by = ?"];
      const params: unknown[] = [now, "stdio-user"];

      if (args.data.title !== undefined) {
        setClauses.push("title = ?");
        params.push(args.data.title);
      }
      if (args.data.description !== undefined) {
        setClauses.push("description = ?");
        params.push(args.data.description);
      }
      if (args.data.steps !== undefined) {
        setClauses.push("steps = ?");
        params.push(JSON.stringify(args.data.steps));
      }

      params.push(args.id);

      await runSQL(
        `UPDATE workflow_collection SET ${setClauses.join(", ")} WHERE id = ?`,
        params,
      );

      const items = await runSQL<Record<string, unknown>>(
        "SELECT * FROM workflow_collection WHERE id = ? LIMIT 1",
        [args.id],
      );

      const result = {
        item: items[0] ? transformWorkflow(items[0]) : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_WORKFLOW_DELETE",
    {
      title: "Delete Workflow",
      description: "Delete a workflow by ID",
      inputSchema: {
        id: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    withLogging("COLLECTION_WORKFLOW_DELETE", async (args) => {
      const items = await runSQL<Record<string, unknown>>(
        "DELETE FROM workflow_collection WHERE id = ? RETURNING *",
        [args.id],
      );

      const result = {
        item: items[0] ? transformWorkflow(items[0]) : null,
        success: items.length > 0,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  // =========================================================================
  // Workflow Execution Tools
  // =========================================================================

  server.registerTool(
    "COLLECTION_WORKFLOW_EXECUTION_LIST",
    {
      title: "List Executions",
      description: "List workflow executions with pagination",
      inputSchema: {
        limit: z.number().default(50),
        offset: z.number().default(0),
        workflow_id: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("COLLECTION_WORKFLOW_EXECUTION_LIST", async (args) => {
      let sql =
        "SELECT * FROM workflow_execution ORDER BY created_at DESC LIMIT ? OFFSET ?";
      const params: unknown[] = [args.limit, args.offset];

      if (args.workflow_id) {
        sql =
          "SELECT * FROM workflow_execution WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?";
        params.unshift(args.workflow_id);
      }

      const items = await runSQL<Record<string, unknown>>(sql, params);

      let countSql = "SELECT COUNT(*) as count FROM workflow_execution";
      const countParams: unknown[] = [];

      if (args.workflow_id) {
        countSql =
          "SELECT COUNT(*) as count FROM workflow_execution WHERE workflow_id = ?";
        countParams.push(args.workflow_id);
      }

      const countResult = await runSQL<{ count: string }>(
        countSql,
        countParams,
      );
      const totalCount = parseInt(countResult[0]?.count || "0", 10);

      const result = {
        items: items.map(transformExecution),
        totalCount,
        hasMore: args.offset + items.length < totalCount,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_WORKFLOW_EXECUTION_GET",
    {
      title: "Get Execution",
      description: "Get a single workflow execution by ID with step results",
      inputSchema: {
        id: z.string().describe("Execution ID"),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("COLLECTION_WORKFLOW_EXECUTION_GET", async (args) => {
      const executions = await runSQL<Record<string, unknown>>(
        "SELECT * FROM workflow_execution WHERE id = ? LIMIT 1",
        [args.id],
      );

      const stepResults = await runSQL<Record<string, unknown>>(
        "SELECT * FROM workflow_execution_step_result WHERE execution_id = ? ORDER BY started_at_epoch_ms ASC",
        [args.id],
      );

      const result = {
        item: executions[0] ? transformExecution(executions[0]) : null,
        step_results: stepResults.map(transformStepResult),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  // =========================================================================
  // Assistant Collection Tools
  // =========================================================================

  server.registerTool(
    "COLLECTION_ASSISTANT_LIST",
    {
      title: "List Assistants",
      description: "List all assistants with pagination",
      inputSchema: {
        limit: z.number().default(50),
        offset: z.number().default(0),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("COLLECTION_ASSISTANT_LIST", async (args) => {
      const items = await runSQL<Record<string, unknown>>(
        "SELECT * FROM assistants ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        [args.limit, args.offset],
      );

      const countResult = await runSQL<{ count: string }>(
        "SELECT COUNT(*) as count FROM assistants",
      );
      const totalCount = parseInt(countResult[0]?.count || "0", 10);

      const result = {
        items: items.map(transformAssistant),
        totalCount,
        hasMore: args.offset + items.length < totalCount,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_ASSISTANT_GET",
    {
      title: "Get Assistant",
      description: "Get a single assistant by ID",
      inputSchema: {
        id: z.string().describe("Assistant ID"),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("COLLECTION_ASSISTANT_GET", async (args) => {
      const items = await runSQL<Record<string, unknown>>(
        "SELECT * FROM assistants WHERE id = ? LIMIT 1",
        [args.id],
      );

      const result = {
        item: items[0] ? transformAssistant(items[0]) : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_ASSISTANT_CREATE",
    {
      title: "Create Assistant",
      description: "Create a new assistant",
      inputSchema: {
        data: z.object({
          id: z.string().optional(),
          title: z.string(),
          description: z.string().optional(),
          avatar: z.string().optional(),
          system_prompt: z.string().optional(),
          gateway_id: z.string().optional(),
          model: z
            .object({
              id: z.string(),
              connectionId: z.string(),
            })
            .optional(),
        }),
      },
      annotations: { readOnlyHint: false },
    },
    withLogging("COLLECTION_ASSISTANT_CREATE", async (args) => {
      const now = new Date().toISOString();
      const id = args.data.id || crypto.randomUUID();
      const defaultAvatar =
        "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

      await runSQL(
        `INSERT INTO assistants (id, title, description, avatar, system_prompt, gateway_id, model, instructions, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          args.data.title,
          args.data.description || null,
          args.data.avatar || defaultAvatar,
          args.data.system_prompt || "",
          args.data.gateway_id || "",
          JSON.stringify(args.data.model || { id: "", connectionId: "" }),
          "", // instructions - default to empty string
          now,
          now,
          "stdio-user",
          "stdio-user",
        ],
      );

      const items = await runSQL<Record<string, unknown>>(
        "SELECT * FROM assistants WHERE id = ? LIMIT 1",
        [id],
      );

      const result = {
        item: items[0] ? transformAssistant(items[0]) : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_ASSISTANT_UPDATE",
    {
      title: "Update Assistant",
      description: "Update an existing assistant",
      inputSchema: {
        id: z.string(),
        data: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          avatar: z.string().optional(),
          system_prompt: z.string().optional(),
          gateway_id: z.string().optional(),
          model: z
            .object({
              id: z.string(),
              connectionId: z.string(),
            })
            .optional(),
        }),
      },
      annotations: { readOnlyHint: false },
    },
    withLogging("COLLECTION_ASSISTANT_UPDATE", async (args) => {
      const now = new Date().toISOString();
      const setClauses: string[] = ["updated_at = ?", "updated_by = ?"];
      const params: unknown[] = [now, "stdio-user"];

      if (args.data.title !== undefined) {
        setClauses.push("title = ?");
        params.push(args.data.title);
      }
      if (args.data.description !== undefined) {
        setClauses.push("description = ?");
        params.push(args.data.description);
      }
      if (args.data.avatar !== undefined) {
        setClauses.push("avatar = ?");
        params.push(args.data.avatar);
      }
      if (args.data.system_prompt !== undefined) {
        setClauses.push("system_prompt = ?");
        params.push(args.data.system_prompt);
      }
      if (args.data.gateway_id !== undefined) {
        setClauses.push("gateway_id = ?");
        params.push(args.data.gateway_id);
      }
      if (args.data.model !== undefined) {
        setClauses.push("model = ?");
        params.push(JSON.stringify(args.data.model));
      }

      params.push(args.id);

      await runSQL(
        `UPDATE assistants SET ${setClauses.join(", ")} WHERE id = ?`,
        params,
      );

      const items = await runSQL<Record<string, unknown>>(
        "SELECT * FROM assistants WHERE id = ? LIMIT 1",
        [args.id],
      );

      const result = {
        item: items[0] ? transformAssistant(items[0]) : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_ASSISTANT_DELETE",
    {
      title: "Delete Assistant",
      description: "Delete an assistant by ID",
      inputSchema: {
        id: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    withLogging("COLLECTION_ASSISTANT_DELETE", async (args) => {
      const items = await runSQL<Record<string, unknown>>(
        "DELETE FROM assistants WHERE id = ? RETURNING *",
        [args.id],
      );

      const result = {
        item: items[0] ? transformAssistant(items[0]) : null,
        success: items.length > 0,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  // =========================================================================
  // Prompt Collection Tools
  // =========================================================================

  server.registerTool(
    "COLLECTION_PROMPT_LIST",
    {
      title: "List Prompts",
      description: "List all prompts with pagination",
      inputSchema: {
        limit: z.number().default(50),
        offset: z.number().default(0),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("COLLECTION_PROMPT_LIST", async (args) => {
      const items = await runSQL<Record<string, unknown>>(
        "SELECT * FROM prompts ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        [args.limit, args.offset],
      );

      const countResult = await runSQL<{ count: string }>(
        "SELECT COUNT(*) as count FROM prompts",
      );
      const totalCount = parseInt(countResult[0]?.count || "0", 10);

      const result = {
        items: items.map(transformPrompt),
        totalCount,
        hasMore: args.offset + items.length < totalCount,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    "COLLECTION_PROMPT_GET",
    {
      title: "Get Prompt",
      description: "Get a single prompt by ID",
      inputSchema: {
        id: z.string().describe("Prompt ID"),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("COLLECTION_PROMPT_GET", async (args) => {
      const items = await runSQL<Record<string, unknown>>(
        "SELECT * FROM prompts WHERE id = ? LIMIT 1",
        [args.id],
      );

      const result = {
        item: items[0] ? transformPrompt(items[0]) : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }),
  );

  // =========================================================================
  // Filesystem Workflow Tools
  // =========================================================================

  if (filesystemMode) {
    server.registerTool(
      "WORKFLOW_RELOAD",
      {
        title: "Reload Workflows",
        description:
          "Reload all workflows from the filesystem. Use this after editing workflow JSON files.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      withLogging("WORKFLOW_RELOAD", async () => {
        const workflows = await loadWorkflows();

        const result = {
          success: true,
          count: workflows.length,
          workflows: workflows.map((w) => ({
            id: w.id,
            title: w.title,
            sourceFile: w._sourceFile,
            stepCount: w.steps.length,
          })),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      }),
    );

    server.registerTool(
      "WORKFLOW_SOURCE_INFO",
      {
        title: "Workflow Source Info",
        description:
          "Get information about where workflows are loaded from (filesystem paths, file counts)",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      withLogging("WORKFLOW_SOURCE_INFO", async () => {
        const source = getWorkflowSource();
        const workflows = getCachedWorkflows();

        // Group by source file
        const byFile = new Map<string, string[]>();
        for (const w of workflows) {
          const file = w._sourceFile;
          if (!byFile.has(file)) {
            byFile.set(file, []);
          }
          byFile.get(file)!.push(w.id);
        }

        const result = {
          mode: "filesystem",
          workflowDir: source.workflowDir || null,
          workflowFiles: source.workflowFiles || [],
          totalWorkflows: workflows.length,
          files: Array.from(byFile.entries()).map(([file, ids]) => ({
            path: file,
            workflows: ids,
          })),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      }),
    );
  }

  console.error("[mcp-studio] All stdio tools registered");
  if (filesystemMode) {
    console.error(
      "[mcp-studio] Filesystem mode: WORKFLOW_RELOAD and WORKFLOW_SOURCE_INFO available",
    );
  }
}

// ============================================================================
// Transform Functions
// ============================================================================

function transformWorkflow(row: Record<string, unknown>) {
  let steps: unknown[] = [];
  if (row.steps) {
    const parsed =
      typeof row.steps === "string" ? JSON.parse(row.steps) : row.steps;
    // Handle legacy { phases: [...] } format
    if (parsed && typeof parsed === "object" && "phases" in parsed) {
      steps = (parsed as { phases: unknown[] }).phases;
    } else if (Array.isArray(parsed)) {
      steps = parsed;
    }
  }

  // Ensure each step has required properties (action, name) to prevent UI crashes
  const normalizedSteps = steps.map((step, index) => {
    const s = step as Record<string, unknown>;
    return {
      name: s.name || `Step_${index + 1}`,
      description: s.description,
      action: s.action || { toolName: "" }, // Default to empty tool step if missing
      input: s.input || {},
      outputSchema: s.outputSchema || {},
      config: s.config,
    };
  });

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    steps: normalizedSteps,
    gateway_id: row.gateway_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
  };
}

function transformExecution(row: Record<string, unknown>) {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    status: row.status,
    input: typeof row.input === "string" ? JSON.parse(row.input) : row.input,
    output: row.output
      ? typeof row.output === "string"
        ? JSON.parse(row.output)
        : row.output
      : null,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

function transformStepResult(row: Record<string, unknown>) {
  return {
    id: row.id,
    execution_id: row.execution_id,
    step_name: row.step_name,
    status: row.status,
    input: row.input
      ? typeof row.input === "string"
        ? JSON.parse(row.input)
        : row.input
      : null,
    output: row.output
      ? typeof row.output === "string"
        ? JSON.parse(row.output)
        : row.output
      : null,
    error: row.error,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

function transformAssistant(row: Record<string, unknown>) {
  const defaultAvatar =
    "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";
  const model = row.model
    ? typeof row.model === "string"
      ? JSON.parse(row.model)
      : row.model
    : { id: "", connectionId: "" };

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    avatar: row.avatar || defaultAvatar,
    system_prompt: row.system_prompt || "",
    gateway_id: row.gateway_id || "",
    model,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
  };
}

function transformPrompt(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    content: row.content,
    variables: row.variables
      ? typeof row.variables === "string"
        ? JSON.parse(row.variables)
        : row.variables
      : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
  };
}
