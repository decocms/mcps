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
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate clientState against the one stored when subscription was created
  const kv = getKvStore();
  const subInfo = await kv.get<{
    clientState: string;
    subscriptions: Record<string, string>;
  }>(`webhook-config:${connectionId}`);

  if (!subInfo) {
    logger.warn("Notification received for unknown connection", {
      connectionId,
    });
    return c.json({ ok: true }, 202);
  }

  processNotificationsAsync(connectionId, payload, subInfo.clientState).catch(
    (err) => {
      logger.error("Notification processing failed", {
        connectionId,
        error: String(err),
      });
    },
  );

  return c.json({ ok: true }, 202);
});

async function processNotificationsAsync(
  connectionId: string,
  payload: GraphNotificationPayload,
  clientState: string,
): Promise<void> {
  let accessToken: string;
  try {
    accessToken = await getDelegatedTokenForConnection(connectionId);
  } catch (err) {
    logger.error("Cannot get token for webhook", {
      connectionId,
      error: String(err),
    });
    return;
  }

  for (const notification of payload.value ?? []) {
    if (!isValidNotification(notification, clientState)) {
      logger.warn("Notification clientState mismatch — ignoring", {
        connectionId,
        subscriptionId: notification.subscriptionId,
      });
      continue;
    }

    const expiresAt = new Date(
      notification.subscriptionExpirationDateTime,
    ).getTime();
    const minutesLeft = (expiresAt - Date.now()) / 60_000;
    if (minutesLeft < 10) {
      try {
        await renewSubscription(notification.subscriptionId, accessToken);
        logger.info("Subscription renewed", {
          connectionId,
          subscriptionId: notification.subscriptionId,
        });
      } catch (err) {
        logger.error("Failed to renew subscription", {
          connectionId,
          error: String(err),
        });
      }
    }

    if (notification.changeType !== "created") continue;

    const parsed = parseResource(notification.resource);
    if (!parsed) continue;

    const message = await getMessage(
      parsed.teamId,
      parsed.channelId,
      parsed.messageId,
      accessToken,
    );
    if (!message) continue;

    if (message.from?.application && !message.from?.user) continue;

    logger.info("Publishing teams.message.received", {
      connectionId,
      teamId: parsed.teamId,
      channelId: parsed.channelId,
      messageId: parsed.messageId,
      sender: message.from?.user?.displayName,
    });

    publishMessageReceived(
      connectionId,
      parsed.teamId,
      parsed.channelId,
      message,
    );
  }
}
