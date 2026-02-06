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
import type { ConnectionConfig } from "./lib/config-cache.ts";
import { getCachedConnectionConfig } from "./lib/config-cache.ts";
import { logger, HyperDXLogger } from "./lib/logger.ts";

// Legacy types for backwards compatibility
type SlackConnectionConfig = ConnectionConfig;
type SlackTeamConfig = {
  teamId: string;
  organizationId: string;
  meshUrl: string;
  botToken: string;
  signingSecret: string;
  botUserId?: string;
  teamName?: string;
  connectionName?: string;
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
  const traceId = HyperDXLogger.generateTraceId();
  const startTime = Date.now();
  const rawBody = await c.req.text();

  // 1. Log webhook arrival
  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");
  logger.info("Webhook received", {
    connectionId,
    trace_id: traceId,
    route: "/slack/events/:connectionId",
    method: "POST",
    hasSignature: !!signature,
    hasTimestamp: !!timestamp,
    payloadSize: rawBody.length,
    userAgent: c.req.header("user-agent"),
  });

  // Parse payload
  let parsedPayload: SlackWebhookPayload;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    logger.error("Failed to parse webhook payload", {
      connectionId,
      trace_id: traceId,
      error: "Invalid JSON",
    });
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // 2. Log event type identified
  logger.info("Event type identified", {
    connectionId,
    trace_id: traceId,
    eventType: parsedPayload.type,
    hasEvent: !!parsedPayload.event,
    slackEventType: parsedPayload.event?.type,
  });

  // Handle URL verification challenge (doesn't need connection config)
  if (parsedPayload.type === "url_verification") {
    logger.info("URL verification challenge", {
      connectionId,
      trace_id: traceId,
    });
    return new Response(parsedPayload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // 3. Lookup connection configuration from persistent KV cache
  let connectionConfig = await logger.measure(
    () => getCachedConnectionConfig(connectionId),
    "Cache lookup",
    { connectionId, trace_id: traceId },
  );

  // LAZY LOADING: If cache miss, try to fetch from DATABASE
  // This handles new K8s pods that start with empty cache
  if (!connectionConfig) {
    logger.error("Connection config not found", {
      connectionId,
      trace_id: traceId,
      error: "Cache miss - pod may need warm-up",
      route: "/slack/events/:connectionId",
    });
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

  // 4. Configure HyperDX logger if API key is in cached config (survives server restarts)
  if (connectionConfig.hyperDxApiKey) {
    logger.setApiKey(connectionConfig.hyperDxApiKey);
  }

  // 5. Log cache hit with names
  logger.info("Connection config found (cache hit)", {
    connectionId,
    connectionName: connectionConfig.connectionName,
    trace_id: traceId,
    teamId: connectionConfig.teamId,
    teamName: connectionConfig.teamName,
    organizationId: connectionConfig.organizationId,
  });

  // Verify the request with connection's signing secret
  const { verified, payload } = await logger.measure(
    () =>
      verifySlackRequest(
        rawBody,
        signature ?? null,
        timestamp ?? null,
        connectionConfig.signingSecret,
      ),
    "Signature verification",
    { connectionId, trace_id: traceId },
  );

  if (!verified || !payload) {
    logger.error("Invalid signature", {
      connectionId,
      trace_id: traceId,
      teamId: connectionConfig.teamId,
      teamName: connectionConfig.teamName,
    });
    return c.json({ error: "Invalid signature" }, 401);
  }

  // 5. Log signature verified
  logger.info("Signature verified successfully", {
    connectionId,
    trace_id: traceId,
    eventType: payload.event?.type,
    channel: payload.event?.channel,
    userId: payload.event?.user,
    hasText: !!payload.event?.text,
    textLength: payload.event?.text?.length || 0,
    hasFiles: !!(payload.event as any)?.files?.length,
  });

  // Check if we should ignore this event
  const botUserId =
    connectionConfig.botUserId ?? botUserIdCache.get(connectionId);
  if (shouldIgnoreEvent(payload, botUserId)) {
    logger.debug("Event ignored (bot message or duplicate)", {
      connectionId,
      trace_id: traceId,
      eventType: payload.event?.type,
    });
    return c.json({ ok: true });
  }

  // 6. Log routing
  logger.info("Routing to event handler", {
    connectionId,
    teamName: connectionConfig.teamName,
    trace_id: traceId,
    eventType: payload.event?.type,
    channel: payload.event?.channel,
    userId: payload.event?.user,
  });

  // Process the event asynchronously
  processConnectionEventAsync(payload, connectionConfig, traceId).catch(
    (error) => {
      logger.error("Event processing failed", {
        connectionId,
        trace_id: traceId,
        error: String(error),
      });
    },
  );

  const duration = Date.now() - startTime;

  // 7. Log acknowledge
  logger.info("Webhook acknowledged", {
    connectionId,
    trace_id: traceId,
    duration,
    status: "success",
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

  let _interactivePayload: { type: string; team?: { id: string } };
  try {
    _interactivePayload = JSON.parse(payloadStr);
  } catch {
    return c.json({ error: "Invalid payload" }, 400);
  }

  // Legacy route - team-based lookup not supported with DATABASE binding
  return c.json({ error: "Legacy team-based route deprecated" }, 410);
});

/**
 * Process Slack events asynchronously (connection-based)
 */
async function processConnectionEventAsync(
  payload: SlackWebhookPayload,
  connectionConfig: SlackConnectionConfig,
  traceId: string,
): Promise<void> {
  if (!payload.event) return;

  // Log processing start
  logger.info("Event processing started", {
    connectionId: connectionConfig.connectionId,
    trace_id: traceId,
    eventType: payload.event.type,
    channel: payload.event.channel,
  });

  // IMPORTANT: Initialize Slack client with this connection's token
  // Each connection has its own Slack workspace credentials
  initializeSlackClient({ botToken: connectionConfig.botToken });

  // Configure LLM with this connection's settings
  logger.info("LLM configuration", {
    connectionId: connectionConfig.connectionId,
    trace_id: traceId,
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
    logger.warn("LLM not configured - missing meshToken or modelProviderId", {
      connectionId: connectionConfig.connectionId,
      trace_id: traceId,
    });
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

// Legacy functions removed - team-based routes are now deprecated
// All event processing now uses connection-based routing via /slack/events/:connectionId
