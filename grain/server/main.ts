import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { GrainClient } from "./lib/grain-client.ts";
import type { WebhookPayload } from "./lib/types.ts";
import { ensureRecordingsTable, indexRecording } from "./lib/postgres.ts";
import type { Env, Registry } from "./types/env.ts";
import { StateSchema } from "./types/env.ts";

/**
 * Event names that this MCP handles
 */
export const GRAIN_EVENTS = ["grain_recording"];

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  events: {
    handlers: {
      events: GRAIN_EVENTS,
      handler: async ({ events }, env) => {
        try {
          console.log("[GRAIN_MCP] Handling events:", events.length);

          for (const event of events) {
            console.log("[GRAIN_MCP] Processing event:", {
              type: event.type,
              id: event.id,
            });

            // Parse the event payload
            const payload = event.data as WebhookPayload;

            // Index the recording in the database
            await indexRecording(env as unknown as Env, payload);

            console.log("[GRAIN_MCP] Recording indexed successfully:", {
              id: payload.data.id,
              title: payload.data.title,
              source: payload.data.source,
            });
          }

          return { success: true };
        } catch (error) {
          console.error("[GRAIN_MCP] Error handling events:", error);
          return { success: false, error: String(error) };
        }
      },
    },
  },
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
        await ensureRecordingsTable(env as unknown as Env);

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

serve(runtime.fetch);
