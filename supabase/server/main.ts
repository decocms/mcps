/**
 * Supabase MCP Server
 *
 * This is the main entry point for the Supabase MCP server.
 * It provides generic database operations for Supabase, designed to be
 * used as a binding by other MCPs for data persistence.
 */
import { z } from "zod";
import { serve } from "@decocms/mcps-shared/serve";
import {
  withRuntime,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";

import { tools } from "./tools/index.ts";

/**
 * State schema for Supabase configuration.
 * Users fill these values when installing the MCP.
 */
export const StateSchema = z.object({
  supabaseUrl: z
    .string()
    .url()
    .describe("Supabase project URL (e.g., https://xxx.supabase.co)"),
  supabaseKey: z
    .string()
    .describe("Supabase API key (service role key or anon key)"),
});

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 */
export type Env = DefaultEnv<typeof StateSchema, BindingRegistry>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    scopes: [],
    state: StateSchema,
  },
  tools,
});

serve(runtime.fetch);
