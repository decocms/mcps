import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const HELLO_RESOURCE_URI = "ui://mcp-app/hello";

export const helloInputSchema = z.object({
  name: z.string().optional().describe("The name to greet"),
});

export type HelloInput = z.infer<typeof helloInputSchema>;

export const helloOutputSchema = z.object({
  greeting: z.string(),
  timestamp: z.string(),
});

export type HelloOutput = z.infer<typeof helloOutputSchema>;

export const helloTool = (_env: Env) =>
  createTool({
    id: "hello_world",
    description:
      "Say hello! Takes a name and returns a friendly greeting. Use this to test that the MCP server and MCP App UI are working.",
    inputSchema: helloInputSchema,
    outputSchema: helloOutputSchema,
    _meta: { ui: { resourceUri: HELLO_RESOURCE_URI } },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async ({ context }) => {
      const { name } = context;
      const displayName = name || "World";
      return {
        greeting: `Hello, ${displayName}! Welcome to MCP Apps on deco.`,
        timestamp: new Date().toISOString(),
      };
    },
  });
