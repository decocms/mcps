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
import { initializeSlackClient, getBotInfo } from "./lib/slack-client.ts";
import { configureThreadManager } from "./lib/thread.ts";
import {
  configureLLM,
  configureContext,
  configureStreaming,
  setBotUserId as setBotUserIdInHandler,
} from "./slack/handlers/eventHandler.ts";
import { saveConnectionConfig, updateConnectionSlackInfo } from "./lib/data.ts";
import { configureLogger, logger } from "./lib/logger.ts";
import { setBotUserIdForConnection, app as webhookRouter } from "./router.ts";

export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    onChange: async (env) => {
      console.log("[CONFIG] Configuration changed");

      const state = env.MESH_REQUEST_CONTEXT?.state;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      const token = env.MESH_REQUEST_CONTEXT?.token;

      // Use slug for API calls (falls back to id for backwards compatibility)
      // Type assertion needed as organizationSlug is a new Mesh feature
      const meshContext = env.MESH_REQUEST_CONTEXT as
        | (typeof env.MESH_REQUEST_CONTEXT & { organizationSlug?: string })
        | undefined;
      const organizationId =
        meshContext?.organizationSlug ?? meshContext?.organizationId;

      // Get Slack credentials
      const botToken = state?.SLACK_CREDENTIALS?.BOT_TOKEN;
      const signingSecret = state?.SLACK_CREDENTIALS?.SIGNING_SECRET;

      // Get channel configuration
      const logChannelId = state?.CHANNEL_CONFIG?.LOG_CHANNEL_ID;

      // Get LLM configuration (bindings)
      const modelProvider = state?.MODEL_PROVIDER;
      const agent = state?.AGENT as
        | {
            __type?: string;
            value?: string;
          }
        | undefined;
      const languageModel = state?.LANGUAGE_MODEL;

      // Get context configuration (with defaults from schema)
      const contextConfig = state?.CONTEXT_CONFIG;
      const maxMessagesBeforeSummary =
        contextConfig?.MAX_MESSAGES_BEFORE_SUMMARY;
      const recentMessagesToKeep = contextConfig?.RECENT_MESSAGES_TO_KEEP;
      const maxMessagesToFetch = contextConfig?.MAX_MESSAGES_TO_FETCH;
      const threadTimeoutMin = contextConfig?.THREAD_TIMEOUT_MIN ?? 10;

      // Get response configuration (with defaults)
      const enableStreaming = state?.RESPONSE_CONFIG?.ENABLE_STREAMING ?? true;

      console.log("[CONFIG] meshUrl:", meshUrl);
      console.log("[CONFIG] organizationId:", organizationId);
      console.log("[CONFIG] connectionId:", connectionId);
      console.log("[CONFIG] botToken exists:", !!botToken);
      console.log("[CONFIG] signingSecret exists:", !!signingSecret);
      console.log("[CONFIG] logChannelId:", logChannelId ?? "not configured");
      console.log(
        "[CONFIG] modelProvider:",
        modelProvider?.value ?? "not configured",
      );
      console.log(
        "[CONFIG] agent:",
        agent?.value ?? "not configured (system_prompt comes from gateway)",
      );
      console.log(
        "[CONFIG] languageModel:",
        languageModel?.value?.id ?? "not configured",
      );

      if (
        !botToken ||
        !signingSecret ||
        !meshUrl ||
        !organizationId ||
        !connectionId
      ) {
        console.log("[CONFIG] Missing required configuration, waiting...");
        return;
      }

      // Configure LLM if model provider is set
      if (modelProvider?.value && token) {
        configureLLM({
          meshUrl,
          organizationId,
          token,
          modelProviderId: modelProvider.value,
          modelId: languageModel?.value?.id,
          agentId: agent?.value,
        });
        console.log("[CONFIG] ✅ LLM configured for direct calls");
      } else {
        console.log(
          "[CONFIG] ⚠️ LLM not configured - will use Event Bus fallback",
        );
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

      // Save connection configuration (primary key: connectionId)
      await saveConnectionConfig(connectionId, {
        organizationId,
        meshUrl,
        botToken,
        signingSecret,
      });

      console.log(`[CONFIG] ✅ Connection ${connectionId} saved`);

      // Initialize Slack client to get additional info (teamId, botUserId)
      try {
        initializeSlackClient({ botToken });

        // Get bot info (includes teamId)
        const botInfo = await getBotInfo();

        if (botInfo?.teamId || botInfo?.userId) {
          // Update connection with Slack API data
          await updateConnectionSlackInfo(connectionId, {
            teamId: botInfo.teamId,
            botUserId: botInfo.userId,
          });

          // Cache bot user ID for event filtering
          if (botInfo.userId) {
            setBotUserIdForConnection(connectionId, botInfo.userId);
            setBotUserIdInHandler(botInfo.userId);
          }

          console.log(`[CONFIG] Team ID: ${botInfo.teamId ?? "unknown"}`);
          console.log(`[CONFIG] Bot User: ${botInfo.userId ?? "unknown"}`);
        }

        // Configure logger with log channel
        configureLogger({ channelId: logChannelId });

        // Build webhook URL
        const webhookUrl = `https://slack-mcp.deco.cx/slack/events/${connectionId}`;

        console.log(
          `\n🔗 WEBHOOK URL (use this in Slack Event Subscriptions):`,
        );
        console.log(`   ${webhookUrl}\n`);

        // Log config received
        await logger.configReceived({
          meshUrl,
          organizationId,
          teamId: botInfo?.teamId ?? "unknown",
          botUserId: botInfo?.userId,
          logChannelId: logChannelId ?? "not set",
          webhookUrl,
        });

        // Send connection success log to Slack
        await logger.connected(
          botInfo?.teamId ?? connectionId,
          botInfo?.userId ?? "unknown",
        );
      } catch (error) {
        console.error("[CONFIG] Failed to get Slack info:", error);
        // Config is already saved, just log the error
        await logger.error("Failed to get Slack info", {
          error: String(error),
        });
      }
    },
    scopes: ["EVENT_BUS::*", "MODEL_PROVIDER::*", "*"],
    state: StateSchema,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: tools as any,
  prompts: [],
});

