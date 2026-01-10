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
import type { WebhookPayload } from "./lib/types.ts";
import { handleChallenge, handleWebhook } from "./webhook.ts";
import { handleTextMessageEvent } from "./events.ts";

export type Env = DefaultEnv & {
  META_BUSINESS_ACCOUNT_ID: string;
  META_ACCESS_KEY: string;
};

const runtime = withRuntime<Env>({
  tools,
  events: {
    handlers: {
      handler: async ({ events }, env) => {
        for (const event of events) {
          handleTextMessageEvent(
            env as unknown as Env,
            event as { data: WebhookPayload; type: string },
          );
        }
        return { success: true };
      },
      events: ["waba.text.message"],
    },
  },
});

/**
 * Wrapped fetch handler that intercepts webhook routes
 * and delegates MCP requests to the runtime
 */
serve(async (req, env, ctx) => {
  const url = new URL(req.url);

  // Handle Meta webhook verification and incoming webhooks
  if (url.pathname === "/webhook") {
    if (req.method === "GET") {
      return handleChallenge(req);
    }

    if (req.method === "POST") {
      return handleWebhook(req, env as Env);
    }
  }

  // Delegate all other routes (including MCP protocol) to runtime
  return runtime.fetch(req, env, ctx);
});
