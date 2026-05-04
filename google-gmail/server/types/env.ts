/**
 * Environment Type Definitions for Gmail MCP
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * No user-configurable options. Auth flows through Google OAuth and the
 * bearer token rides in via MESH_REQUEST_CONTEXT.authorization on every call.
 */
export const StateSchema = z.object({});

/**
 * Gmail secrets arrive via `wrangler secret put` and are exposed through
 * `process.env` under `nodejs_compat`. EMAIL_MAP is the Workers KV
 * namespace bound in wrangler.toml; it stores three prefixes:
 *   - `email:<addr>`     → connectionId
 *   - `conn:<connId>`    → email address (reverse index)
 *   - `triggers:<connId>` → trigger subscription state
 */
export type Env = DefaultEnv<typeof StateSchema, Registry> & {
  EMAIL_MAP?: KVNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GMAIL_WEBHOOK_SECRET?: string;
  GMAIL_PUBSUB_TOPIC?: string;
};

export type { Registry };
