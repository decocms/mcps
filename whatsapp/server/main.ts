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

import { env } from "./env.ts";
import { app } from "./router.ts";

import {
  saveSenderConfig,
  readAndDeleteAuthToken,
  saveAccessToken,
  readPhoneFromAccessToken,
} from "./lib/data.ts";
import { getWhatsappClient } from "@decocms/mcps-shared/whatsapp";
import { generateResponseForEvent, ThreadMessage } from "./llm.ts";

export const whatsappClient = getWhatsappClient({
  accessToken: env.META_ACCESS_KEY,
  businessAccountId: env.META_BUSINESS_ACCOUNT_ID,
});

const StateSchema = z.object({
  EVENT_BUS: BindingOf("@deco/event-bus"),
  MODEL_PROVIDER: BindingOf("@deco/llm"),
  LANGUAGE_MODEL: z.object({
    __type: z.literal("@deco/language-model"),
    value: z
      .object({
        id: z.string().optional(),
      })
      .loose()
      .describe("The language model to be used."),
  }),
});

export type RuntimeEnv = DefaultEnv<typeof StateSchema, Registry>;

export const SUBSCRIBED_EVENT_TYPES = {
  OPERATOR_TEXT_COMPLETED: "operator.text.completed",
  OPERATOR_GENERATE: "public:operator.generate",
};

export const FIREABLE_EVENT_TYPES = {
  OPERATOR_GENERATE: "operator.generate",
};

const ALL_SUBSCRIBED_EVENT_TYPES = Object.values(SUBSCRIBED_EVENT_TYPES);

export const LAZY_DEFAULT_PHONE_NUMBER_ID = "957005920822800"; // lmao

const mcpRuntime = withRuntime<RuntimeEnv, typeof StateSchema, Registry>({
  tools: [],
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

      await whatsappClient.sendTextMessage({
        phoneNumberId: env.PHONE_NUMBER_ID ?? LAZY_DEFAULT_PHONE_NUMBER_ID,
        to: phone,
        message:
          "Successfully authenticated. Finish your setup in the connection's settings by selecting all EVENT_BUS, MODEL_PROVIDER, and LANGUAGE_MODEL bindings.",
      });

      return { access_token: accessToken, token_type: "Bearer" };
    },
  },
  events: {
    handlers: {
      EVENT_BUS: {
        handler: async ({ events }, runtimeEnv) => {
          for (const event of events) {
            if (event.type === SUBSCRIBED_EVENT_TYPES.OPERATOR_GENERATE) {
              const { messages, threadId } = event.data as {
                messages: ThreadMessage[];
                threadId: string;
              };
              if (!messages) {
                console.error("[Mesh Operator] No messages found in event");
                continue;
              }
              const subject = event.subject ?? crypto.randomUUID();
              generateResponseForEvent(runtimeEnv, messages, threadId, subject);
            }
          }
          return { success: true };
        },
        events: ALL_SUBSCRIBED_EVENT_TYPES,
      },
      SELF: {
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
                whatsappClient.sendTextMessage({
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
    },
  },
  configuration: {
    scopes: ["EVENT_BUS::*", "*"],
    state: StateSchema,
    onChange: async (runtimeEnv) => {
      try {
        const { organizationId, authorization, ensureAuthenticated } =
          runtimeEnv.MESH_REQUEST_CONTEXT;
        if (!organizationId) {
          console.error("No organizationId found");
          return;
        }
        const authenticated = ensureAuthenticated();
        const userId = authenticated?.id;
        if (!userId) {
          console.error("No userId found");
          return;
        }

        if (!authorization) {
          console.error("No authorization found");
          return;
        }
        const phone = await readPhoneFromAccessToken(authorization);
        if (!phone) return;
        await saveSenderConfig(phone, {
          userId,
          organizationId,
          complete: true,
          callbackUrl: null,
        });
        await whatsappClient.sendTextMessage({
          phoneNumberId: env.PHONE_NUMBER_ID ?? LAZY_DEFAULT_PHONE_NUMBER_ID,
          to: phone,
          message:
            "Saved settings. Selected model: " +
            runtimeEnv.MESH_REQUEST_CONTEXT.state.LANGUAGE_MODEL?.value?.id,
        });
      } catch (error) {
        console.error("Error saving sender config:", error);
      }
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
