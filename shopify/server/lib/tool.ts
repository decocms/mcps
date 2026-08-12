/**
 * Factory for Shopify tools: resolves credentials from the mesh request
 * context, validates them, and delegates to the handler. Read tools are the
 * default (`readOnlyHint: true`); pass `annotations` to declare a write tool.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import {
  assertValidCredentials,
  type ResolvedCredentials,
  resolveCredentials,
} from "./client.ts";

/** MCP tool annotations (hints for clients about a tool's side effects). */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export function createShopifyTool<
  TSchema extends z.ZodObject<z.ZodRawShape>,
>(config: {
  id: string;
  description: string;
  inputSchema: TSchema;
  /** Defaults to a read-only tool; override for write/mutation tools. */
  annotations?: ToolAnnotations;
  handler: (
    input: z.infer<TSchema>,
    creds: ResolvedCredentials,
  ) => Promise<Record<string, unknown>>;
}) {
  return (_env: Env) =>
    createTool({
      id: config.id,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations ?? { readOnlyHint: true },
      execute: async ({ context, runtimeContext }) => {
        const env = runtimeContext.env as Env;
        const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT);
        assertValidCredentials(creds, config.id);
        return config.handler(context as z.infer<TSchema>, creds);
      },
    });
}

// ── Shared input schema fragments ────────────────────────────────────────────

export const paginationSchema = {
  first: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page (default 20, max 100)"),
  after: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous page's pageInfo.endCursor"),
};

export const searchQuerySchema = z
  .string()
  .optional()
  .describe(
    'Shopify search syntax filter, e.g. "status:active vendor:Nike" — see https://shopify.dev/docs/api/usage/search-syntax',
  );
