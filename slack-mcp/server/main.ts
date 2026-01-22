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
      const state = env.MESH_REQUEST_CONTEXT?.state;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      const token = env.MESH_REQUEST_CONTEXT?.token;

      // Use slug for API calls (falls back to id for backwards compatibility)
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

      if (
        !botToken ||
        !signingSecret ||
        !meshUrl ||
        !organizationId ||
        !connectionId
      ) {
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
        }

        // Configure logger with log channel
        configureLogger({ channelId: logChannelId });

        // Build webhook URL
        const webhookUrl = `https://slack-mcp.deco.cx/slack/events/${connectionId}`;

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

console.log(`\n🚀 Slack MCP Server started on http://localhost:${PORT}/mcp\n`);
