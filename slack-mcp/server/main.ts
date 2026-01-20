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
import { app, configureRouter, setBotUserId } from "./router.ts";
import {
  initializeSlackClient,
  getSlackClient,
  getBotInfo,
} from "./lib/slack-client.ts";
import { configureThreadManager } from "./lib/thread.ts";
import {
  setEventHandlerEnv,
  handleLLMResponse,
  SLACK_EVENT_TYPES,
} from "./slack/handlers/eventHandler.ts";

export { StateSchema };

// Track Slack client state
let slackInitialized = false;

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
      const threadTimeoutMin =
        env.MESH_REQUEST_CONTEXT?.state?.THREAD_TIMEOUT_MIN ?? 10;

      // Configure thread manager
      configureThreadManager({ timeoutMinutes: threadTimeoutMin });

      // Set event handler environment for publishing
      setEventHandlerEnv({
        meshUrl: env.MESH_REQUEST_CONTEXT?.meshUrl,
        organizationId: env.MESH_REQUEST_CONTEXT?.organizationId,
      });

      // Configure router with signing secret
      if (signingSecret) {
        configureRouter({ signingSecret });
      }

      // Initialize Slack client if BOT_TOKEN is provided
      if (botToken && !slackInitialized && !getSlackClient()) {
        console.log("[CONFIG] Initializing Slack client...");
        try {
          initializeSlackClient({ botToken });
          slackInitialized = true;

          // Get and set bot user ID for mention detection
          const botInfo = await getBotInfo();
          if (botInfo) {
            setBotUserId(botInfo.userId);
            console.log(
              `[CONFIG] Slack client ready ✓ (Bot: ${botInfo.userId})`,
            );
          } else {
            console.log("[CONFIG] Slack client ready ✓");
          }
        } catch (error) {
          console.error("[CONFIG] Failed to initialize Slack:", error);
        }
      } else if (botToken && slackInitialized) {
        // Client already initialized, just update config
        console.log("[CONFIG] Slack client already initialized");
      } else if (!botToken) {
        console.log("[CONFIG] BOT_TOKEN not configured - Slack bot waiting...");
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
