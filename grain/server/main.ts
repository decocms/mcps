import {
  BindingOf,
  type BindingRegistry,
  type DefaultEnv,
  withRuntime,
} from "@decocms/runtime";
import z from "zod";

import { tools } from "./tools/index.ts";
import { GrainClient } from "./lib/grain-client.ts";
import type { WebhookPayload } from "./lib/types.ts";
import { ensureRecordingsTable, indexRecording } from "./lib/postgres.ts";

/**
 * State schema defining the required bindings
 */
export const StateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres"),
});

/**
 * Binding registry for type safety
 */
export interface Registry extends BindingRegistry {
  "@deco/postgres": [
    {
      name: "DATABASES_RUN_SQL";
      description: "Run a SQL query against the database";
      inputSchema: z.ZodType<{
        sql: string;
        params?: unknown[];
      }>;
      outputSchema: z.ZodType<{
        result: {
          results?: unknown[];
          success?: boolean;
        }[];
      }>;
    },
  ];
}

/**
 * Environment type combining Deco bindings
 * Includes DATABASE binding for indexing recordings
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://grain.com",

    // Generates the URL to redirect users to for authorization
    authorizationUrl: (callbackUrl) => {
      // For now, we'll use a simple API key collection flow
      // In the future, Grain may implement OAuth
      const url = new URL("https://grain.com/settings/api");
      url.searchParams.set("callback_url", callbackUrl);
      return url.toString();
    },

    exchangeCode: async ({ code }) => {
      return {
        access_token: code,
        token_type: "Bearer",
      };
    },
  },
  configuration: {
    onChange: async (env) => {
      try {
        await ensureRecordingsTable(env);

        const grainToken = env.MESH_REQUEST_CONTEXT?.token;
        const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
        const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;

        if (!grainToken || !meshUrl || !connectionId) {
          console.error("Missing required context for webhook setup:", {
            hasToken: !!grainToken,
            hasMeshUrl: !!meshUrl,
            hasConnectionId: !!connectionId,
          });
          return;
        }

        const grainClient = new GrainClient({ apiKey: grainToken });

        const webhookUrl = `${meshUrl}/events/grain_recording?sub=${connectionId}`;

        console.log("Setting up Grain webhook:", webhookUrl);

        const existingWebhooks = await grainClient.listWebhooks();
        const existingHookUrls =
          existingWebhooks.hooks?.map((hook) => hook.hook_url) || [];

        if (existingHookUrls.includes(webhookUrl)) {
          console.log("Webhook already exists for URL:", webhookUrl);
          return;
        }

        const webhook = await grainClient.createWebhook({
          hook_url: webhookUrl,
        });

        console.log("Webhook created successfully:", webhook.id);
      } catch (error) {
        console.error("Error setting up webhook:", error);
      }
    },
    scopes: ["DATABASE::DATABASES_RUN_SQL"],
    state: StateSchema,
  },
  tools,
});

/**
 * Event handler function for processing webhook events from Grain via the Mesh.
 * This is called when the Mesh routes a webhook event to this MCP.
 *
 * Grain sends a "recording_added" event when a new recording is available.
 */
export async function handleGrainEvent(env: Env, payload: WebhookPayload) {
  console.log("Received webhook event from Grain via Mesh:", {
    type: payload.type,
    user_id: payload.user_id,
    recording_id: payload.data.id,
  });

  // Index the recording in the database
  await indexRecording(env, payload);

  console.log("Recording indexed:", {
    id: payload.data.id,
    title: payload.data.title,
    source: payload.data.source,
    url: payload.data.url,
  });
}

export default runtime;
