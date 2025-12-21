/**
 * WhatsApp MCP Server
 *
 * This MCP provides tools for interacting with the WhatsApp Business API,
 * including phone number management and webhook handling.
 *
 * It publishes incoming WhatsApp webhooks as CloudEvents to the event bus,
 * allowing other MCPs to subscribe and react to WhatsApp messages.
 */
import { BindingOf, type DefaultEnv, withRuntime } from "@decocms/runtime";
import { type EventBusBindingClient } from "@decocms/bindings";

import { tools } from "./tools/index.ts";
import type { WebhookPayload } from "./lib/types.ts";
import z from "zod";
import { handleChallenge, handleWebhook } from "./webhook.ts";
import { handleTextMessageEvent } from "./events.ts";

export const StateSchema = z.object({
  whatsAppBusinessAccountId: z.string(),
  whatsAppAccessToken: z.string(),
  EVENT_BUS: BindingOf("@deco/event-bus"),
});

export type Env = DefaultEnv<typeof StateSchema> & {
  EVENT_BUS: EventBusBindingClient;
};

const runtime = withRuntime<Env, typeof StateSchema>({
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
  configuration: {
    state: StateSchema,
    scopes: ["EVENT_BUS::*"],
  },
  /**
   * Custom fetch handler for Meta webhook verification and incoming webhooks
   */
  fetch: async (req, env) => {
    const url = new URL(req.url);
    if (url.pathname === "/webhook") {
      if (req.method === "GET") {
        return handleChallenge(req);
      }

      if (req.method === "POST") {
        return handleWebhook(req, env as unknown as Env);
      }
    }

    // Return 404 for unhandled routes
    return new Response("Not found", { status: 404 });
  },
});

export default runtime;
