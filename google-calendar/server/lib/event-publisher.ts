import type { Env } from "../main.ts";
import type { Event } from "./types.ts";

function publish(
  env: Env,
  event: { type: string; subject: string; data: Record<string, unknown> },
): void {
  const eventBus = env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS;
  if (!eventBus) return;

  eventBus.EVENT_PUBLISH(event).then(
    () => console.log(`[EventBus] Published ${event.type}: ${event.subject}`),
    (error: unknown) =>
      console.error(
        `[EventBus] Failed to publish ${event.type}:`,
        error instanceof Error ? error.message : error,
      ),
  );
}

function eventData(event: Event, calendarId?: string): Record<string, unknown> {
  return {
    event_id: event.id,
    calendar_id: calendarId,
    summary: event.summary,
    description: event.description,
    start: event.start,
    end: event.end,
    status: event.status,
    location: event.location,
    attendees: event.attendees,
    html_link: event.htmlLink,
    hangout_link: event.hangoutLink,
  };
}

export function publishEventUpcoming(
  env: Env,
  event: Event,
  calendarId?: string,
  minutesUntilStart?: number,
): void {
  publish(env, {
    type: "google-calendar.event.upcoming",
    subject: event.id,
    data: {
      ...eventData(event, calendarId),
      minutes_until_start: minutesUntilStart,
    },
  });
}

export function publishEventCreated(
  env: Env,
  event: Event,
  calendarId?: string,
): void {
  publish(env, {
    type: "google-calendar.event.created",
    subject: event.id,
    data: eventData(event, calendarId),
  });
}

export function publishEventUpdated(
  env: Env,
  event: Event,
  calendarId?: string,
): void {
  publish(env, {
    type: "google-calendar.event.updated",
    subject: event.id,
    data: eventData(event, calendarId),
  });
}

export function publishEventDeleted(
  env: Env,
  eventId: string,
  calendarId?: string,
): void {
  publish(env, {
    type: "google-calendar.event.deleted",
    subject: eventId,
    data: { event_id: eventId, calendar_id: calendarId },
  });
}
