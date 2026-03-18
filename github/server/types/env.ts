/**
 * Environment Type Definitions for GitHub MCP
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  EVENT_BUS: BindingOf("@deco/event-bus"),
});

/**
 * Environment type combining Deco bindings with shared Registry
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;

export type { Registry };
