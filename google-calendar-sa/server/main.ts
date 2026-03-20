import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "google-calendar/tools";
import { GOOGLE_SCOPES } from "google-calendar/constants";
import { type Env, StateSchema } from "../shared/deco.gen.ts";
import { getServiceAccountAccessToken } from "./lib/service-account.ts";

export type { Env };

// Tools that fan out across all impersonated emails and merge/deduplicate results
const FAN_OUT_TOOLS = new Set([
  "list_events",
  "list_calendars",
  "get_freebusy",
  "check_upcoming_events",
  "find_available_slots",
]);

function deduplicateByEventId(results: Record<string, unknown>[]) {
  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];
  for (const result of results) {
    const items = (result as { events?: { id?: string }[] }).events;
    if (Array.isArray(items)) {
      for (const item of items) {
        const id = item.id;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        merged.push(item as unknown as Record<string, unknown>);
      }
    }
  }
  return merged;
}

function mergeResults(
  toolId: string,
  results: Record<string, unknown>[],
): Record<string, unknown> {
  if (results.length === 1) return results[0];

  if (toolId === "list_events" || toolId === "check_upcoming_events") {
    const deduped = deduplicateByEventId(results);
    const first = results[0];
    return {
      ...first,
      events: deduped,
    };
  }

  if (toolId === "list_calendars") {
    const seen = new Set<string>();
    const calendars: Record<string, unknown>[] = [];
    for (const r of results) {
      const items = (r as { calendars?: { id?: string }[] }).calendars;
      if (!Array.isArray(items)) continue;
      for (const cal of items) {
        if (cal.id && seen.has(cal.id)) continue;
        if (cal.id) seen.add(cal.id);
        calendars.push(cal as unknown as Record<string, unknown>);
      }
    }
    const first = results[0];
    return { ...first, calendars };
  }

  if (toolId === "get_freebusy") {
    const allCalendars: Record<string, unknown>[] = [];
    for (const r of results) {
      const cals = (r as { calendars?: Record<string, unknown>[] }).calendars;
      if (Array.isArray(cals)) allCalendars.push(...cals);
    }
    return { ...results[0], calendars: allCalendars };
  }

  if (toolId === "find_available_slots") {
    // Intersect available slots across all users — a slot is only available if ALL users are free
    const slotArrays = results.map(
      (r) =>
        ((r as { availableSlots?: { start: string; end: string }[] })
          .availableSlots ?? []) as { start: string; end: string }[],
    );
    if (slotArrays.length === 0) return { availableSlots: [], totalFound: 0 };

    let intersection = slotArrays[0];
    for (let i = 1; i < slotArrays.length; i++) {
      const next = slotArrays[i];
      const newIntersection: { start: string; end: string }[] = [];
      for (const a of intersection) {
        for (const b of next) {
          const start = a.start > b.start ? a.start : b.start;
          const end = a.end < b.end ? a.end : b.end;
          if (start < end) newIntersection.push({ start, end });
        }
      }
      intersection = newIntersection;
    }
    return {
      ...results[0],
      availableSlots: intersection,
      totalFound: intersection.length,
    };
  }

  return results[0];
}

const scopes = [GOOGLE_SCOPES.CALENDAR, GOOGLE_SCOPES.CALENDAR_EVENTS];

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: ["EVENT_BUS::*"],
    state: StateSchema,
  },
  events: {
    handlers: {
      SELF: {
        events: ["google-calendar.*"],
        handler: async ({ events }) => {
          for (const event of events) {
            console.log(`[SELF] Event: ${event.type}`);
          }
          return { success: true };
        },
      },
    },
  },
  // Always register tools — credentials are validated at execution time, not registration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: (env: Env) =>
    (tools as any[]).map((createTool: (env: any) => any) => {
      const tool = createTool(env);
      const originalExecute = tool.execute;
      const shouldFanOut = FAN_OUT_TOOLS.has(tool.id);

      return {
        ...tool,
        // deno-lint-ignore no-explicit-any
        execute: async (args: any) => {
          const state = env.MESH_REQUEST_CONTEXT?.state;
          const json = state?.SERVICE_ACCOUNT_JSON;
          const emails = (state?.IMPERSONATE_EMAILS ?? [])
            .map((e: string) => e.trim())
            .filter(Boolean);

          if (!json || emails.length === 0) {
            throw new Error(
              "Service account not configured. Please fill in SERVICE_ACCOUNT_JSON and IMPERSONATE_EMAILS in the MCP settings.",
            );
          }

          const reqCtx = env.MESH_REQUEST_CONTEXT as unknown as Record<
            string,
            unknown
          >;

          // For write tools or single email, just use the first email
          if (!shouldFanOut || emails.length === 1) {
            const token = await getServiceAccountAccessToken(
              json,
              emails[0],
              scopes,
            );
            reqCtx.authorization = token;
            return originalExecute(args);
          }

          // Fan out: call for each email, merge results
          const results = await Promise.all(
            emails.map(async (email: string) => {
              const token = await getServiceAccountAccessToken(
                json,
                email,
                scopes,
              );
              reqCtx.authorization = token;
              return originalExecute(args);
            }),
          );

          return mergeResults(tool.id, results);
        },
      };
    }),
});

serve(runtime.fetch);
