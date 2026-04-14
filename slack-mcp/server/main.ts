/**
 * Slack MCP Server - Main Entry Point
 *
 * MCP server for Slack bot integration with intelligent
 * thread management and AI agent commands.
 *
 * Multi-tenant architecture:
 * - Webhooks received at /slack/events/:connectionId
 * - Configs stored in KV store (connectionId -> config)
 * - Each Mesh connection maps to a Slack workspace
 * - Agent binding (AgentOf) resolved per-connection via env
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { tools } from "./tools/index.ts";
import { StateSchema, type Env } from "./types/env.ts";
import {
  initializeSlackClient,
  getBotInfo,
  getTeamInfo,
} from "./lib/slack-client.ts";
import { configureThreadManager } from "./lib/thread.ts";
import {
  configureContext,
  setBotUserId as setBotUserIdInHandler,
} from "./slack/handlers/eventHandler.ts";
import {
  cacheConnectionConfig,
  type ConnectionConfig,
} from "./lib/config-cache.ts";
import { logger } from "./lib/logger.ts";
import { setBotUserIdForConnection, app as webhookRouter } from "./router.ts";
import { setServerBaseUrl } from "./lib/serverConfig.ts";
import { getOrCreateInstance } from "./connection-instance.ts";
import { initializeKvStore } from "./lib/kv.ts";
import { initializeRedisStore, isRedisInitialized } from "./lib/redis-store.ts";
import {
  isSupabaseConfigured,
  getSupabaseClient,
} from "./lib/supabase-client.ts";
import { getCachedConnectionConfig } from "./lib/config-cache.ts";
import { initializeConfigCacheCount } from "./lib/config-cache.ts";
import { loadAllTriggerCredentials } from "./lib/supabase-client.ts";

export { StateSchema };

/**
 * Create a persistent Mesh API key via the /mcp/self endpoint.
 * Returns the key string or null on failure.
 */
async function generateMeshApiKey(
  meshUrl: string,
  sessionToken: string,
  connectionId: string,
): Promise<string | null> {
  const response = await fetch(`${meshUrl}/mcp/self`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "API_KEY_CREATE",
        arguments: {
          name: `Slack Bot - ${connectionId}`,
          permissions: {
            self: ["*"],
            [`conn_${connectionId}`]: ["*"],
          },
          metadata: {
            createdFor: "slack-mcp",
            connectionId,
          },
        },
      },
      id: Date.now(),
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    error?: { message: string };
    result?: {
      structuredContent?: { key?: string };
      content?: Array<{ type: string; text: string }>;
    };
  };

  if (data.error) return null;

  const result =
    data.result?.structuredContent ||
    (data.result?.content?.[0]?.text
      ? (JSON.parse(data.result.content[0].text) as { key?: string })
      : null);

  return result?.key ?? null;
}

