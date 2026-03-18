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

/**
 * Environment type combining Deco bindings with shared Registry
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;

export type { Registry };
