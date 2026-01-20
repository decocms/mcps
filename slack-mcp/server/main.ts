/**
 * Slack MCP Server - Main Entry Point
 *
 * MCP server for Slack bot integration with intelligent
 * thread management and AI agent commands.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { tools } from "./tools/index.ts";
import { StateSchema, type Env } from "./types/env.ts";
import { app, setBotUserId, setBotUserIdForTeam } from "./router.ts";
import {
  initializeSlackClient,
  getSlackClient,
  getBotInfo,
} from "./lib/slack-client.ts";
import { configureThreadManager } from "./lib/thread.ts";
import {
  handleLLMResponse,
  SLACK_EVENT_TYPES,
} from "./slack/handlers/eventHandler.ts";
import { saveTeamConfig, updateTeamBotUserId } from "./lib/data.ts";

export { StateSchema };

// Event types this MCP subscribes to
const SUBSCRIBED_EVENT_TYPES = [
  SLACK_EVENT_TYPES.OPERATOR_TEXT_COMPLETED,
  SLACK_EVENT_TYPES.OPERATOR_GENERATION_COMPLETED,
];

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  events: {
    handlers: {
      EVENT_BUS: {
        events: SUBSCRIBED_EVENT_TYPES,
        handler: async ({ events }) => {
          try {
            for (const event of events) {
              console.log(`[EVENT_BUS] Received event: ${event.type}`);

              if (
                event.type === SLACK_EVENT_TYPES.OPERATOR_TEXT_COMPLETED ||
                event.type === SLACK_EVENT_TYPES.OPERATOR_GENERATION_COMPLETED
              ) {
                // Extract response text and context
                const data = event.data as {
                  text?: string;
                  messageParts?: Array<{ type: string; text?: string }>;
                };
                const subject = event.subject;

                // Parse subject to get channel and thread info
                // Subject format: "channelId:threadTs"
                const [channel, threadTs] = (subject ?? "").split(":");

                if (!channel) {
                  console.error("[EVENT_BUS] Missing channel in subject");
                  continue;
                }

                // Get the response text
                let responseText = data.text ?? "";
                if (!responseText && data.messageParts) {
                  // Extract text from message parts
                  responseText = data.messageParts
                    .filter((p) => p.type === "text")
                    .map((p) => p.text ?? "")
                    .join("");
                }

                if (responseText) {
                  await handleLLMResponse(responseText, {
                    channel,
                    threadTs: threadTs || undefined,
                  });
                }
              }
            }
            return { success: true };
          } catch (error) {
            console.error(`[EVENT_BUS] Error handling events:`, error);
            return { success: false };
          }
        },
      },
      SELF: {
        events: ["slack.*"],
        handler: async ({ events }) => {
          try {
            for (const event of events) {
              console.log(`[SELF] Event: ${event.type}`);
            }
            return { success: true };
          } catch (error) {
            console.error(`[SELF] Error:`, error);
            return { success: false };
          }
        },
      },
    },
  },
  configuration: {
    onChange: async (env) => {
      console.log("[CONFIG] Configuration changed");

      // Get configuration from state
      const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
      const signingSecret = env.MESH_REQUEST_CONTEXT?.state?.SIGNING_SECRET;
      const appToken = env.MESH_REQUEST_CONTEXT?.state?.APP_TOKEN;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const threadTimeoutMin =
        env.MESH_REQUEST_CONTEXT?.state?.THREAD_TIMEOUT_MIN ?? 10;

      console.log("[CONFIG] meshUrl:", meshUrl);
      console.log("[CONFIG] organizationId:", organizationId);
      console.log("[CONFIG] botToken exists:", !!botToken);
      console.log("[CONFIG] signingSecret exists:", !!signingSecret);

      if (!botToken || !signingSecret || !meshUrl || !organizationId) {
        console.log("[CONFIG] Missing required configuration, waiting...");
        return;
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

        console.log(
          `[CONFIG] ✅ Team ${teamId} configured for org ${organizationId}`,
        );
        console.log(`[CONFIG] Bot user: ${botInfo.userId}`);
      } catch (error) {
        console.error("[CONFIG] Failed to configure team:", error);
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
 * Wrapped fetch handler that intercepts webhook routes
 * and delegates MCP requests to the runtime
 */
serve(async (req, env, ctx) => {
  const url = new URL(req.url);

  // Route Slack webhook endpoints to our router
  if (url.pathname.startsWith("/slack/") || url.pathname === "/health") {
    const response = await app.fetch(req, env, ctx);
    if (response.status !== 404) {
      return response;
    }
  }

  // Everything else goes to MCP runtime
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
   → Webhook URL: https://your-mcp-url/slack/events

Endpoints:
  POST /slack/events     - Slack Event Subscriptions
  POST /slack/commands   - Slash Commands
  POST /slack/interactive - Interactive Components
  GET  /health           - Health Check
`);
