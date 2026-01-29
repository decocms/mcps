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
  configureLLM,
  configureContext,
  configureStreaming,
  configureWhisper,
  setBotUserId as setBotUserIdInHandler,
} from "./slack/handlers/eventHandler.ts";
import {
  saveConnectionConfig,
  updateConnectionSlackInfo,
  readConnectionConfig,
  ensureConnectionsTable,
  type ConnectionConfig,
} from "./lib/db-sql.ts";
import { cacheConnectionConfig } from "./lib/config-cache.ts";
import { logger } from "./lib/logger.ts";
import { setBotUserIdForConnection, app as webhookRouter } from "./router.ts";
import { setServerBaseUrl } from "./lib/serverConfig.ts";
import {
  getOrCreatePersistentApiKey,
  loadApiKeyFromKV,
} from "@decocms/mcps-shared/api-key-manager";
import { initializeKvStore } from "./lib/kv.ts";

export { StateSchema };

/**
 * Fetch agent's system_prompt from Mesh API via MCP protocol
 */
async function fetchAgentSystemPrompt(
  meshUrl: string,
  _organizationId: string,
  agentId: string,
  token: string,
): Promise<string | undefined> {
  try {
    // Use localhost for tunnel URLs (server-to-server communication)
    const isTunnel = meshUrl.includes(".deco.host");
    const effectiveMeshUrl = isTunnel ? "http://localhost:3000" : meshUrl;

    const response = await fetch(`${effectiveMeshUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "COLLECTION_VIRTUAL_MCP_GET",
          arguments: { id: agentId },
        },
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const result = (await response.json()) as {
      result?: {
        structuredContent?: {
          item?: { title?: string; system_prompt?: string };
        };
      };
    };
    const agent = result?.result?.structuredContent?.item;

    return agent?.system_prompt ?? undefined;
  } catch (_error) {
    return undefined;
  }
}

// Define onChange separately to ensure it's not undefined
const onChangeHandler = async (env: Env, config: any) => {
  try {
    // Use state from config callback (this is the correct source!)
    const state = config?.state ?? env.MESH_REQUEST_CONTEXT?.state;
    const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
    const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
    const temporaryToken = env.MESH_REQUEST_CONTEXT?.token;
    const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;

    // Get Slack credentials from state
    const botToken = state?.SLACK_CREDENTIALS?.BOT_TOKEN;
    const signingSecret = state?.SLACK_CREDENTIALS?.SIGNING_SECRET;

    // Get LLM configuration (bindings)
    // Note: MODEL_PROVIDER and AGENT may come empty, use LANGUAGE_MODEL.connectionId as fallback
    const modelProvider = state?.MODEL_PROVIDER;
    const agent = state?.AGENT;
    const languageModel = state?.LANGUAGE_MODEL;
    const whisper = state?.WHISPER;

    // Extract values with fallbacks - ensure string types
    const languageModelConnectionId = languageModel?.value?.connectionId;
    const modelProviderId: string | undefined =
      (typeof modelProvider?.value === "string"
        ? modelProvider.value
        : undefined) ||
      (typeof languageModelConnectionId === "string"
        ? languageModelConnectionId
        : undefined);
    const agentId: string | undefined =
      typeof agent?.value === "string" ? agent.value : undefined;

    // Get context configuration (with defaults from schema)
    const contextConfig = state?.CONTEXT_CONFIG;
    const maxMessagesBeforeSummary = contextConfig?.MAX_MESSAGES_BEFORE_SUMMARY;
    const recentMessagesToKeep = contextConfig?.RECENT_MESSAGES_TO_KEEP;
    const maxMessagesToFetch = contextConfig?.MAX_MESSAGES_TO_FETCH;
    const threadTimeoutMin = contextConfig?.THREAD_TIMEOUT_MIN ?? 10;

    // Get response configuration (with defaults)
    const showOnlyFinalResponse =
      state?.RESPONSE_CONFIG?.SHOW_ONLY_FINAL_RESPONSE ?? false;

    // If SHOW_ONLY_FINAL_RESPONSE is enabled, override other settings
    const enableStreaming = showOnlyFinalResponse
      ? false
      : (state?.RESPONSE_CONFIG?.ENABLE_STREAMING ?? true);
    const showThinkingMessage = showOnlyFinalResponse
      ? false
      : (state?.RESPONSE_CONFIG?.SHOW_THINKING_MESSAGE ?? true);

    // Configure server base URL for temp file serving
    // Priority: SERVER_PUBLIC_URL env var > WEBHOOK_URL from state > default
    const serverPublicUrl = process.env.SERVER_PUBLIC_URL;
    if (serverPublicUrl) {
      // Use environment variable (for local tunnel URLs like https://localhost-xxx.deco.host)
      setServerBaseUrl(serverPublicUrl);
    } else {
      // Extract base URL from webhook URL for production
      const webhookUrl = state?.WEBHOOK_URL;
      if (webhookUrl) {
        // e.g., "https://sites-slack-mcp.decocache.com/slack/events/{connectionId}"
        //    -> "https://sites-slack-mcp.decocache.com"
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

    // Get or create persistent API Key (to avoid 5-minute JWT expiration)
    // The temporary token from Mesh expires in 5 minutes, but Slack webhooks
    // can arrive at any time. We create a persistent API Key using the
    // temporary token, which can then be used for all subsequent LLM calls.
    let persistentToken = temporaryToken;
    if (temporaryToken) {
      // Try to load existing API key from database (survives restarts)
      let apiKey = await loadApiKeyFromKV(
        connectionId,
        async (id) => await readConnectionConfig(env, id),
      );

      // If not found in KV, create a new one
      if (!apiKey) {
        apiKey = await getOrCreatePersistentApiKey({
          meshUrl,
          organizationId,
          connectionId,
          temporaryToken,
        });
      }

      if (apiKey) {
        persistentToken = apiKey;
      }
    }

    // Fetch agent's system_prompt if agentId is set
    let systemPrompt: string | undefined;
    if (agentId && persistentToken) {
      systemPrompt = await fetchAgentSystemPrompt(
        meshUrl,
        organizationId,
        agentId,
        persistentToken,
      );
    }

    // Configure LLM if model provider is set
    if (modelProviderId && persistentToken) {
      configureLLM({
        meshUrl,
        organizationId,
        token: persistentToken,
        modelProviderId,
        modelId: languageModel?.value?.id,
        agentId,
        systemPrompt,
      });
    }

    // Configure Whisper for audio transcription if set
    if (whisper && persistentToken) {
      const whisperConnectionId =
        typeof whisper.value === "string" ? whisper.value : undefined;
      if (whisperConnectionId) {
        configureWhisper({
          meshUrl,
          organizationId,
          token: persistentToken,
          whisperConnectionId,
        });
      }
    }

    // Configure context settings (uses defaults if not provided)
    configureContext({
      maxMessagesBeforeSummary,
      recentMessagesToKeep,
      maxMessagesToFetch,
    });

    // Configure streaming behavior
    configureStreaming(enableStreaming);

    // Configure thread manager
    configureThreadManager({ timeoutMinutes: threadTimeoutMin });

    // Ensure database table exists (creates if not)
    try {
      await ensureConnectionsTable(env);
    } catch (_error) {
      // Don't return - try to save anyway
    }

    const configToSave: ConnectionConfig = {
      connectionId,
      organizationId,
      meshUrl,
      meshToken: persistentToken,
      modelProviderId,
      modelId: languageModel?.value?.id,
      agentId,
      systemPrompt,
      botToken,
      signingSecret,
      responseConfig: {
        showOnlyFinalResponse,
        enableStreaming,
        showThinkingMessage,
      },
    };

    await saveConnectionConfig(env, configToSave);

    // Cache config for webhook router (which runs outside MCP context)
    cacheConnectionConfig(configToSave);

    // Initialize Slack client to get additional info (teamId, botUserId, teamName)
    try {
      initializeSlackClient({ botToken });

      // Get bot info (includes teamId)
      const botInfo = await getBotInfo();
      // Get team info (includes workspace name)
      const teamInfo = await getTeamInfo();

      if (botInfo?.teamId || botInfo?.userId) {
        // Update connection with Slack API data
        await updateConnectionSlackInfo(
          env,
          connectionId,
          botInfo.teamId!,
          botInfo.userId!,
        );

        // Cache bot user ID for event filtering
        if (botInfo.userId) {
          setBotUserIdForConnection(connectionId, botInfo.userId);
          setBotUserIdInHandler(botInfo.userId);
        }
      }

      // Update with team name and connection name
      if (botInfo?.teamId || teamInfo?.name) {
        const connectionName = config.CONNECTION_NAME || undefined;
        const updatedConfig: ConnectionConfig = {
          ...configToSave,
          teamId: botInfo?.teamId,
          teamName: teamInfo?.name,
          connectionName,
        };
        await saveConnectionConfig(env, updatedConfig);
        cacheConnectionConfig(updatedConfig);
      }

      // Configure HyperDX logger with API key if provided
      if (config.HYPERDX_API_KEY) {
        logger.setApiKey(config.HYPERDX_API_KEY);
      }

      // Build webhook URL
      const webhookUrl = `https://slack-mcp.deco.cx/slack/events/${connectionId}`;

      // Log config received
      logger.info("Configuration received and saved", {
        connectionId,
        teamId: botInfo?.teamId ?? "unknown",
        teamName: (teamInfo?.name as any) ?? "unknown",
        botUserId: botInfo?.userId,
        webhookUrl,
      });
    } catch (error) {
      // Config is already saved, just log the error
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
    scopes: [
      "EVENT_BUS::*",
      "MODEL_PROVIDER::*",
      "DATABASE::DATABASES_RUN_SQL",
      "*",
    ],
    state: StateSchema,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: tools as any,
  prompts: [],
});

const PORT = process.env.PORT ?? 8080;

// Initialize KV store with disk persistence (used for thread data and config cache)
await initializeKvStore("./data/slack-kv.json");

/**
 * Warm-up: Sync DATABASE configs to cache on startup
 * Critical for K8s multi-pod deployments where new pods start with empty cache
 */
setTimeout(async () => {
  try {
    const port = process.env.PORT ?? 8080;
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "warmup",
        method: "tools/call",
        params: {
          name: "SYNC_CONFIG_CACHE",
          arguments: { force: false },
        },
      }),
    });

    if (!response.ok) {
      logger.warn("Cache sync failed on startup (will lazy-load)", {
        status: response.status.toString(),
      });
    }
  } catch (_error) {
    // Will lazy-load on first webhook
  }
}, 2000);

/**
 * Serve requests:
 * - Webhook routes handled by webhookRouter (/slack/events, /slack/commands, etc.)
 * - MCP requests handled by runtime
 */
serve(async (req, env, ctx) => {
  // Try webhook router first
  const webhookResponse = await webhookRouter.fetch(req, env, ctx);

  // If webhook router returned 404, fall back to MCP runtime
  if (webhookResponse.status === 404) {
    return runtime.fetch(req, env, ctx);
  }

  return webhookResponse;
});

logger.info("Slack MCP Server started", { route: `/mcp`, port: Number(PORT) });
