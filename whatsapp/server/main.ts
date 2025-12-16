/**
 * OpenRouter MCP Server
 *
 * This MCP provides tools for interacting with OpenRouter's API,
 * including model discovery, comparison, and AI chat completions.
 *
 * OpenRouter offers a unified API for accessing hundreds of AI models
 * with built-in fallback mechanisms, cost optimization, and provider routing.
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";

import { insertWebhookEvent, tools } from "./tools/index.ts";
import { WebhookPayload } from "./lib/whatsapp.ts";
import z from "zod";
import { type Env as DecoEnv } from "../../vibecoding-toolkit/shared/deco.gen.ts";

export const StateSchema = z.object({
  whatsAppBusinessAccountId: z.string(),
  whatsAppAccessToken: z.string(),
  DATABASE: z.object({
    value: z.string(),
    __type: z.literal("@deco/database").default("@deco/database"),
  }),
});

export type Env = DefaultEnv<typeof StateSchema> & DecoEnv;

export async function runSQL<T = unknown>(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const response = await env.DATABASE.DATABASES_RUN_SQL({
    sql,
    params,
  });
  return (response.result[0]?.results ?? []) as T[];
}

async function ensureWhatsAppWebhookEventsTable(env: Env) {
  const result = await runSQL(
    env,
    `
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  );
  console.log({ result });
}

let localEnv: Env;

const runtime = withRuntime<Env, typeof StateSchema>({
  tools,
  configuration: {
    state: StateSchema,
    scopes: ["DATABASE::DATABASES_RUN_SQL"],
    onChange: async (env) => {
      localEnv = env;
      try {
        console.log("onChange");
        await ensureWhatsAppWebhookEventsTable(env);
      } catch (error) {
        console.error(error);
      }
    },
  },
  bindings: [
    {
      type: "mcp",
      name: "DATABASE",
      app_name: "@deco/database",
    },
  ],
  fetch: async (req, env) => {
    if (req.url.includes("/webhook")) {
      try {
        return await handleWebhook(env, req);
      } catch (error) {
        console.error(error);
        return new Response("Error", { status: 500 });
      }
    }
    return new Response(null, { status: 204 });
  },
});

async function handleWebhook(env: Env, req: Request) {
  console.log(req);
  const challenge = new URL(req.url).searchParams.get("hub.challenge");
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  const body: WebhookPayload = await req.json();
  await insertWebhookEvent(localEnv, body);
  body.entry?.forEach((entry) => {
    entry.changes.forEach((change) => {
      change.value.messages?.forEach((message) => {
        console.log({ message });
      });
    });
  });
  return new Response("Webhook received", { status: 200 });
}

export default runtime;
