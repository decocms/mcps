/**
 * HTTP Router for Slack MCP (Multi-tenant)
 *
 * Handles incoming webhook requests from Slack.
 * Primary route: /slack/events/:connectionId (uses connectionId as key)
 * Legacy route: /slack/events (uses team_id from payload)
 */

import { Hono } from "hono";
import {
  verifySlackRequest,
  handleChallenge,
  parseSlashCommand,
  getEventType,
  shouldIgnoreEvent,
  isBotMentioned,
  removeBotMention,
} from "./webhook.ts";
import { handleSlackEvent } from "./slack/handlers/eventHandler.ts";
import type { SlackWebhookPayload } from "./lib/types.ts";
import {
  readConnectionConfig,
  readTeamConfig,
  type SlackConnectionConfig,
  type SlackTeamConfig,
} from "./lib/data.ts";

// Cache for bot user IDs (connectionId -> botUserId)
const botUserIdCache = new Map<string, string>();

export function setBotUserId(userId: string): void {
  // This is called from main.ts with the current connection's bot user ID
  // For multi-tenant, we store in cache when connection config is loaded
}

export function setBotUserIdForConnection(
  connectionId: string,
  userId: string,
): void {
  botUserIdCache.set(connectionId, userId);
}

// Legacy: Keep for backwards compatibility
export function setBotUserIdForTeam(teamId: string, userId: string): void {
  botUserIdCache.set(`team:${teamId}`, userId);
}

export const app = new Hono();

/**
 * Health check endpoint
 */
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "slack-mcp" });
});

// ============================================================================
// Primary Route: /slack/events/:connectionId (uses connectionId as key)
// ============================================================================

/**
 * Main Slack events endpoint with connectionId in URL
 * URL: /slack/events/:connectionId
 */
