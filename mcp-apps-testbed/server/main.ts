#!/usr/bin/env bun
/**
 * MCP Apps Testbed Server
 *
 * A simple MCP server for testing MCP Apps (SEP-1865) in Mesh.
 * Uses stdio transport - no auth required.
 *
 * Usage:
 *   bun server/main.ts
 *
 * In Mesh, add as STDIO connection:
 *   Command: bun
 *   Args: /path/to/mcp-apps-testbed/server/main.ts
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { resources, getResourceHtml } from "./lib/resources.ts";

// Tool definitions with UI associations
const tools = [
  // Core widgets
  {
    name: "counter",
    description:
      "An interactive counter widget. Set an initial value and use the UI to adjust it.",
    inputSchema: {
      type: "object" as const,
      properties: {
        initialValue: {
          type: "number",
          default: 0,
          description: "Initial counter value",
        },
        label: {
          type: "string",
          default: "Counter",
          description: "Label for the counter",
        },
      },
    },
    _meta: { "ui/resourceUri": "ui://counter-app" },
  },
  {
    name: "show_metric",
    description: "Display a key metric with optional trend indicator.",
    inputSchema: {
      type: "object" as const,
      properties: {
        label: { type: "string", description: "Metric label" },
        value: { type: "number", description: "The metric value" },
        unit: {
          type: "string",
          description: "Unit of measurement (e.g., 'ms', 'GB', '$')",
        },
        trend: {
          type: "number",
          description: "Trend percentage (positive = up, negative = down)",
        },
        description: { type: "string", description: "Additional context" },
      },
      required: ["label", "value"],
    },
    _meta: { "ui/resourceUri": "ui://metric" },
  },
  {
    name: "show_progress",
    description: "Display a progress bar with label and percentage.",
    inputSchema: {
      type: "object" as const,
      properties: {
        label: {
          type: "string",
          default: "Progress",
          description: "Progress label",
        },
        value: { type: "number", description: "Current progress value" },
        total: { type: "number", default: 100, description: "Total/max value" },
      },
      required: ["value"],
    },
    _meta: { "ui/resourceUri": "ui://progress" },
  },
  // Additional tools
  {
    name: "greet",
    description:
      "Generate a personalized greeting displayed in an elegant card.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Name to greet" },
        message: { type: "string", description: "Optional custom message" },
      },
      required: ["name"],
    },
    _meta: { "ui/resourceUri": "ui://greeting-app" },
  },
  {
    name: "show_chart",
    description: "Display data as an animated bar chart.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", default: "Chart", description: "Chart title" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "number" },
            },
            required: ["label", "value"],
          },
          description: "Data points",
        },
      },
      required: ["data"],
    },
    _meta: { "ui/resourceUri": "ui://chart-app" },
  },
  // New widgets
  {
    name: "start_timer",
    description: "Display an interactive timer with start/pause controls.",
    inputSchema: {
      type: "object" as const,
      properties: {
        seconds: { type: "number", default: 0, description: "Initial seconds" },
        label: { type: "string", default: "Timer", description: "Timer label" },
      },
    },
    _meta: { "ui/resourceUri": "ui://timer" },
  },
  {
    name: "show_status",
    description: "Display a status badge with icon indicator.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Status text" },
        description: { type: "string", description: "Additional details" },
        type: {
          type: "string",
          enum: ["success", "warning", "error", "info"],
          default: "success",
        },
        timestamp: { type: "string", description: "Timestamp text" },
      },
      required: ["status"],
    },
    _meta: { "ui/resourceUri": "ui://status" },
  },
  {
    name: "show_quote",
    description: "Display a quote with attribution.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The quote text" },
        author: { type: "string", description: "Quote attribution" },
      },
      required: ["text"],
    },
    _meta: { "ui/resourceUri": "ui://quote" },
  },
  {
    name: "show_sparkline",
    description: "Display a compact trend chart with current value.",
    inputSchema: {
      type: "object" as const,
      properties: {
        label: { type: "string", description: "Metric label" },
        value: { type: "string", description: "Current value to display" },
        data: {
          type: "array",
          items: { type: "number" },
          description: "Array of values for the chart",
        },
        trend: { type: "number", description: "Trend percentage" },
      },
      required: ["value", "data"],
    },
    _meta: { "ui/resourceUri": "ui://sparkline" },
  },
  {
    name: "show_code",
    description: "Display a code snippet with syntax highlighting.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "The code to display" },
        language: {
          type: "string",
          default: "javascript",
          description: "Programming language",
        },
      },
      required: ["code"],
    },
    _meta: { "ui/resourceUri": "ui://code" },
  },
];

// Tool handlers
const toolHandlers: Record<
  string,
  (args: Record<string, unknown>) => {
    content: Array<{ type: string; text: string }>;
    _meta?: Record<string, unknown>;
  }
> = {
  // Core widgets
  counter: (args) => ({
    content: [
      {
        type: "text",
        text: `Counter "${args.label || "Counter"}" initialized at ${args.initialValue ?? 0}`,
      },
    ],
    _meta: { "ui/resourceUri": "ui://counter-app" },
  }),

  show_metric: (args) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          label: args.label,
          value: args.value,
          unit: args.unit,
          trend: args.trend,
        }),
      },
    ],
    _meta: { "ui/resourceUri": "ui://metric" },
  }),

  show_progress: (args) => ({
    content: [
      {
        type: "text",
        text: `Progress: ${args.value}/${args.total || 100} (${Math.round(((args.value as number) / ((args.total as number) || 100)) * 100)}%)`,
      },
    ],
    _meta: { "ui/resourceUri": "ui://progress" },
  }),

  // Additional widgets
  greet: (args) => ({
    content: [
      {
        type: "text",
        text: args.message
          ? `Hello ${args.name}! ${args.message}`
          : `Hello ${args.name}!`,
      },
    ],
    _meta: { "ui/resourceUri": "ui://greeting-app" },
  }),

  show_chart: (args) => ({
    content: [
      {
        type: "text",
        text: `Chart "${args.title ?? "Chart"}" with ${(args.data as Array<unknown>)?.length ?? 0} data points`,
      },
    ],
    _meta: { "ui/resourceUri": "ui://chart-app" },
  }),

  // New widget handlers
  start_timer: (args) => ({
    content: [
      { type: "text", text: `Timer started at ${args.seconds ?? 0} seconds` },
    ],
    _meta: { "ui/resourceUri": "ui://timer" },
  }),

  show_status: (args) => ({
    content: [
      {
        type: "text",
        text: `Status: ${args.status} (${args.type ?? "success"})`,
      },
    ],
    _meta: { "ui/resourceUri": "ui://status" },
  }),

  show_quote: (args) => ({
    content: [
      { type: "text", text: `"${args.text}" — ${args.author ?? "Unknown"}` },
    ],
    _meta: { "ui/resourceUri": "ui://quote" },
  }),

  show_sparkline: (args) => ({
    content: [
      { type: "text", text: `${args.label ?? "Value"}: ${args.value}` },
    ],
    _meta: { "ui/resourceUri": "ui://sparkline" },
  }),

  show_code: (args) => ({
    content: [
      {
        type: "text",
        text: `\`\`\`${args.language ?? "javascript"}\n${args.code}\n\`\`\``,
      },
    ],
    _meta: { "ui/resourceUri": "ui://code" },
  }),
};

async function main() {
  const server = new Server(
    { name: "mcp-apps-testbed", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  // Handle tools/list
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tools/call
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args ?? {});
  });

  // Handle resources/list
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources,
  }));

  // Handle resources/read
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const html = getResourceHtml(uri);
    if (!html) {
      throw new Error(`Resource not found: ${uri}`);
    }
    return {
      contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: html }],
    };
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[mcp-apps-testbed] MCP server running via stdio");
  console.error("[mcp-apps-testbed] 10 tools with interactive UI widgets");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
