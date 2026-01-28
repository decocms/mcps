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
  parseSlashCommand,
  shouldIgnoreEvent,
  isBotMentioned,
  removeBotMention,
} from "./webhook.ts";
import {
  handleSlackEvent,
  configureLLM,
  clearLLMConfig,
} from "./slack/handlers/eventHandler.ts";
import type { SlackWebhookPayload } from "./lib/types.ts";
import type { ConnectionConfig } from "./lib/db-sql.ts";
import { getCachedConnectionConfig } from "./lib/config-cache.ts";

// Legacy types for backwards compatibility
type SlackConnectionConfig = ConnectionConfig;
type SlackTeamConfig = {
  teamId: string;
  organizationId: string;
  meshUrl: string;
  botToken: string;
  signingSecret: string;
  botUserId?: string;
  configuredAt?: string;
  responseConfig?: {
    showOnlyFinalResponse?: boolean;
    enableStreaming?: boolean;
    showThinkingMessage?: boolean;
  };
};
import { initializeSlackClient } from "./lib/slack-client.ts";
import { getHealthStatus } from "./health.ts";

// Cache for bot user IDs (connectionId -> botUserId)
const botUserIdCache = new Map<string, string>();

export function setBotUserId(_userId: string): void {
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
 * Health check endpoint with system metrics
 */
app.get("/health", async (c) => {
  const health = await getHealthStatus();
  const statusCode = health.status === "ok" ? 200 : 503;
  return c.json(health, statusCode);
});

/**
 * Temporary file serving endpoint (for Whisper transcription)
 * URL: /temp-files/:id
 */
app.get("/temp-files/:id", async (c) => {
  const { getTempFile } = await import("./lib/tempFileStore.ts");
  const id = c.req.param("id");

  const file = getTempFile(id);
  if (!file) {
    return c.json({ error: "File not found or expired" }, 404);
  }

  // Convert base64 to buffer
  const buffer = Buffer.from(file.data, "base64");

  // Return the file with correct content type
  return new Response(buffer, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
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
    return new Response(parsedPayload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Lookup connection configuration from persistent KV cache
  // Note: Cache is populated by onChange (which has DATABASE binding access)
  // Cache survives server restarts!
  console.log(
    `[Router] 🔍 Looking up connection config from persistent cache: ${connectionId}`,
  );
  let connectionConfig = await getCachedConnectionConfig(connectionId);

  // LAZY LOADING: If cache miss, try to fetch from DATABASE
  // This handles new K8s pods that start with empty cache
  if (!connectionConfig) {
    console.log(
      `[Router] ⚠️ Cache miss for ${connectionId}, attempting lazy load from DATABASE...`,
    );

    // We don't have MCP context here, so we can't use DATABASE binding directly
    // Instead, we'll return a helpful error that triggers a re-sync
    console.error(
      `[Router] ❌ Connection not found in persistent cache: ${connectionId}`,
    );
    console.error(`[Router] 💡 This means:`);
    console.error(
      `[Router]    1. New K8s pod with empty cache (call SYNC_CONFIG_CACHE tool to warm-up)`,
    );
    console.error(`[Router]    2. Or connection not yet saved in Mesh UI`);
    console.error(`[Router]    - Connection ID: ${connectionId}`);
    console.error(`[Router]    - Webhook: POST /slack/events/${connectionId}`);
    return c.json(
      {
        error:
          "Connection cache miss - pod may need warm-up. Call SYNC_CONFIG_CACHE tool or save config in Mesh UI.",
        connectionId,
        hint: "This typically happens on new K8s pods. The cache will be populated automatically within a few seconds.",
      },
      503, // Service Unavailable (temporary)
    );
  }
  console.log(
    `[Router] ✅ Connection loaded from persistent cache: ${connectionId}`,
  );

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

  // Process the event asynchronously
  processConnectionEventAsync(payload, connectionConfig).catch(console.error);

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
  // Debug endpoint for testing (currently unused)
  await import("./lib/slack-client.ts");

  const testChannel = c.req.query("channel");
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    testChannel,
    note: "Legacy debug endpoint - now using DATABASE binding",
  };

  // Note: Can't list all teams without env context in GET route
  // For debugging, check logs or use Mesh UI

  return c.json(results, 200);
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
  if (parsedPayload.type === "url_verification") {
    return new Response(parsedPayload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Get team_id from payload
  const teamId = parsedPayload.team_id;
  if (!teamId) {
    return c.json({ error: "Missing team_id" }, 400);
  }

  // Legacy route - team-based lookup not supported with DATABASE binding
  // Please use /slack/events/:connectionId instead
  return c.json(
    {
      error:
        "Legacy team-based route deprecated - use /slack/events/:connectionId",
    },
    410,
  );

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

  // Process the event asynchronously with team config
  processEventAsync(payload, teamConfig).catch(console.error);

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

  // Legacy route - team-based lookup not supported with DATABASE binding
  return c.json({ error: "Legacy team-based route deprecated" }, 410);

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

  // Acknowledge and process async
  processSlashCommandAsync(command, teamConfig).catch(console.error);

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

  // Legacy route - team-based lookup not supported with DATABASE binding
  return c.json({ error: "Legacy team-based route deprecated" }, 410);

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

  // Process asynchronously
  processInteractiveAsync(interactivePayload, teamConfig).catch(console.error);

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

  // IMPORTANT: Initialize Slack client with this connection's token
  // Each connection has its own Slack workspace credentials
  initializeSlackClient({ botToken: connectionConfig.botToken });

  // Configure LLM with this connection's settings
  console.log("[Router] Connection config for LLM:", {
    connectionId: connectionConfig.connectionId,
    organizationId: connectionConfig.organizationId,
    meshUrl: connectionConfig.meshUrl,
    hasToken: !!connectionConfig.meshToken,
    modelProviderId: connectionConfig.modelProviderId,
    agentId: connectionConfig.agentId,
  });

  if (connectionConfig.meshToken && connectionConfig.modelProviderId) {
    configureLLM({
      meshUrl: connectionConfig.meshUrl,
      organizationId: connectionConfig.organizationId,
      token: connectionConfig.meshToken,
      modelProviderId: connectionConfig.modelProviderId,
      modelId: connectionConfig.modelId,
      agentId: connectionConfig.agentId,
      systemPrompt: connectionConfig.systemPrompt,
    });
  } else {
    // Clear LLM config to prevent cross-tenant configuration leakage
    clearLLMConfig();
    console.warn(
      "[Router] LLM not configured - missing meshToken or modelProviderId",
    );
  }

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
      responseConfig: connectionConfig.responseConfig,
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

  // IMPORTANT: Initialize Slack client with this team's token
  if (teamConfig.botToken) {
    initializeSlackClient({ botToken: teamConfig.botToken });
  }

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
  if (command.response_url) {
    await fetch(command.response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: `Received command: ${command.command} ${command.text}`,
      }),
    });
  }
}

/**
 * Process interactive payloads asynchronously (Multi-tenant)
 */
async function processInteractiveAsync(
  _payload: { type: string },
  _teamConfig: SlackTeamConfig,
): Promise<void> {
  // TODO: Implement interactive payload handling with team config
}