app.post("/slack/events/:connectionId", async (c) => {
  const connectionId = c.req.param("connectionId");
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║            🔔 SLACK WEBHOOK RECEIVED                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`[Router] Time: ${new Date().toISOString()}`);
  console.log(`[Router] Connection ID: ${connectionId}`);

  const rawBody = await c.req.text();

  // Parse payload
  let parsedPayload: SlackWebhookPayload;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    console.error("[Router] Failed to parse JSON");
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Handle URL verification challenge (doesn't need connection config)
  if (parsedPayload.type === "url_verification") {
    console.log("[Router] ✅ URL verification challenge");
    return new Response(parsedPayload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Lookup connection configuration
  const connectionConfig = await readConnectionConfig(connectionId);
  if (!connectionConfig) {
    console.error(
      `[Router] ❌ No config found for connection: ${connectionId}`,
    );
    return c.json({ error: "Connection not configured" }, 403);
  }

  console.log(`[Router] ✅ Config found for connection ${connectionId}`);

  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");

  // Verify the request with connection's signing secret
  const { verified, payload } = await verifySlackRequest(
    rawBody,
    signature ?? null,
    timestamp ?? null,
    connectionConfig.signingSecret,
  );

  if (!verified || !payload) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Check if we should ignore this event
  const botUserId =
    connectionConfig.botUserId ?? botUserIdCache.get(connectionId);
  if (shouldIgnoreEvent(payload, botUserId)) {
    return c.json({ ok: true });
  }

  const eventType = getEventType(payload);
  console.log(`[Router] Event: ${eventType} for connection: ${connectionId}`);

  // Process the event asynchronously
  processConnectionEventAsync(payload, connectionConfig).catch((error) => {
    console.error("[Router] Error processing event:", error);
  });

  // Acknowledge immediately (Slack expects response within 3 seconds)
  return c.json({ ok: true });
});

// ============================================================================
// Legacy Routes: Use team_id from payload (backwards compatibility)
// ============================================================================

/**
 * Debug endpoint - check configuration and send test message
 * Access: GET /debug?channel=C0A9RBGTTS9
 */
app.get("/debug", async (c) => {
  const { listTeamConfigs } = await import("./lib/data.ts");
  const { sendMessage, getSlackClient, initializeSlackClient } = await import(
    "./lib/slack-client.ts"
  );

  const testChannel = c.req.query("channel");
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    testChannel,
  };

  // List all configured teams
  try {
    const teams = await listTeamConfigs();
    results.configuredTeams = teams.map((t) => ({
      teamId: t.teamId,
      organizationId: t.organizationId,
      meshUrl: t.meshUrl,
      botUserId: t.botUserId,
      configuredAt: t.configuredAt,
      hasToken: !!t.botToken,
      hasSigningSecret: !!t.signingSecret,
    }));
    results.teamCount = teams.length;

    // Try to send test message if channel provided
    if (testChannel && teams.length > 0) {
      const firstTeam = teams[0];

      // Initialize client with first team's token
      if (firstTeam.botToken) {
        initializeSlackClient({ botToken: firstTeam.botToken });

        try {
          const testResult = await sendMessage({
            channel: testChannel,
            text: `🔍 *Debug Test Message*\n\`\`\`\nTimestamp: ${new Date().toISOString()}\nTeam: ${firstTeam.teamId}\nOrg: ${firstTeam.organizationId}\nBot User: ${firstTeam.botUserId ?? "unknown"}\n\`\`\``,
          });
          results.testMessage = {
            success: true,
            ts: testResult?.ts,
          };
        } catch (sendError) {
          results.testMessage = {
            success: false,
            error: String(sendError),
          };
        }
      } else {
        results.testMessage = {
          success: false,
          error: "No bot token in team config",
        };
      }
    } else if (testChannel) {
      results.testMessage = {
        success: false,
        error: "No teams configured - configure Slack connection in Mesh first",
      };
    }
  } catch (error) {
    results.error = String(error);
  }

  return c.json(results, 200);
});

/**
 * Main Slack events endpoint (Multi-tenant)
 */
app.post("/slack/events", async (c) => {
  const startTime = Date.now();
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║            🔔 SLACK WEBHOOK RECEIVED                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`[Router] Time: ${new Date().toISOString()}`);

  const rawBody = await c.req.text();
  console.log("[Router] Body length:", rawBody.length);
  console.log("[Router] Raw body preview:", rawBody.substring(0, 300));

  // Parse payload to get team_id for config lookup
  let parsedPayload: SlackWebhookPayload;
  try {
    parsedPayload = JSON.parse(rawBody);
    console.log("[Router] Parsed payload type:", parsedPayload.type);
  } catch (e) {
    console.error("[Router] Failed to parse JSON:", e);
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Handle URL verification challenge (doesn't need team config)
  if (parsedPayload.type === "url_verification") {
    console.log("[Router] ✅ URL verification challenge detected!");
    console.log("[Router] Challenge value:", parsedPayload.challenge);

    // Return challenge as plain text (Slack requirement)
    const response = new Response(parsedPayload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
    console.log("[Router] Returning challenge response");
    return response;
  }

  // Get team_id from payload
  const teamId = parsedPayload.team_id;
  if (!teamId) {
    console.error("[Router] ❌ Missing team_id in payload");
    return c.json({ error: "Missing team_id" }, 400);
  }
  console.log(`[Router] Team ID: ${teamId}`);

  // Lookup team configuration
  console.log(`[Router] Looking up config for team: ${teamId}...`);
  const teamConfig = await readTeamConfig(teamId);

  if (!teamConfig) {
    console.error(`[Router] ❌ NO CONFIG FOUND for team: ${teamId}`);
    console.error(`[Router] ⚠️ The team needs to be configured in Mesh FIRST!`);
    console.error(
      `[Router] ⚠️ Make sure to save the Slack connection in Mesh Dashboard.`,
    );
    return c.json({ error: "Team not configured" }, 403);
  }

  console.log(`[Router] ✅ Config found for team ${teamId}:`);
  console.log(`[Router]   organizationId: ${teamConfig.organizationId}`);
  console.log(`[Router]   meshUrl: ${teamConfig.meshUrl}`);
  console.log(`[Router]   botUserId: ${teamConfig.botUserId ?? "not set"}`);
  console.log(`[Router]   configuredAt: ${teamConfig.configuredAt}`);

  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");

  // Verify the request with team's signing secret
  const { verified, payload } = await verifySlackRequest(
    rawBody,
    signature ?? null,
    timestamp ?? null,
    teamConfig.signingSecret,
  );

  if (!verified || !payload) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Check if we should ignore this event
  const botUserId = teamConfig.botUserId ?? botUserIdCache.get(teamId);
  if (shouldIgnoreEvent(payload, botUserId)) {
    return c.json({ ok: true });
  }

  const eventType = getEventType(payload);
  console.log(`[Router] Received event: ${eventType} from team: ${teamId}`);

  // Process the event asynchronously with team config
  processEventAsync(payload, teamConfig).catch((error) => {
    console.error("[Router] Error processing event:", error);
  });

  // Acknowledge immediately (Slack expects response within 3 seconds)
  return c.json({ ok: true });
});

/**
 * Slack slash commands endpoint (Multi-tenant)
 */
app.post("/slack/commands", async (c) => {
  const rawBody = await c.req.text();
  const command = parseSlashCommand(rawBody);

  if (!command) {
    return c.json({ error: "Invalid command" }, 400);
  }

  // Get team_id from command
  const teamId = command.team_id;
  if (!teamId) {
    console.error("[Router] Missing team_id in command");
    return c.json({ error: "Missing team_id" }, 400);
  }

  // Lookup team configuration
  const teamConfig = await readTeamConfig(teamId);
  if (!teamConfig) {
    console.error(`[Router] No config found for team: ${teamId}`);
    return c.json({ error: "Team not configured" }, 403);
  }

  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");

  // Verify the request with team's signing secret
  const { verified } = await verifySlackRequest(
    rawBody,
    signature ?? null,
    timestamp ?? null,
    teamConfig.signingSecret,
  );

  if (!verified) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  console.log(
    `[Router] Received slash command: ${command.command} from team: ${teamId}`,
  );

  // For now, acknowledge and process async
  processSlashCommandAsync(command, teamConfig).catch((error) => {
    console.error("[Router] Error processing slash command:", error);
  });

  return c.json({
    response_type: "ephemeral",
    text: "Processing your request...",
  });
});

/**
 * Slack interactivity endpoint (Multi-tenant)
 */
app.post("/slack/interactive", async (c) => {
  const rawBody = await c.req.text();

  // Parse the payload (it's URL-encoded with a 'payload' field containing JSON)
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");

  if (!payloadStr) {
    return c.json({ error: "Missing payload" }, 400);
  }

  let interactivePayload: { type: string; team?: { id: string } };
  try {
    interactivePayload = JSON.parse(payloadStr);
  } catch {
    return c.json({ error: "Invalid payload" }, 400);
  }

  // Get team_id from interactive payload
  const teamId = interactivePayload.team?.id;
  if (!teamId) {
    console.error("[Router] Missing team_id in interactive payload");
    return c.json({ error: "Missing team_id" }, 400);
  }

  // Lookup team configuration
  const teamConfig = await readTeamConfig(teamId);
  if (!teamConfig) {
    console.error(`[Router] No config found for team: ${teamId}`);
    return c.json({ error: "Team not configured" }, 403);
  }

  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");

  const { verified } = await verifySlackRequest(
    rawBody,
    signature ?? null,
    timestamp ?? null,
    teamConfig.signingSecret,
  );

  if (!verified) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  console.log(
    `[Router] Received interactive event: ${interactivePayload.type} from team: ${teamId}`,
  );

  // Process asynchronously
  processInteractiveAsync(interactivePayload, teamConfig).catch((error) => {
    console.error("[Router] Error processing interactive event:", error);
  });

  return c.json({ ok: true });
});

/**
 * Process Slack events asynchronously (connection-based)
 */
async function processConnectionEventAsync(
  payload: SlackWebhookPayload,
  connectionConfig: SlackConnectionConfig,
): Promise<void> {
  if (!payload.event) return;

  const event = payload.event;
  const eventType = event.type;
  const botUserId =
    connectionConfig.botUserId ??
    botUserIdCache.get(connectionConfig.connectionId);

  // Determine if bot was mentioned (for app_mention or message events)
  let shouldProcess = false;
  let cleanText = event.text ?? "";

  if (eventType === "app_mention") {
    shouldProcess = true;
    if (botUserId) {
      cleanText = removeBotMention(cleanText, botUserId);
    }
  } else if (eventType === "message") {
    const isDM = event.channel?.startsWith("D");
    if (isDM) {
      shouldProcess = true;
    } else if (botUserId && isBotMentioned(event.text ?? "", botUserId)) {
      shouldProcess = true;
      cleanText = removeBotMention(event.text ?? "", botUserId);
    }
  } else {
    shouldProcess = true;
  }

  if (shouldProcess) {
    // Convert to team config format for compatibility with handleSlackEvent
    const teamConfig: SlackTeamConfig = {
      teamId: connectionConfig.teamId ?? payload.team_id ?? "",
      organizationId: connectionConfig.organizationId,
      meshUrl: connectionConfig.meshUrl,
      botToken: connectionConfig.botToken,
      signingSecret: connectionConfig.signingSecret,
      botUserId: connectionConfig.botUserId,
      configuredAt: connectionConfig.configuredAt,
    };

    await handleSlackEvent(
      {
        type: eventType,
        payload: {
          ...event,
          text: cleanText,
          original_text: event.text,
        },
        teamId: payload.team_id,
        apiAppId: payload.api_app_id,
      },
      teamConfig,
    );
  }
}

/**
 * Process Slack events asynchronously (legacy team-based)
 */
async function processEventAsync(
  payload: SlackWebhookPayload,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  if (!payload.event) return;

  const event = payload.event;
  const eventType = event.type;
  const botUserId =
    teamConfig.botUserId ?? botUserIdCache.get(`team:${teamConfig.teamId}`);

  // Determine if bot was mentioned (for app_mention or message events)
  let shouldProcess = false;
  let cleanText = event.text ?? "";

  if (eventType === "app_mention") {
    // Always process app mentions
    shouldProcess = true;
    if (botUserId) {
      cleanText = removeBotMention(cleanText, botUserId);
    }
  } else if (eventType === "message") {
    // For messages, check if it's a DM or if bot was mentioned
    const isDM = event.channel?.startsWith("D"); // DM channels start with D

    if (isDM) {
      // Always process DMs
      shouldProcess = true;
    } else if (botUserId && isBotMentioned(event.text ?? "", botUserId)) {
      // Process channel messages that mention the bot
      shouldProcess = true;
      cleanText = removeBotMention(event.text ?? "", botUserId);
    }
  } else {
    // Process other event types (reactions, channel events, etc.)
    shouldProcess = true;
  }

  if (shouldProcess) {
    await handleSlackEvent(
      {
        type: eventType,
        payload: {
          ...event,
          text: cleanText,
          original_text: event.text,
        },
        teamId: payload.team_id,
        apiAppId: payload.api_app_id,
      },
      teamConfig,
    );
  }
}

/**
 * Process slash commands asynchronously (Multi-tenant)
 */
async function processSlashCommandAsync(
  command: Record<string, string>,
  _teamConfig: SlackTeamConfig,
): Promise<void> {
  // TODO: Implement slash command handling with team config
  console.log("[Router] Processing slash command:", command.command);

  // You can use command.response_url to send delayed responses
  if (command.response_url) {
    try {
      await fetch(command.response_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_type: "ephemeral",
          text: `Received command: ${command.command} ${command.text}`,
        }),
      });
    } catch (error) {
      console.error("[Router] Failed to send command response:", error);
    }
  }
}

/**
 * Process interactive payloads asynchronously (Multi-tenant)
 */
async function processInteractiveAsync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: { type: string },
  _teamConfig: SlackTeamConfig,
): Promise<void> {
  // TODO: Implement interactive payload handling with team config
  console.log("[Router] Processing interactive payload:", payload.type);
}
