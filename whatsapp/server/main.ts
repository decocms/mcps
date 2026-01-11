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
import { serve } from "@decocms/mcps-shared/serve";
import type { WebhookPayload } from "./lib/types.ts";
import { handleTextMessageEvent } from "./events.ts";
import { z } from "zod";
import type { Registry } from "@decocms/mcps-shared/registry";
import { tools } from "./tools/index.ts";

import { env } from "./env.ts";
import { app } from "./router.ts";

import {
  saveSenderConfig,
  readAndDeleteAuthToken,
  saveAccessToken,
  readPhoneFromAccessToken,
} from "./lib/data.ts";

const StateSchema = z.object({
  EVENT_BUS: BindingOf("@deco/event-bus"),
  LLM: BindingOf("@deco/llm"),
  AGENT_ID: z
    .string()
    .describe(
      "The ID of the agent that will attend when you message DecoCMS on WhatsApp",
    ),
});

export type RuntimeEnv = DefaultEnv<typeof StateSchema, Registry>;

const mcpRuntime = withRuntime<RuntimeEnv, typeof StateSchema, Registry>({
  tools,
  oauth: {
    mode: "PKCE",
    authorizationServer: "http://wa.me",
    authorizationUrl: (callbackUrl: string) => {
      const url = new URL(env.SELF_URL);
      url.pathname = "/oauth/custom";
      url.searchParams.set("callback_url", callbackUrl);
      return url.toString();
    },
    exchangeCode: async ({ code }) => {
      // code is now the auth_token, not the phone number
      const phone = await readAndDeleteAuthToken(code);
      if (!phone) {
        throw new Error("Invalid or expired auth token");
      }

      // Generate opaque access token
      const accessToken = crypto.randomUUID();
      await saveAccessToken(accessToken, phone);

      return { access_token: accessToken, token_type: "Bearer" };
    },
  },
  events: {
    handlers: {
      EVENT_BUS: {
        handler: async ({ events }, runtimeEnv) => {
          await Promise.all(
            events.map(async (event) => {
              if (event.type === "public:waba.text.message") {
                await handleTextMessageEvent(
                  runtimeEnv,
                  event as { data: WebhookPayload; type: string },
                );
              }
            }),
          );
          return { success: true };
        },
        events: ["public:waba.text.message"],
      },
      SELF: {
        handler: async () => {
          return { success: true };
        },
        events: ["public:waba.text.message"],
      },
    },
  },
  configuration: {
    scopes: ["EVENT_BUS::*", "*"],
    state: StateSchema,
    onChange: async (env) => {
      const { organizationId, authorization } = env.MESH_REQUEST_CONTEXT;
      if (!organizationId || !authorization) return;

      // authorization is now the opaque access_token, resolve to phone
      const phone = await readPhoneFromAccessToken(authorization);
      if (!phone) return;

      await saveSenderConfig(phone, {
        organizationId,
        complete: true,
        callbackUrl: null,
      });
    },
  },
});

/**
 * Wrapped fetch handler that intercepts webhook routes
 * and delegates MCP requests to the runtime
 */
serve(async (req, env, ctx) => {
  const response = await app.fetch(req, env, ctx);
  if (response.status === 404) {
    return mcpRuntime.fetch(req, env, ctx);
  }
  return response;
});