const PORT = process.env.PORT ?? 8080;

// Debug: log all environment variables
console.log("\n🔧 [ENV] Environment variables:");
for (const [key, value] of Object.entries(process.env)) {
  const isSensitive =
    key.includes("TOKEN") ||
    key.includes("SECRET") ||
    key.includes("KEY") ||
    key.includes("PASSWORD");
  const displayValue =
    isSensitive && value
      ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
      : value;
  console.log(`   ${key}=${displayValue}`);
}
console.log("");

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

console.log(`
╔══════════════════════════════════════════════════════════╗
║                Slack MCP Server Started                  ║
╠══════════════════════════════════════════════════════════╣
║  MCP Server:    http://localhost:${String(PORT).padEnd(5)}                  ║
║  Webhook URL:   /slack/events/:connectionId              ║
║  Slack Bot:     Waiting for configuration...             ║
╚══════════════════════════════════════════════════════════╝
`);

console.log(`
📡 MCP Server ready!

💡 The Slack bot will start when Mesh sends the configuration.
   → Configure SLACK_CREDENTIALS (BOT_TOKEN and SIGNING_SECRET) in the Mesh Dashboard.

🔗 Slack Webhook URL format:
   https://sites-slack-mcp.decocache.com/slack/events/{connectionId}

📖 Setup Steps:
   1. Install this MCP in Mesh
   2. Configure SLACK_CREDENTIALS with your Bot Token and Signing Secret
   3. Get the webhook URL with your connectionId
   4. Use the Webhook URL in your Slack App's Event Subscriptions
`);
