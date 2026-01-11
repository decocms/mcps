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
import { handleWebhook, setSenderConfig, handleChallenge } from "./webhook.ts";
import { handleTextMessageEvent } from "./events.ts";
import { z } from "zod";
import type { Registry } from "@decocms/mcps-shared/registry";
import { tools } from "./tools/index.ts";
import { getRedisClient } from "./lib/kv.ts";

const StateSchema = z.object({
  EVENT_BUS: BindingOf("@deco/event-bus"),
});

export type Env = DefaultEnv<typeof StateSchema, Registry> & {
  META_ACCESS_KEY: string;
  META_BUSINESS_ACCOUNT_ID: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
};

const SELF_URL = process.env.SELF_URL ?? "http://localhost:8003";

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  tools,
  oauth: {
    mode: "PKCE",
    authorizationServer: "http://wa.me",
    authorizationUrl: (callbackUrl: string) => {
      const url = new URL(SELF_URL + "/oauth/custom");
      url.searchParams.set("callback_url", callbackUrl);
      return url.toString();
    },
    exchangeCode: async ({ code }) => {
      return { access_token: code, token_type: "Bearer" };
    },
  },
  events: {
    handlers: {
      EVENT_BUS: {
        handler: async ({ events }, env) => {
          for (const event of events) {
            if (event.type === "public:waba.text.message") {
              handleTextMessageEvent(
                env as unknown as Env,
                event as { data: WebhookPayload; type: string },
              );
            }
          }
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
      await setSenderConfig(authorization, {
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
  const url = new URL(req.url);
  // Handle Meta webhook verification and incoming webhooks
  if (url.pathname === "/webhook") {
    if (req.method === "POST") {
      const payload = (await req.json()) as WebhookPayload;
      handleWebhook(payload, env as Env).catch(console.error);
      return new Response("OK", { status: 200 });
    }

    if (req.method === "GET") {
      return handleChallenge(req);
    }
  }

  if (url.pathname === "/oauth/custom") {
    return handleOAuthCustom(req);
  }

  // Delegate all other routes (including MCP protocol) to runtime
  return runtime.fetch(req, env, ctx);
});

const PHONE_NUMBER = "552139550877";

async function setCallbackUrl(code: string, callbackUrl: string) {
  const redis = getRedisClient();
  await redis.set(`whatsapp:callback_url:${code}`, callbackUrl, {
    ex: 120,
  });
}

async function handleOAuthCustom(req: Request) {
  const callbackUrl = new URL(req.url).searchParams.get("callback_url");
  const randomId = Math.floor(100000 + Math.random() * 900000).toString();
  if (!callbackUrl) {
    return Response.json(
      { error: "A callback URL is required" },
      { status: 400 },
    );
  }
  await setCallbackUrl(randomId, callbackUrl);
  return Response.redirect(
    new URL(
      `https://wa.me/${PHONE_NUMBER}?text=[VERIFY_CODE]:${randomId}`,
    ).toString(),
  );
}