const onChangeHandler = async (env: Env, config: any) => {
  try {
    const state = config?.state ?? env.MESH_REQUEST_CONTEXT?.state;
    const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
    const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
    const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
    const organizationSlug = (env.MESH_REQUEST_CONTEXT as any)
      ?.organizationSlug as string | undefined;
    const meshToken = env.MESH_REQUEST_CONTEXT?.token;

    // Get agent ID from raw config (before binding resolution)
    const rawAgent = config?.state?.AGENT as
      | { id?: string; value?: string }
      | undefined;
    // Also check resolved state (proxy may have id/value from config)
    const resolvedAgent = state?.AGENT as
      | { id?: string; value?: string }
      | undefined;
    const agentId =
      rawAgent?.value ??
      rawAgent?.id ??
      resolvedAgent?.value ??
      resolvedAgent?.id;
    if (agentId) {
      console.log(`[onChange] Agent ID: ${agentId}`);
    }

    // Get Slack credentials from state
    const botToken = state?.SLACK_CREDENTIALS?.BOT_TOKEN;
    const signingSecret = state?.SLACK_CREDENTIALS?.SIGNING_SECRET;

    // Get context configuration (with defaults from schema)
    const contextConfig = state?.CONTEXT_CONFIG;
    const threadTimeoutMin = contextConfig?.THREAD_TIMEOUT_MIN ?? 10;

    // Get response configuration (with defaults)
    const showOnlyFinalResponse =
      state?.RESPONSE_CONFIG?.SHOW_ONLY_FINAL_RESPONSE ?? false;
    const enableStreaming = showOnlyFinalResponse
      ? false
      : (state?.RESPONSE_CONFIG?.ENABLE_STREAMING ?? true);
    const showThinkingMessage = showOnlyFinalResponse
      ? false
      : (state?.RESPONSE_CONFIG?.SHOW_THINKING_MESSAGE ?? true);

    // Configure server base URL for temp file serving
    const serverPublicUrl = process.env.SERVER_PUBLIC_URL;
    if (serverPublicUrl) {
      setServerBaseUrl(serverPublicUrl);
    } else {
      const webhookUrl = state?.WEBHOOK_URL;
      if (webhookUrl) {
        const baseUrl = webhookUrl.split("/slack/events")[0];
        setServerBaseUrl(baseUrl);
      }
    }

    // Validate required fields
    if (
      !botToken ||
      !signingSecret ||
      !meshUrl ||
      !organizationId ||
      !connectionId
    ) {
      logger.warn("Missing required fields in configuration", {
        connectionId: connectionId ?? "unknown",
        hasBotToken: !!botToken,
        hasSigningSecret: !!signingSecret,
        hasMeshUrl: !!meshUrl,
      });
      return;
    }

    // Store env per-connection (critical for webhook access to AgentOf())
    const instance = getOrCreateInstance(connectionId, env);
    instance.env = env;

    // Configure context settings
    configureContext({
      maxMessagesBeforeSummary: contextConfig?.MAX_MESSAGES_BEFORE_SUMMARY,
      recentMessagesToKeep: contextConfig?.RECENT_MESSAGES_TO_KEEP,
      maxMessagesToFetch: contextConfig?.MAX_MESSAGES_TO_FETCH,
    });

    // Configure thread manager
    configureThreadManager({ timeoutMinutes: threadTimeoutMin });

    const configToSave: ConnectionConfig = {
      connectionId,
      organizationId,
      organizationSlug,
      meshUrl,
      meshToken,
      agentId,
      botToken,
      signingSecret,
      responseConfig: {
        showOnlyFinalResponse,
        enableStreaming,
        showThinkingMessage,
      },
    };

    // Save config to KV store (persists to disk)
    await cacheConnectionConfig(configToSave);

    // Generate persistent API key if we don't have one yet
    // (session token expires in ~5min, API key never expires)
    if (meshToken && meshUrl && connectionId) {
      const existing = await getCachedConnectionConfig(connectionId);
      if (!existing?.meshApiKey) {
        try {
          const apiKey = await generateMeshApiKey(
            meshUrl,
            meshToken,
            connectionId,
          );
          if (apiKey) {
            configToSave.meshApiKey = apiKey;
            await cacheConnectionConfig(configToSave);
            console.log(
              `[onChange] Generated persistent API key for ${connectionId}`,
            );
          }
        } catch (error) {
          console.log(`[onChange] Could not generate API key: ${error}`);
        }
      } else {
        configToSave.meshApiKey = existing.meshApiKey;
        await cacheConnectionConfig(configToSave);
      }
    }

    // Initialize Slack client to get additional info (teamId, botUserId, teamName)
    try {
      initializeSlackClient({ botToken });

      const botInfo = await getBotInfo();
      const teamInfo = await getTeamInfo();

      if (botInfo?.userId) {
        instance.botUserId = botInfo.userId;
        setBotUserIdForConnection(connectionId, botInfo.userId);
        setBotUserIdInHandler(botInfo.userId);
      }

      const connectionName = config.CONNECTION_NAME || undefined;
      const updatedConfig: ConnectionConfig = {
        ...configToSave,
        teamId: botInfo?.teamId,
        teamName: teamInfo?.name,
        botUserId: botInfo?.userId,
        connectionName,
      };
      await cacheConnectionConfig(updatedConfig);
    } catch (error) {
      await logger.error("Failed to get Slack info", {
        error: String(error),
      });
    }
  } catch (error) {
    logger.error("Fatal error in onChange handler", {
      error: String(error),
      connectionId: env.MESH_REQUEST_CONTEXT?.connectionId,
    });
    throw error;
  }
};

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    onChange: onChangeHandler,
    scopes: ["*"],
    state: StateSchema,
  },
  tools: tools as any,
  prompts: [],
});

const PORT = process.env.PORT ?? 8080;

// ============================================================================
// Initialize Storage Layer for Config Persistence
// ============================================================================

if (isSupabaseConfigured()) {
  try {
    console.log("[Supabase] Initializing client...");
    const client = getSupabaseClient();
    if (client) {
      console.log(
        "[Storage] Using Supabase for config persistence (multi-pod ready)",
      );
    } else {
      console.log(
        "[Supabase] Client initialization failed, falling back to Redis/KV",
      );
    }
  } catch (error) {
    console.error("[Supabase] Initialization error:", error);
    console.log("[Supabase] Falling back to Redis/KV...");
  }
}

const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  try {
    console.log("[Redis] Initializing from environment variables...");
    await initializeRedisStore({
      url: redisUrl,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB) : 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || "slack-mcp:",
      ttlSeconds: process.env.REDIS_TTL_SECONDS
        ? Number.parseInt(process.env.REDIS_TTL_SECONDS)
        : undefined,
    });
    console.log("[Redis] Initialized successfully from environment");
    if (!isSupabaseConfigured()) {
      console.log(
        "[Storage] Using Redis for config persistence (multi-pod ready)",
      );
    }
  } catch (error) {
    console.error("[Redis] Failed to initialize from environment:", error);
    console.log("[Redis] Falling back to KV Store...");
  }
}

await initializeKvStore("./data/slack-kv.json");

if (!isSupabaseConfigured() && !isRedisInitialized()) {
  console.log(
    "[Storage] Using KV Store for config persistence (single-pod/dev)",
  );
}

await initializeConfigCacheCount();

// Bootstrap trigger credentials from Supabase
if (isSupabaseConfigured()) {
  try {
    const allCreds = await loadAllTriggerCredentials();
    for (const { connectionId, state } of allCreds) {
      console.log(
        `[BOOTSTRAP] Trigger credentials found for ${connectionId}: ${state.activeTriggerTypes.length} type(s)`,
      );
    }
    console.log(
      `[BOOTSTRAP] Loaded trigger credentials for ${allCreds.length} connections`,
    );
  } catch (error) {
    console.error("[BOOTSTRAP] Failed to load trigger credentials:", error);
  }
}

serve(async (req, env, ctx) => {
  const webhookResponse = await webhookRouter.fetch(req, env, ctx);

  if (webhookResponse.status === 404) {
    return runtime.fetch(req, env, ctx);
  }

  return webhookResponse;
});

logger.info("Slack MCP Server started", { route: `/mcp`, port: Number(PORT) });
