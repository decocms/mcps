/**
 * Trigger definitions + Supabase-backed storage for Google Calendar.
 *
 * Events are fed in by a per-user Google Apps Script (time-driven trigger for
 * `event.upcoming`, installable `onEventUpdated` for created/updated/deleted)
 * that POSTs to /calendar/events/:connectionId. The router validates the
 * request and calls `triggers.notify()`, which reads the callbackUrl/token
 * from the store below and forwards the event to the studio automation.
 */

import { createTriggers, type TriggerStorage } from "@decocms/runtime/triggers";
import {
  saveTriggerCredentials,
  loadTriggerCredentials,
  deleteTriggerCredentials,
} from "./supabase-client.ts";
import { z } from "zod";

/**
 * Supabase-backed trigger storage.
 * Uses static SUPABASE_URL / SUPABASE_ANON_KEY env vars (never expire).
 */
class SupabaseTriggerStorage implements TriggerStorage {
  async get(connectionId: string) {
    const result = await loadTriggerCredentials(connectionId);
    console.log(
      `[TriggerStorage] GET ${connectionId}: ${result ? "found credentials" : "empty"}`,
    );
    return result;
  }

  // deno-lint-ignore no-explicit-any
  async set(connectionId: string, state: any) {
    console.log(`[TriggerStorage] SET ${connectionId}: saving credentials`);
    await saveTriggerCredentials(connectionId, state);
  }

  async delete(connectionId: string) {
    try {
      console.log(`[TriggerStorage] DELETE ${connectionId}`);
      await deleteTriggerCredentials(connectionId);
    } catch (error) {
      console.error(
        `[TriggerStorage] DELETE ${connectionId} failed:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

const storage = new SupabaseTriggerStorage();

/** Trigger types the calendar MCP can emit (also the inbound webhook allow-list). */
export const CALENDAR_TRIGGER_TYPES = [
  "google-calendar.event.upcoming",
  "google-calendar.event.created",
  "google-calendar.event.updated",
  "google-calendar.event.deleted",
] as const;

const calendarIdParam = z.object({
  calendar_id: z
    .string()
    .optional()
    .describe("Filter by calendar ID. Leave empty for all calendars."),
});

export const triggers = createTriggers({
  definitions: [
    {
      type: "google-calendar.event.upcoming",
      description:
        "Triggered shortly before an event starts. Fired by the user's Google " +
        "Apps Script when an upcoming event falls within its configured lead " +
        "time (LEAD_MINUTES). Payload carries: `event_id`, `summary`, `start`, " +
        "`end`, `minutes_until_start`, `location`, `hangout_link`, `html_link`, " +
        "`attendees`. Use it to notify the user that a meeting is about to begin.",
      params: calendarIdParam,
    },
    {
      type: "google-calendar.event.created",
      description:
        "Triggered when a new event is added to the calendar (detected by the " +
        "Apps Script `onEventUpdated` installable trigger). Payload carries the " +
        "event details (`event_id`, `summary`, `start`, `end`, etc.).",
      params: calendarIdParam,
    },
    {
      type: "google-calendar.event.updated",
      description:
        "Triggered when an existing event is modified. Payload carries the " +
        "updated event details.",
      params: calendarIdParam,
    },
    {
      type: "google-calendar.event.deleted",
      description:
        "Triggered when an event is removed/cancelled. Payload carries at least " +
        "`event_id` and `calendar_id`.",
      params: calendarIdParam,
    },
  ],
  storage,
});
