/**
 * Environment Type Definitions for GitHub MCP
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * State schema — no user-configurable options needed.
 * The upstream URL is always https://api.githubcopilot.com/mcp/.
 */
export const StateSchema = z.object({});

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

/**
 * Environment type combining Deco bindings with shared Registry + Workers
 * bindings. INSTALLATIONS is the KV namespace used for two prefixes:
 *   - `installation:*` — GitHub installation id → Mesh connection id
 *   - `triggers:*`     — connection id → trigger subscription state
 *
 * GitHub secrets arrive via `wrangler secret put` and are exposed through
 * `process.env` under `nodejs_compat`.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry> & {
  INSTALLATIONS?: KVNamespace;
  GITHUB_APP_ID?: string;
  GITHUB_PRIVATE_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_WEBHOOK_SECRET?: string;
};

export type { Registry };
