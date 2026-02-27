import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { GrainClient } from "./lib/grain-client.ts";
import { getGrainApiKey } from "./lib/env.ts";
import { WebhookPayloadSchema } from "./lib/types.ts";
import type { RecordingDetails } from "./lib/types.ts";
import { indexRecording } from "./db/queries.ts";
import { publishMeshEvent } from "./lib/events.ts";
import type { Env } from "./types/env.ts";
import { StateSchema } from "./types/env.ts";

const DEVELOPMENT_WEBHOOK_BASE_URL = "https://localhost-c056dce8.deco.host";
const WEBHOOK_PUBLIC_PATH = "/webhooks/grain";

let cachedGrainClient: GrainClient | null = null;
let cachedMeshUrl: string | undefined;

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
        cachedMeshUrl = meshUrl;

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
        if (hooks.some((h) => h.hook_url === webhookUrl)) {
          console.log("[GRAIN_MCP] Webhook already registered");
          return;
        }

        const { views } = await cachedGrainClient.listViews();
        if (views.length === 0) {
          console.error(
            "[GRAIN_MCP] No views found. Create at least one recordings view in Grain.",
          );
          return;
        }

        const viewId = views[0].id;
        console.log("[GRAIN_MCP] Using view for hook", {
          viewId,
          viewName: views[0].name,
        });

        const hook = await cachedGrainClient.createHook(webhookUrl, viewId, [
          "added",
        ]);
        console.log("[GRAIN_MCP] Hook created", { hookId: hook.id });
      } catch (error) {
        console.error("[GRAIN_MCP] Error setting up webhook", error);
      }
    },
    state: StateSchema,
  },
  tools,
});

async function enrichRecording(
  recordingId: string,
): Promise<RecordingDetails | null> {
  if (!cachedGrainClient) {
    console.warn("[GRAIN_MCP] No cached client, skipping enrichment");
    return null;
  }

  try {
    return await cachedGrainClient.getRecording(recordingId, {
      include_highlights: true,
      include_participants: true,
      include_owners: true,
      intelligence_notes_format: "md",
    });
  } catch (err) {
    console.warn(
      "[GRAIN_MCP] Failed to enrich recording, indexing basic data",
      {
        recordingId,
        error: err instanceof Error ? err.message : String(err),
      },
    );
    return null;
  }
}

async function handleWebhookPost(body: string): Promise<Response> {
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
    console.warn("[GRAIN_MCP] Non-recording webhook event, acknowledging", {
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
      const details = await enrichRecording(payload.data.id);

      await indexRecording({ payload, details });

      console.log("[GRAIN_MCP] Recording indexed", {
        id: payload.data.id,
        enriched: details !== null,
        participants: details?.participants?.length ?? 0,
        hasTags: (details?.tags?.length ?? 0) > 0,
        hasNotes: !!details?.intelligence_notes_md,
      });

      if (cachedMeshUrl) {
        await publishMeshEvent(cachedMeshUrl, "grain.recording_indexed", {
          recordingId: payload.data.id,
          title: details?.title ?? payload.data.title ?? "",
          indexedAt: new Date().toISOString(),
        });
      }
    } catch (indexError) {
      console.error("[GRAIN_MCP] Failed to index recording", indexError);
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

serve(async (request) => {
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
      return handleWebhookPost(body);
    }

    return new Response("Method not allowed", { status: 405 });
  }

  return runtime.fetch(request, { ...process.env } as Env, {});
});
