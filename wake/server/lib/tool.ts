/**
 * Factory for Wake Storefront tools.
 *
 * Resolves the Storefront client from the per-request mesh context and hands a
 * ready-to-use GraphQL client to the handler. Every V1 tool is read-only, so
 * `readOnlyHint: true` is the default annotation.
 */
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { createStorefrontClient, type StorefrontClient } from "./storefront.ts";
import { type AdminClient, createAdminClient } from "./admin.ts";

/** MCP tool annotations (hints for clients about a tool's side effects). */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export function createWakeTool<
  TSchema extends z.ZodObject<z.ZodRawShape>,
>(config: {
  id: string;
  description: string;
  inputSchema: TSchema;
  /** Defaults to a read-only tool. */
  annotations?: ToolAnnotations;
  handler: (
    input: z.infer<TSchema>,
    client: StorefrontClient,
  ) => Promise<Record<string, unknown>>;
}) {
  return (_env: Env) =>
    createPrivateTool({
      id: config.id,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations ?? { readOnlyHint: true },
      execute: async ({ context, runtimeContext }) => {
        const env = runtimeContext.env as Env;
        const client = createStorefrontClient(env);
        return config.handler(context as z.infer<TSchema>, client);
      },
    });
}

/**
 * Factory for Wake **Admin** REST tools (orders / analytics). Resolves the
 * Admin REST client (api.fbits.net, Basic auth) from the per-request context.
 * Every admin tool here is read-only.
 */
export function createWakeAdminTool<
  TSchema extends z.ZodObject<z.ZodRawShape>,
>(config: {
  id: string;
  description: string;
  inputSchema: TSchema;
  annotations?: ToolAnnotations;
  handler: (
    input: z.infer<TSchema>,
    client: AdminClient,
  ) => Promise<Record<string, unknown>>;
}) {
  return (_env: Env) =>
    createPrivateTool({
      id: config.id,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations ?? { readOnlyHint: true },
      execute: async ({ context, runtimeContext }) => {
        const env = runtimeContext.env as Env;
        const client = createAdminClient(env);
        return config.handler(context as z.infer<TSchema>, client);
      },
    });
}
