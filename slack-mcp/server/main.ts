/**
 * Slack MCP Server - Main Entry Point
 *
 * MCP server for Slack bot integration with intelligent
 * thread management and AI agent commands.
 *
 * Webhooks are handled via the handle_webhook tool.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { tools } from "./tools/index.ts";
import { StateSchema, type Env } from "./types/env.ts";
import { initializeSlackClient, getBotInfo } from "./lib/slack-client.ts";
import { configureThreadManager } from "./lib/thread.ts";
import { configureLLM } from "./slack/handlers/eventHandler.ts";
import { saveTeamConfig, updateTeamBotUserId } from "./lib/data.ts";
import { configureLogger, logger } from "./lib/logger.ts";
import { setBotUserIdForTeam } from "./router.ts";

export { StateSchema };

// Webhooks are now handled via the handle_webhook tool
// No need for Event Bus subscriptions

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    onChange: async (env) => {
      console.log("[CONFIG] Configuration changed");

      // Get configuration from state
      const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
      const signingSecret = env.MESH_REQUEST_CONTEXT?.state?.SIGNING_SECRET;
      const appToken = env.MESH_REQUEST_CONTEXT?.state?.APP_TOKEN;
      const logChannelId = env.MESH_REQUEST_CONTEXT?.state?.LOG_CHANNEL_ID;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      const threadTimeoutMin =
        env.MESH_REQUEST_CONTEXT?.state?.THREAD_TIMEOUT_MIN ?? 10;

      // Get LLM configuration
      const modelProvider = env.MESH_REQUEST_CONTEXT?.state?.MODEL_PROVIDER;
      const agent = env.MESH_REQUEST_CONTEXT?.state?.AGENT as
        | {
            __type?: string;
            value?: string;
          }
        | undefined;
      const languageModel = env.MESH_REQUEST_CONTEXT?.state?.LANGUAGE_MODEL;
      const token = env.MESH_REQUEST_CONTEXT?.token;

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

      if (!botToken || !signingSecret || !meshUrl || !organizationId) {
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

      // Configure thread manager
      configureThreadManager({ timeoutMinutes: threadTimeoutMin });

      // Initialize Slack client to get team info
      try {
        initializeSlackClient({ botToken });

        // Get bot info (includes teamId)
        const botInfo = await getBotInfo();
        if (!botInfo?.teamId) {
          console.error("[CONFIG] Failed to get teamId from Slack");
          return;
        }

        const teamId = botInfo.teamId;
        console.log(`[CONFIG] Team ID: ${teamId}`);

        // Save team configuration for multi-tenant support
        await saveTeamConfig(teamId, {
          organizationId,
          meshUrl,
          botToken,
          signingSecret,
          appToken,
          botUserId: botInfo.userId,
        });

        // Update bot user ID in cache
        if (botInfo.userId) {
          await updateTeamBotUserId(teamId, botInfo.userId);
          setBotUserIdForTeam(teamId, botInfo.userId);
        }

        // Configure logger with log channel
        configureLogger({ channelId: logChannelId });

        console.log(
          `[CONFIG] ✅ Team ${teamId} configured for org ${organizationId}`,
        );
        console.log(`[CONFIG] Bot user: ${botInfo.userId}`);

        // Build webhook URL
        const webhookUrl = connectionId
          ? `${meshUrl}/webhooks/${connectionId}`
          : "Not available (connectionId missing)";

        // Log config received
        await logger.configReceived({
          meshUrl,
          organizationId,
          teamId,
          botUserId: botInfo.userId,
          logChannelId: logChannelId ?? "not set",
          webhookUrl,
        });

        // Send connection success log to Slack
        await logger.connected(teamId, botInfo.userId);
      } catch (error) {
        console.error("[CONFIG] Failed to configure team:", error);
        await logger.error("Failed to configure team", {
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
 * Serve MCP requests via the runtime
 * Webhooks are now handled by Mesh's Universal Webhook Proxy
 */
serve(async (req, env, ctx) => {
  return runtime.fetch(req, env, ctx);
});

console.log(`
╔══════════════════════════════════════════════════════════╗
║                Slack MCP Server Started                  ║
╠══════════════════════════════════════════════════════════╣
║  MCP Server:    http://localhost:${String(PORT).padEnd(5)}                  ║
║  Slack Bot:     Waiting for configuration...             ║
╚══════════════════════════════════════════════════════════╝
`);

console.log(`
📡 MCP Server ready!

💡 The Slack bot will start when Mesh sends the configuration.
   → Configure BOT_TOKEN and SIGNING_SECRET in the Mesh Dashboard.

🔗 Slack Webhook URL (via Mesh Universal Webhook Proxy):
   https://mesh.deco.cx/webhooks/{connectionId}

   The webhook URL will be shown in the MCP configuration panel
   after you install this MCP in Mesh.

📖 Setup Steps:
   1. Install this MCP in Mesh
   2. Configure BOT_TOKEN and SIGNING_SECRET
   3. Copy the Webhook URL from configuration
   4. Paste it in your Slack App's Event Subscriptions
`);
