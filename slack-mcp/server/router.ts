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
import { handleSlackEvent } from "./slack/handlers/eventHandler.ts";
import type { SlackWebhookPayload } from "./lib/types.ts";
import type { ConnectionConfig } from "./lib/config-cache.ts";
import { getCachedConnectionConfig } from "./lib/config-cache.ts";
import { logger, HyperDXLogger } from "./lib/logger.ts";

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
    triggerOnly?: boolean;
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
  // For multi-tenant, we store in cache when connection config is loaded
}

export function setBotUserIdForConnection(
  connectionId: string,
  userId: string,
): void {
  botUserIdCache.set(connectionId, userId);
}

export function setBotUserIdForTeam(teamId: string, userId: string): void {
  botUserIdCache.set(`team:${teamId}`, userId);
}

export const app = new Hono();

app.get("/health", async (c) => {
  const health = await getHealthStatus();
  const statusCode = health.status === "ok" ? 200 : 503;
  return c.json(health, statusCode);
});

app.get("/temp-files/:id", async (c) => {
  const { getTempFile } = await import("./lib/tempFileStore.ts");
  const id = c.req.param("id");

  const file = getTempFile(id);
  if (!file) {
    return c.json({ error: "File not found or expired" }, 404);
  }

  const buffer = Buffer.from(file.data, "base64");

  return new Response(buffer, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
});

// ============================================================================
// Primary Route: /slack/events/:connectionId
// ============================================================================

app.post("/slack/events/:connectionId", async (c) => {
  const connectionId = c.req.param("connectionId");
  const traceId = HyperDXLogger.generateTraceId();
  const rawBody = await c.req.text();

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

  if (parsedPayload.type === "url_verification") {
    return new Response(parsedPayload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let connectionConfig = await logger.measure(
    () => getCachedConnectionConfig(connectionId),
    "Cache lookup",
    { connectionId, trace_id: traceId },
  );

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
      },
      503,
    );
  }

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

  const botUserId =
    connectionConfig.botUserId ?? botUserIdCache.get(connectionId);
  if (shouldIgnoreEvent(payload, botUserId)) {
    return c.json({ ok: true });
  }

  processConnectionEventAsync(payload, connectionConfig, traceId).catch(
    (error) => {
      logger.error("Event processing failed", {
        connectionId,
        trace_id: traceId,
        error: String(error),
      });
    },
  );

  return c.json({ ok: true });
});

// ============================================================================
// Legacy Routes
// ============================================================================

app.get("/debug", async (c) => {
  await import("./lib/slack-client.ts");
  return c.json(
    { timestamp: new Date().toISOString(), note: "Legacy debug endpoint" },
    200,
  );
});

app.post("/slack/events", async (c) => {
  const rawBody = await c.req.text();
  let parsedPayload: SlackWebhookPayload;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (parsedPayload.type === "url_verification") {
    return new Response(parsedPayload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return c.json(
    {
      error:
        "Legacy team-based route deprecated - use /slack/events/:connectionId",
    },
    410,
  );
});

app.post("/slack/commands", async (c) => {
  const rawBody = await c.req.text();
  const command = parseSlashCommand(rawBody);
  if (!command) {
    return c.json({ error: "Invalid command" }, 400);
  }
  return c.json({ error: "Legacy team-based route deprecated" }, 410);
});

app.post("/slack/interactive", async (c) => {
  const rawBody = await c.req.text();
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return c.json({ error: "Missing payload" }, 400);
  }
  try {
    JSON.parse(payloadStr);
  } catch {
    return c.json({ error: "Invalid payload" }, 400);
  }
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
  if (!payload.event) {
    return;
  }

  // Initialize Slack client with this connection's token
  initializeSlackClient({ botToken: connectionConfig.botToken });

  const event = payload.event;
  const eventType = event.type;
  const connectionId = connectionConfig.connectionId;
  const botUserId =
    connectionConfig.botUserId ?? botUserIdCache.get(connectionId);

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
      connectionId,
    );
  }
}
