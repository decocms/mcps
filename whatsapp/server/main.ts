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
import { getWhatsappClient } from "./lib/whatsapp-client.ts";

const StateSchema = z.object({
  EVENT_BUS: BindingOf("@deco/event-bus"),
});

export type RuntimeEnv = DefaultEnv<typeof StateSchema, Registry>;

export const SUBSCRIBED_EVENT_TYPES = {
  OPERATOR_TEXT_COMPLETED: "public:operator.text.completed",
  OPERATOR_GENERATION_COMPLETED: "public:operator.generation.completed",
};

export const FIREABLE_EVENT_TYPES = {
  OPERATOR_GENERATE: "operator.generate",
};

const ALL_SUBSCRIBED_EVENT_TYPES = Object.values(SUBSCRIBED_EVENT_TYPES);

const LAZY_DEFAULT_PHONE_NUMBER_ID = "957005920822800"; // lmao

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
        handler: async ({ events }) => {
          for (const event of events) {
            if (event.type === SUBSCRIBED_EVENT_TYPES.OPERATOR_TEXT_COMPLETED) {
              try {
                const { text } = event.data as { text: string };
                const subject = event.subject;
                if (!subject) {
                  console.error("No subject found in event");
                  continue;
                }
                getWhatsappClient().sendTextMessage({
                  phoneNumberId:
                    env.PHONE_NUMBER_ID ?? LAZY_DEFAULT_PHONE_NUMBER_ID,
                  to: subject,
                  message: text,
                });
              } catch (error) {
                console.error("Error sending text message:", error);
              }
            }
          }
          return { success: true };
        },
        events: ALL_SUBSCRIBED_EVENT_TYPES,
      },
      SELF: {
        handler: async () => {
          return { success: true };
        },
        events: ALL_SUBSCRIBED_EVENT_TYPES,
      },
    },
  },
  configuration: {
    scopes: ["EVENT_BUS::*", "*"],
    state: StateSchema,
    onChange: async (env) => {
      const { organizationId, authorization } = env.MESH_REQUEST_CONTEXT;
      if (!organizationId) {
        console.error("No organizationId found");
        return;
      }
      if (!organizationId || !authorization) return;
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
