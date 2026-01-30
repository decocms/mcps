/**
 * WhatsApp MCP Server
 *
 * This MCP provides tools for interacting with the WhatsApp Business API,
 * including phone number management and webhook handling.
 *
 * It publishes incoming WhatsApp webhooks as CloudEvents to the event bus,
 * allowing other MCPs to subscribe and react to WhatsApp messages.
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "./tools/index.ts";
import { z } from "zod";

const StateSchema = z.object({
  META_ACCESS_KEY: z.string(),
  META_BUSINESS_ACCOUNT_ID: z.string(),
});

export type Env = DefaultEnv<typeof StateSchema>;

const mcpRuntime = withRuntime<Env, typeof StateSchema>({
  tools,
  prompts: [],
  configuration: {
    state: StateSchema,
  },
});

/**
 * Wrapped fetch handler that intercepts webhook routes
 * and delegates MCP requests to the runtime
 */
serve(async (req, env, ctx) => {
  return mcpRuntime.fetch(req, env, ctx);
});
