import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { GrainClient } from "./lib/grain-client.ts";
import { INDEX_INCLUDE, INDEXED_HOOK_TYPES } from "./constants.ts";
import { getGrainApiKey } from "./lib/env.ts";
import { WebhookPayloadSchema } from "./lib/types.ts";
import type { RecordingDetails } from "./lib/types.ts";
import { indexRecording } from "./db/queries.ts";
import { publishRecordingTrigger } from "./triggers/publisher.ts";
import type { Env } from "./types/env.ts";
import { StateSchema } from "./types/env.ts";

const DEVELOPMENT_WEBHOOK_BASE_URL = "https://localhost-c056dce8.deco.host";
const WEBHOOK_PUBLIC_PATH = "/webhooks/grain";

let cachedGrainClient: GrainClient | null = null;

function buildWebhookUrl(baseUrl: string, connectionId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${WEBHOOK_PUBLIC_PATH}/${connectionId}`;
}

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    onChange: async (env) => {
      try {
        const grainToken = getGrainApiKey(env);
        const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
        const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;

        cachedGrainClient = new GrainClient({ apiKey: grainToken });

        if (!meshUrl || !connectionId) {
          console.error("[GRAIN_MCP] Missing meshUrl or connectionId");
          return;
        }

        const isDev = process.env.DEVELOPMENT_MODE === "true";
        const devOverride = process.env.DEVELOPMENT_WEBHOOK_URL;
        const webhookUrl =
          isDev && devOverride
            ? devOverride
            : buildWebhookUrl(
                isDev ? DEVELOPMENT_WEBHOOK_BASE_URL : meshUrl,
                connectionId,
              );

        console.log("[GRAIN_MCP] Setting up webhook", {
          webhookUrl,
          isDevelopmentMode: isDev,
        });

        const { hooks } = await cachedGrainClient.listHooks();

        // Our hooks pointing somewhere else (old mesh URL, dev tunnel): drop them.
        const staleHooks = hooks.filter(
          (h) =>
            h.hook_url.includes(WEBHOOK_PUBLIC_PATH) &&
            h.hook_url !== webhookUrl,
        );
        await Promise.all(
          staleHooks.map((stale) =>
            cachedGrainClient!.deleteHook(stale.id).then(() =>
              console.log("[GRAIN_MCP] Deleted stale webhook", {
                hookId: stale.id,
                url: stale.hook_url,
              }),
            ),
          ),
        );

        // v2 hooks are one per type; make sure each indexed type has one.
        for (const hookType of INDEXED_HOOK_TYPES) {
          if (
            hooks.some(
              (h) =>
                h.hook_url === webhookUrl &&
                h.hook_type === hookType &&
                h.enabled,
            )
          )
            continue;
          const hook = await cachedGrainClient.createHook(
            webhookUrl,
            hookType,
            INDEX_INCLUDE,
          );
          console.log("[GRAIN_MCP] Hook created", {
            hookId: hook.id,
            hookType,
          });
        }
      } catch (error) {
        console.error("[GRAIN_MCP] Error setting up webhook", error);
      }
    },
    state: StateSchema,
  },
  tools,
});

/**
 * The client for webhook deliveries: the one from the last configuration, or
 * GRAIN_API_KEY after a restart (onChange only runs when the connection is
 * saved, so an in-memory client alone loses every webhook after a redeploy).
 */
function webhookClient(): GrainClient | null {
  if (cachedGrainClient) return cachedGrainClient;
  const key = process.env.GRAIN_API_KEY;
  return key ? (cachedGrainClient = new GrainClient({ apiKey: key })) : null;
}

/**
 * Re-reads the recording from Grain. Webhooks are not signed, so the payload
 * only names *which* recording changed; what gets indexed comes from the API.
 */
async function fetchRecording(
  recordingId: string,
): Promise<RecordingDetails | null> {
  const client = webhookClient();
  if (!client) {
    console.warn("[GRAIN_MCP] No Grain client (set GRAIN_API_KEY), skipping");
    return null;
  }
  try {
    return await client.getRecording(recordingId, INDEX_INCLUDE);
  } catch (err) {
    console.warn("[GRAIN_MCP] Failed to fetch recording, not indexing", {
      recordingId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function handleWebhookPost(
  body: string,
  connectionId: string,
): Promise<Response> {
  if (!body || body.trim() === "" || body.trim() === "{}") {
    return new Response("ok", { status: 200 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return new Response("ok", { status: 200 });
  }

  const parsed = WebhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    console.warn("[GRAIN_MCP] Webhook validation failed", {
      error: parsed.error.format(),
      type: (json as Record<string, unknown>)?.type,
    });
    return new Response("ok", { status: 200 });
  }

  const payload = parsed.data;
  console.log("[GRAIN_MCP] Received webhook", {
    type: payload.type,
    recordingId: payload.data.id,
  });

  if (
    payload.type === "recording_added" ||
    payload.type === "recording_updated"
  ) {
    try {
      const details = await fetchRecording(payload.data.id);
      if (!details) return new Response("ok", { status: 200 });

      await indexRecording({ payload, details });

      console.log("[GRAIN_MCP] Recording indexed", {
        id: payload.data.id,
        participants: details?.participants?.length ?? 0,
        hasTags: (details?.tags?.length ?? 0) > 0,
        hasNotes: !!details?.intelligence_notes_md,
      });

      publishRecordingTrigger(connectionId, payload.type, details, payload);
    } catch (indexError) {
      console.error("[GRAIN_MCP] Failed to index recording", indexError);
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

serve(async (request, env, ctx) => {
  const url = new URL(request.url);

  if (url.pathname.startsWith(`${WEBHOOK_PUBLIC_PATH}/`)) {
    const connectionId = url.pathname.slice(`${WEBHOOK_PUBLIC_PATH}/`.length);
    if (!connectionId) {
      return new Response("Missing connection id", { status: 400 });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return new Response("ok", { status: 200 });
    }

    if (request.method === "POST") {
      const body = await request.text();
      return handleWebhookPost(body, connectionId);
    }

    return new Response("Method not allowed", { status: 405 });
  }

  return runtime.fetch(request, env, ctx);
});
