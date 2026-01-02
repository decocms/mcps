import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { Scopes } from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";
import { GrainClient } from "./lib/grain-client.ts";
import type { WebhookPayload } from "./lib/types.ts";
import { ensureRecordingsTable, indexRecording } from "./lib/postgres.ts";

/**
 * Environment type combining Deco bindings
 * Includes DATABASE binding for indexing recordings
 */
export type Env = DefaultEnv & {
  DATABASE?: {
    DATABASES_RUN_SQL: (params: {
      sql: string;
      params: unknown[];
    }) => Promise<{ result: Array<{ results: unknown[] }> }>;
  };
};

const runtime = withRuntime<Env>({
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
        if (env.DATABASE) {
          await ensureRecordingsTable(env);
        } else {
          console.warn(
            "DATABASE binding not available - skipping table creation",
          );
        }

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
    scopes: [Scopes.DATABASE.DATABASES_RUN_SQL],
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
