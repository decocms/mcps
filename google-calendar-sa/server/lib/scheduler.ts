/**
 * Background scheduler for upcoming-meeting notifications.
 *
 * Runs as a `setInterval` in the kubernetes-bun process (same pattern as
 * Discord's health check and Slack's cleanup intervals). Each tick:
 *   1. Iterates all cached connections (populated by onChange).
 *   2. For each connection, fan-out across IMPERSONATE_EMAILS.
 *   3. List events starting within LEAD_MINUTES.
 *   4. Dedup in memory (key = eventId:email:startTime).
 *   5. triggers.notify() for each new upcoming event.
 */

import { GoogleCalendarClient } from "google-calendar/client";
import { GOOGLE_SCOPES } from "google-calendar/constants";
import { triggers } from "google-calendar/triggers";
import {
  getCachedConnections,
  type CachedConnection,
} from "./connection-cache.ts";
import { getServiceAccountAccessToken } from "./service-account.ts";

const scopes = [GOOGLE_SCOPES.CALENDAR, GOOGLE_SCOPES.CALENDAR_EVENTS];

const BUSINESS_HOUR_START = 9;
const BUSINESS_HOUR_END = 18;
const BUSINESS_TIMEZONE = "America/Sao_Paulo";

import { getSupabaseClient } from "google-calendar/supabase";

const DEDUP_TABLE = "calendar_notified_events";

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startScheduler(pollIntervalMs = 5 * 60 * 1000): void {
  if (intervalHandle) return;

  console.log(
    `[Scheduler] Starting (poll every ${Math.round(pollIntervalMs / 1000)}s)`,
  );

  // Run once immediately, then on interval
  tick().catch((err) => console.error("[Scheduler] Initial tick failed:", err));

  intervalHandle = setInterval(() => {
    tick().catch((err) => console.error("[Scheduler] Tick failed:", err));
  }, pollIntervalMs);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[Scheduler] Stopped");
  }
}

function isBusinessHours(): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(formatter.format(now), 10);
  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

async function tick(): Promise<void> {
  if (!isBusinessHours()) return;

  const connections = getCachedConnections();
  if (connections.length === 0) return;

  for (const conn of connections) {
    try {
      await scanConnection(conn);
    } catch (err) {
      console.error(
        `[Scheduler] Error scanning ${conn.connectionId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  cleanupOldNotifications().catch(() => {});
}

async function scanConnection(conn: CachedConnection): Promise<void> {
  const now = new Date();
  const ahead = new Date(now.getTime() + (conn.leadMinutes + 5) * 60 * 1000);

  const results = await Promise.all(
    conn.impersonateEmails.map(async (email) => {
      try {
        const token = await getServiceAccountAccessToken(
          conn.serviceAccountJson,
          email,
          scopes,
        );
        const client = new GoogleCalendarClient({ accessToken: token });
        const response = await client.listEvents({
          calendarId: "primary",
          timeMin: now.toISOString(),
          timeMax: ahead.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        });
        return { email, events: response.items ?? [] };
      } catch (err) {
        console.error(
          `[Scheduler] Failed to list events for ${email}:`,
          err instanceof Error ? err.message : String(err),
        );
        return { email, events: [] };
      }
    }),
  );

  // Deduplicate events across impersonated emails (same meeting invited to
  // multiple addresses). Use the first occurrence.
  const seenEventIds = new Set<string>();

  for (const { email, events } of results) {
    for (const event of events) {
      if (!event.id) continue;
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);

      // Skip all-day events (no dateTime = all-day)
      if (!event.start?.dateTime) continue;

      // Skip events without a meeting link
      if (!event.hangoutLink) continue;

      // Skip events with fewer than 2 non-bot attendees
      const realAttendees = (event.attendees ?? []).filter(
        (a) => !a.self && !a.resource,
      );
      if (realAttendees.length < 2) continue;

      const startTime = event.start.dateTime;

      const minutesUntilStart = Math.round(
        (new Date(startTime).getTime() - now.getTime()) / 60000,
      );
      if (minutesUntilStart < 0 || minutesUntilStart > conn.leadMinutes)
        continue;

      const dedupKey = `${conn.connectionId}:${event.id}:${startTime}`;
      if (await wasAlreadyNotified(dedupKey)) continue;

      try {
        await triggers.notify(
          conn.connectionId,
          "google-calendar.event.upcoming",
          {
            event_id: event.id,
            calendar_id: "primary",
            summary: event.summary,
            description: event.description,
            start: event.start,
            end: event.end,
            location: event.location,
            hangout_link: event.hangoutLink,
            html_link: event.htmlLink,
            minutes_until_start: minutesUntilStart,
            attendees: event.attendees?.map((a) => ({
              email: a.email,
              displayName: a.displayName,
              responseStatus: a.responseStatus,
            })),
            impersonated_email: email,
          },
        );
        await markNotified(dedupKey);
        console.log(
          `[Scheduler] Notified: "${event.summary}" in ${minutesUntilStart}m (${conn.connectionId})`,
        );
      } catch (err) {
        console.error(
          `[Scheduler] notify failed for ${event.id}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
}

async function wasAlreadyNotified(key: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { data } = await client
    .from(DEDUP_TABLE)
    .select("dedup_key")
    .eq("dedup_key", key)
    .maybeSingle();

  return !!data;
}

async function markNotified(key: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  await client.from(DEDUP_TABLE).upsert(
    {
      dedup_key: key,
      notified_at: new Date().toISOString(),
    } as never,
    { onConflict: "dedup_key" },
  );
}

async function cleanupOldNotifications(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await client.from(DEDUP_TABLE).delete().lt("notified_at", cutoff);
}
