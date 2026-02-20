/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTool } from "@decocms/runtime/tools";
import type { Client } from "@hey-api/client-fetch";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { createVtexClient, resolveCredentials } from "./client-factory.ts";

// ──────────────────────────────────────────────────────────────────────────────
// Schema introspection helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the schema is z.never() or z.optional(z.never()) —
 * the pattern hey-api emits when a request has no path/query/body.
 */
function isNeverLike(schema: any): boolean {
  if (schema instanceof z.ZodNever) return true;
  if (schema instanceof z.ZodOptional) {
    return schema.unwrap() instanceof z.ZodNever;
  }
  return false;
}

/** Unwrap one level of ZodOptional, leaving anything else unchanged. */
function unwrapOptional(schema: any): any {
  if (schema instanceof z.ZodOptional) return schema.unwrap();
  return schema;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public helpers (also exported for unit tests)
// ──────────────────────────────────────────────────────────────────────────────

export type RequestSubShape = {
  path?: any;
  query?: any;
  body?: any;
  headers?: any;
};

/**
 * Flatten a hey-api generated request schema into a single, flat z.object
 * suitable for use as a tool's `inputSchema`.
 *
 * The generated schema has the shape:
 *   { path: z.object({...}), query: z.optional(z.object({...})), body: ..., headers: ... }
 *
 * Rules:
 * - `path` fields → promoted to top-level (always required unless already optional)
 * - `query` fields → promoted to top-level (wrapped in z.optional if not already)
 * - `body` → if ZodObject, its fields are promoted to top-level;
 *            otherwise kept under a `body` key
 * - `headers` → skipped (handled by client-factory interceptors)
 */
export function flattenRequestSchema(
  schema: z.ZodObject<any>,
): z.ZodObject<any> {
  const shape = schema.shape as Record<string, any>;
  const flat: Record<string, any> = {};

  // ── Path params ──────────────────────────────────────────────────────────
  if (shape["path"] && !isNeverLike(shape["path"])) {
    const inner = unwrapOptional(shape["path"]);
    if (inner instanceof z.ZodObject) {
      for (const [key, val] of Object.entries(
        inner.shape as Record<string, any>,
      )) {
        flat[key] = val;
      }
    }
  }

  // ── Query params ─────────────────────────────────────────────────────────
  if (shape["query"] && !isNeverLike(shape["query"])) {
    const isOptionalWrapper = shape["query"] instanceof z.ZodOptional;
    const inner = unwrapOptional(shape["query"]);
    if (inner instanceof z.ZodObject) {
      for (const [key, val] of Object.entries(
        inner.shape as Record<string, any>,
      )) {
        const fieldIsOptional =
          val instanceof z.ZodOptional || val instanceof z.ZodDefault;
        flat[key] =
          isOptionalWrapper && !fieldIsOptional ? z.optional(val as any) : val;
      }
    }
  }

  // ── Body params ──────────────────────────────────────────────────────────
  if (shape["body"] && !isNeverLike(shape["body"])) {
    const isOptionalWrapper = shape["body"] instanceof z.ZodOptional;
    const inner = unwrapOptional(shape["body"]);
    if (inner instanceof z.ZodObject) {
      for (const [key, val] of Object.entries(
        inner.shape as Record<string, any>,
      )) {
        const fieldIsOptional =
          val instanceof z.ZodOptional || val instanceof z.ZodDefault;
        flat[key] =
          isOptionalWrapper && !fieldIsOptional ? z.optional(val as any) : val;
      }
    } else {
      // Non-object body (array, primitive) — keep under `body` key
      flat["body"] = shape["body"];
    }
  }

  return z.object(flat);
}

/**
 * Reconstruct the structured `{ path, query, body }` expected by the SDK
 * from the flat tool input.
 */
export function unflattenToStructured(
  flatInput: Record<string, unknown>,
  schema: z.ZodObject<any>,
): {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
} {
  const shape = schema.shape as Record<string, any>;
  const result: {
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
  } = {};

  // ── Path ─────────────────────────────────────────────────────────────────
  if (shape["path"] && !isNeverLike(shape["path"])) {
    const inner = unwrapOptional(shape["path"]);
    if (inner instanceof z.ZodObject) {
      const keys = Object.keys(inner.shape as Record<string, any>);
      const values: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in flatInput) values[key] = flatInput[key];
      }
      if (Object.keys(values).length > 0) result.path = values;
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────
  if (shape["query"] && !isNeverLike(shape["query"])) {
    const inner = unwrapOptional(shape["query"]);
    if (inner instanceof z.ZodObject) {
      const keys = Object.keys(inner.shape as Record<string, any>);
      const values: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in flatInput && flatInput[key] !== undefined) {
          values[key] = flatInput[key];
        }
      }
      if (Object.keys(values).length > 0) result.query = values;
    }
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  if (shape["body"] && !isNeverLike(shape["body"])) {
    const inner = unwrapOptional(shape["body"]);
    if (inner instanceof z.ZodObject) {
      const keys = Object.keys(inner.shape as Record<string, any>);
      const values: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in flatInput) values[key] = flatInput[key];
      }
      if (Object.keys(values).length > 0) result.body = values;
    } else if ("body" in flatInput) {
      result.body = flatInput["body"];
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Retry helper
// ──────────────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;

type SdkResult = { data?: unknown; error?: unknown };

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("socket") ||
      msg.includes("timeout") ||
      msg.includes("aborted") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("network") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}

function isRetryableHttpError(error: unknown): boolean {
  if (
    error !== null &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status;
    return status === 429 || status >= 500;
  }
  return false;
}

async function withRetry(fn: () => Promise<SdkResult>): Promise<SdkResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await fn();
    if (!result.error) return result;

    const err = result.error;
    const canRetry =
      attempt < MAX_RETRIES &&
      (isRetryableError(err) || isRetryableHttpError(err));
    if (!canRetry) return result;

    const delay =
      INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
    await new Promise<void>((res) => setTimeout(res, delay));
  }
  return { error: new Error("Max retries exceeded") };
}

// ──────────────────────────────────────────────────────────────────────────────
// createToolFromOperation
// ──────────────────────────────────────────────────────────────────────────────

export interface ToolFromOperationConfig {
  id: string;
  description: string;
  annotations?: ToolAnnotations;
  requestSchema: z.ZodObject<any>;
  /** Generated SDK function. Accepts options including `client` override. */
  sdkFn: (
    options: { client: Client } & Record<string, unknown>,
  ) => Promise<SdkResult>;
}

/**
 * Convert a hey-api generated Zod request schema + SDK function into a
 * `createTool` definition that the MCP runtime can register.
 */
export function createToolFromOperation(config: ToolFromOperationConfig) {
  const flatInput = flattenRequestSchema(config.requestSchema);

  return (env: Env) =>
    createTool({
      id: config.id,
      description: config.description,
      annotations: config.annotations,
      inputSchema: flatInput,
      execute: async ({ context }) => {
        const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT.state);
        const client = createVtexClient(creds);
        const structured = unflattenToStructured(
          context as Record<string, unknown>,
          config.requestSchema,
        );
        const result = await withRetry(() =>
          config.sdkFn({ client, ...structured } as any),
        );
        if (result.error) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : JSON.stringify(result.error),
          );
        }
        return Array.isArray(result.data)
          ? { items: result.data }
          : result.data;
      },
    });
}
