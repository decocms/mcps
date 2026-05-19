/**
 * Diagnostic tools for inspecting events received by webhooks.
 *
 * Useful for validating end-to-end trigger flow without grepping bun logs.
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getRecentEvents, clearEvents } from "../lib/event-log.ts";
import { toErrorResponse } from "../lib/errors.ts";

function getConnectionId(env: Env): string {
  const id = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!id) throw new Error("No connectionId in request context");
  return id;
}

// ─── GET_RECENT_EVENTS ──────────────────────────────────────────────────

export const createGetRecentEventsTool = (env: Env) =>
  createTool({
    id: "GET_RECENT_EVENTS",
    description:
      "List the most recent webhook events this MCP has received and " +
      "published as triggers (up to 24h of history, max 200 per connection). " +
      "Useful for end-to-end debugging: confirm that 'teams.message.received' " +
      "actually fires when someone posts in a subscribed channel, and inspect " +
      "the exact payload that was delivered to subscribed agents. " +
      "Filter by `event_type` (e.g. 'teams.message.received') to narrow.",
    annotations: {
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        top: z
          .number()
          .default(20)
          .describe("Max events to return (default 20, newest first)."),
        event_type: z
          .string()
          .optional()
          .describe(
            "Filter by event type (e.g. 'teams.message.received'). Omit to return all types.",
          ),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      events: z
        .array(
          z.object({
            ts: z.string(),
            event_type: z.string(),
            trace_id: z.string().nullish(),
            payload: z.record(z.string(), z.any()),
          }),
        )
        .optional(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { top, event_type } = context as {
        top?: number;
        event_type?: string;
      };
      try {
        const connectionId = getConnectionId(env);
        const events = await getRecentEvents(
          connectionId,
          top ?? 20,
          event_type,
        );
        return {
          success: true,
          events: events.map((e) => ({
            ts: e.ts,
            event_type: e.event_type,
            trace_id: e.trace_id ?? null,
            payload: e.payload,
          })),
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── CLEAR_RECENT_EVENTS ────────────────────────────────────────────────

export const createClearRecentEventsTool = (env: Env) =>
  createTool({
    id: "CLEAR_RECENT_EVENTS",
    description:
      "Wipe all logged events for this connection. Use this to reset the " +
      "history between test runs so GET_RECENT_EVENTS returns only " +
      "fresh data.",
    annotations: { destructiveHint: true, openWorldHint: false },
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({
      success: z.boolean(),
      deleted: z.number().nullish(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async () => {
      try {
        const connectionId = getConnectionId(env);
        const deleted = await clearEvents(connectionId);
        return { success: true, deleted };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

export const eventTools = [
  createGetRecentEventsTool,
  createClearRecentEventsTool,
];
