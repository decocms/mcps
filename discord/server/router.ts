/**
 * HTTP router. Currently exposes only /health — the gateway client receives
 * all Discord events via WebSocket, so we don't need an interactions
 * webhook endpoint. If a future deployment requires HTTP-only mode,
 * wire it up here.
 */

import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "discord-events" });
});
