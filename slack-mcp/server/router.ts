/**
 * HTTP Router for Slack MCP (Multi-tenant)
 *
 * Handles incoming webhook requests from Slack.
 * Looks up team configuration by team_id for multi-tenant support.
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
import { readTeamConfig, type SlackTeamConfig } from "./lib/data.ts";

// Cache for bot user IDs (teamId -> botUserId)
const botUserIdCache = new Map<string, string>();

export function setBotUserId(userId: string): void {
  // This is called from main.ts with the current team's bot user ID
  // For multi-tenant, we store in cache when team config is loaded
}

export function setBotUserIdForTeam(teamId: string, userId: string): void {
  botUserIdCache.set(teamId, userId);
}

export const app = new Hono();

/**
 * Health check endpoint
 */
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "slack-mcp" });
});

/**
 * Main Slack events endpoint (Multi-tenant)
 */
app.post("/slack/events", async (c) => {
  const rawBody = await c.req.text();

  // Parse payload to get team_id for config lookup
  let parsedPayload: SlackWebhookPayload;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Handle URL verification challenge (doesn't need team config)
  const challengeResponse = handleChallenge(parsedPayload);
  if (challengeResponse) {
    return challengeResponse;
  }

  // Get team_id from payload
  const teamId = parsedPayload.team_id;
  if (!teamId) {
    console.error("[Router] Missing team_id in payload");
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
 * Process Slack events asynchronously (Multi-tenant)
 */
async function processEventAsync(
  payload: SlackWebhookPayload,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  if (!payload.event) return;

  const event = payload.event;
  const eventType = event.type;
  const botUserId =
    teamConfig.botUserId ?? botUserIdCache.get(teamConfig.teamId);

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
