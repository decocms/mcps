/**
 * HTTP Router for the Google Calendar MCP webhook bridge.
 *
 * Primary route: POST /calendar/events/:connectionId
 *   - Receives events from the user's Google Apps Script.
 *   - Verifies the per-connection HMAC token.
 *   - Forwards the event to the studio via triggers.notify(), which reads the
 *     callbackUrl/token persisted in Supabase by TRIGGER_CONFIGURE.
 *
 * A 404 from this router means "not a webhook route" — main.ts then falls
 * through to runtime.fetch (the /mcp endpoint).
 */

import { Hono } from "hono";
import { triggers, CALENDAR_TRIGGER_TYPES } from "./lib/trigger-store.ts";
import { verifyWebhookToken, bearerToken } from "./webhook.ts";

type CalendarTriggerType = (typeof CALENDAR_TRIGGER_TYPES)[number];

const ALLOWED_TYPES = new Set<string>(CALENDAR_TRIGGER_TYPES);

function isCalendarTriggerType(t: string): t is CalendarTriggerType {
  return ALLOWED_TYPES.has(t);
}

interface CalendarWebhookPayload {
  type?: string;
  data?: Record<string, unknown>;
}

export const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "google-calendar-mcp",
    ts: new Date().toISOString(),
  }),
);

app.post("/calendar/events/:connectionId", async (c) => {
  const connectionId = c.req.param("connectionId");
  const token = bearerToken(c.req.header("authorization"));

  const verified = await verifyWebhookToken(connectionId, token);
  if (!verified) {
    console.error(`[Calendar Webhook] Invalid token for ${connectionId}`);
    return c.json({ error: "Invalid token" }, 401);
  }

  let payload: CalendarWebhookPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const type = payload.type;
  if (!type || !isCalendarTriggerType(type)) {
    return c.json(
      {
        error: "Unknown event type",
        allowed: [...ALLOWED_TYPES],
      },
      400,
    );
  }

  const data = payload.data ?? {};

  try {
    // Fire-and-forget on a persistent process: the notify promise survives
    // without ctx.waitUntil() (unlike Cloudflare Workers). Awaited here so a
    // delivery error surfaces in logs and the response.
    await triggers.notify(connectionId, type, data);
  } catch (error) {
    console.error(
      `[Calendar Webhook] notify failed for ${connectionId} (${type}):`,
      error instanceof Error ? error.message : String(error),
    );
    // 200 anyway: the GAS dedup already marked this event as notified, and a
    // retry storm wouldn't help (likely a missing trigger config, not transient).
    return c.json({ ok: true, delivered: false });
  }

  return c.json({ ok: true, delivered: true });
});
