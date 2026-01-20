/**
 * HTTP Router for Slack MCP
 *
 * Handles incoming webhook requests from Slack.
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

// Environment will be set from main.ts
let signingSecret: string | null = null;
let botUserId: string | null = null;

export function configureRouter(config: {
  signingSecret: string;
  botUserId?: string;
}): void {
  signingSecret = config.signingSecret;
  botUserId = config.botUserId ?? null;
}

export function setBotUserId(userId: string): void {
  botUserId = userId;
}

export const app = new Hono();

/**
 * Health check endpoint
 */
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "slack-mcp" });
});

/**
 * Main Slack events endpoint
 */
app.post("/slack/events", async (c) => {
  if (!signingSecret) {
    console.error("[Router] Signing secret not configured");
    return c.json({ error: "Server not configured" }, 500);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");

  // Verify the request
  const { verified, payload } = await verifySlackRequest(
    rawBody,
    signature ?? null,
    timestamp ?? null,
    signingSecret,
  );

  if (!verified || !payload) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Handle URL verification challenge
  const challengeResponse = handleChallenge(payload);
  if (challengeResponse) {
    return challengeResponse;
  }

  // Check if we should ignore this event
  if (shouldIgnoreEvent(payload, botUserId ?? undefined)) {
    return c.json({ ok: true });
  }

  const eventType = getEventType(payload);
  console.log(`[Router] Received event: ${eventType}`);

  // Process the event asynchronously
  processEventAsync(payload).catch((error) => {
    console.error("[Router] Error processing event:", error);
  });

  // Acknowledge immediately (Slack expects response within 3 seconds)
  return c.json({ ok: true });
});

/**
 * Slack slash commands endpoint
 */
app.post("/slack/commands", async (c) => {
  if (!signingSecret) {
    console.error("[Router] Signing secret not configured");
    return c.json({ error: "Server not configured" }, 500);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");

  // Verify the request
  const { verified } = await verifySlackRequest(
    rawBody,
    signature ?? null,
    timestamp ?? null,
    signingSecret,
  );

  if (!verified) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const command = parseSlashCommand(rawBody);
  if (!command) {
    return c.json({ error: "Invalid command" }, 400);
  }

  console.log(`[Router] Received slash command: ${command.command}`);

  // For now, acknowledge and process async
  // In production, you might want to use response_url for delayed responses
  processSlashCommandAsync(command).catch((error) => {
    console.error("[Router] Error processing slash command:", error);
  });

  return c.json({
    response_type: "ephemeral",
    text: "Processing your request...",
  });
});

/**
 * Slack interactivity endpoint (buttons, modals, etc.)
 */
app.post("/slack/interactive", async (c) => {
  if (!signingSecret) {
    return c.json({ error: "Server not configured" }, 500);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");

  const { verified } = await verifySlackRequest(
    rawBody,
    signature ?? null,
    timestamp ?? null,
    signingSecret,
  );

  if (!verified) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Parse the payload (it's URL-encoded with a 'payload' field containing JSON)
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");

  if (!payloadStr) {
    return c.json({ error: "Missing payload" }, 400);
  }

  try {
    const interactivePayload = JSON.parse(payloadStr);
    console.log(
      `[Router] Received interactive event: ${interactivePayload.type}`,
    );

    // Process asynchronously
    processInteractiveAsync(interactivePayload).catch((error) => {
      console.error("[Router] Error processing interactive event:", error);
    });

    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Invalid payload" }, 400);
  }
});

/**
 * Process Slack events asynchronously
 */
async function processEventAsync(payload: SlackWebhookPayload): Promise<void> {
  if (!payload.event) return;

  const event = payload.event;
  const eventType = event.type;

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
    await handleSlackEvent({
      type: eventType,
      payload: {
        ...event,
        text: cleanText,
        original_text: event.text,
      },
      teamId: payload.team_id,
      apiAppId: payload.api_app_id,
    });
  }
}

/**
 * Process slash commands asynchronously
 */
async function processSlashCommandAsync(
  command: Record<string, string>,
): Promise<void> {
  // TODO: Implement slash command handling
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
 * Process interactive payloads asynchronously
 */
async function processInteractiveAsync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
): Promise<void> {
  // TODO: Implement interactive payload handling
  console.log("[Router] Processing interactive payload:", payload.type);
}
