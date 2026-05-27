/**
 * HTTP router for the Microsoft Teams MCP.
 *
 * Routes:
 *  - GET  /health                            — health check
 *  - GET  /teams/notifications/:connectionId — Graph subscription validation
 *  - POST /teams/notifications/:connectionId — Graph change notifications
 *
 * OAuth (login flow) is handled by the deco runtime — no /auth routes here.
 */

import { Hono } from "hono";
import {
  isValidationRequest,
  getValidationToken,
  isValidNotification,
} from "./webhook.ts";
import { getKvStore } from "./lib/kv.ts";
import { getDelegatedTokenForConnection } from "./lib/auth.ts";
import { getMessage, renewSubscription } from "./lib/graph-client.ts";
import { publishMessageReceived } from "./lib/event-publisher.ts";
import { parseResource, type GraphNotificationPayload } from "./lib/types.ts";
import { logger } from "./lib/logger.ts";
import {
  fingerprintNotification,
  isDuplicateNotification,
} from "./lib/dedup.ts";

export const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "microsoft-teams-mcp",
    ts: new Date().toISOString(),
  }),
);

// ─── Graph subscription validation (GET) ─────────────────────────────────────

app.get("/teams/notifications/:connectionId", (c) => {
  const url = new URL(c.req.url);
  if (isValidationRequest(url)) {
    const token = getValidationToken(url);
    logger.info("Graph subscription validated", {
      connectionId: c.req.param("connectionId"),
    });
    return new Response(token, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return c.json({ error: "Not found" }, 404);
});

// ─── Graph change notifications (POST) ────────────────────────────────────────

app.post("/teams/notifications/:connectionId", async (c) => {
  const connectionId = c.req.param("connectionId");
  const trace_id = logger.generateTraceId();
  const receivedAt = Date.now();

  const url = new URL(c.req.url);
  if (isValidationRequest(url)) {
    const token = getValidationToken(url);
    return new Response(token, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let payload: GraphNotificationPayload;
  try {
    payload = (await c.req.json()) as GraphNotificationPayload;
  } catch {
    logger.warn("Notification payload invalid JSON", {
      connectionId,
      trace_id,
    });
    return c.json({ error: "Invalid JSON" }, 400);
  }

  logger.info("Notification received", {
    connectionId,
    trace_id,
    notification_count: payload.value?.length ?? 0,
  });

  // Validate clientState against the one stored when subscription was created
  const kv = getKvStore();
  const subInfo = await kv.get<{
    clientState: string;
    subscriptions: Record<string, string>;
  }>(`webhook-config:${connectionId}`);

  if (!subInfo) {
    logger.warn("Notification for unknown connection", {
      connectionId,
      trace_id,
    });
    return c.json({ ok: true }, 202);
  }

  const work = processNotificationsAsync(
    connectionId,
    payload,
    subInfo.clientState,
    trace_id,
    receivedAt,
  ).catch((err) => {
    logger.error("Notification processing failed", {
      connectionId,
      trace_id,
      error: String(err),
    });
  });

  // On Cloudflare Workers, background work is cancelled once the response
  // returns unless it is registered with the execution context. Locally
  // (no executionCtx) the promise just runs to completion.
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // No execution context available — let the promise run unmanaged.
  }

  return c.json({ ok: true }, 202);
});

async function processNotificationsAsync(
  connectionId: string,
  payload: GraphNotificationPayload,
  clientState: string,
  trace_id: string,
  receivedAt: number,
): Promise<void> {
  let accessToken: string;
  try {
    accessToken = await logger.measure(
      () => getDelegatedTokenForConnection(connectionId),
      "getDelegatedTokenForConnection",
      { connectionId, trace_id },
    );
  } catch {
    // measure() already logged the error
    return;
  }

  for (const notification of payload.value ?? []) {
    if (!isValidNotification(notification, clientState)) {
      logger.warn("Notification clientState mismatch — ignoring", {
        connectionId,
        trace_id,
        subscriptionId: notification.subscriptionId,
      });
      continue;
    }

    // Dedup — skip notifications we've already processed
    const fp = fingerprintNotification(notification);
    if (await isDuplicateNotification(fp)) {
      logger.info("Duplicate notification skipped", {
        connectionId,
        trace_id,
        fingerprint: fp,
      });
      continue;
    }

    const expiresAt = new Date(
      notification.subscriptionExpirationDateTime,
    ).getTime();
    const minutesLeft = (expiresAt - Date.now()) / 60_000;
    if (minutesLeft < 10) {
      // Awaited so the renewal completes within the ctx.waitUntil() window.
      await logger
        .measure(
          () => renewSubscription(notification.subscriptionId, accessToken),
          "Subscription renewed",
          {
            connectionId,
            trace_id,
            subscriptionId: notification.subscriptionId,
          },
        )
        .catch(() => {
          /* measure() already logged */
        });
    }

    if (notification.changeType !== "created") continue;

    const parsed = parseResource(notification.resource);
    if (!parsed) {
      logger.warn("Could not parse resource", {
        connectionId,
        trace_id,
        resource: notification.resource,
      });
      continue;
    }

    const message = await logger.measure(
      () =>
        getMessage(
          parsed.teamId,
          parsed.channelId,
          parsed.messageId,
          accessToken,
        ),
      "Graph getMessage",
      {
        connectionId,
        trace_id,
        teamId: parsed.teamId,
        channelId: parsed.channelId,
        messageId: parsed.messageId,
      },
    );
    if (!message) continue;

    if (message.from?.application && !message.from?.user) {
      logger.debug("Skipping bot/application message", {
        connectionId,
        trace_id,
        messageId: parsed.messageId,
      });
      continue;
    }

    logger.info("Publishing teams.message.received", {
      connectionId,
      trace_id,
      teamId: parsed.teamId,
      channelId: parsed.channelId,
      messageId: parsed.messageId,
      sender: message.from?.user?.displayName,
      end_to_end_duration_ms: Date.now() - receivedAt,
    });

    await publishMessageReceived(
      connectionId,
      parsed.teamId,
      parsed.channelId,
      message,
      trace_id,
    );
  }
}
