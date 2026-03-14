import type { Env } from "../main.ts";
import type { Event } from "./types.ts";

async function publish(
  env: Env,
  event: { type: string; subject: string; data: Record<string, unknown> },
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS?.EVENT_PUBLISH(event);
    console.log(`[EventBus] Published ${event.type}: ${event.subject}`);
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish ${event.type}:`,
      error instanceof Error ? error.message : error,
    );
  }
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

export async function publishEventUpcoming(
  env: Env,
  event: Event,
  calendarId?: string,
  minutesUntilStart?: number,
): Promise<void> {
  await publish(env, {
    type: "google-calendar.event.upcoming",
    subject: event.id,
    data: {
      ...eventData(event, calendarId),
      minutes_until_start: minutesUntilStart,
    },
  });
}

export async function publishEventCreated(
  env: Env,
  event: Event,
  calendarId?: string,
): Promise<void> {
  await publish(env, {
    type: "google-calendar.event.created",
    subject: event.id,
    data: eventData(event, calendarId),
  });
}

export async function publishEventUpdated(
  env: Env,
  event: Event,
  calendarId?: string,
): Promise<void> {
  await publish(env, {
    type: "google-calendar.event.updated",
    subject: event.id,
    data: eventData(event, calendarId),
  });
}

export async function publishEventDeleted(
  env: Env,
  eventId: string,
  calendarId?: string,
): Promise<void> {
  await publish(env, {
    type: "google-calendar.event.deleted",
    subject: eventId,
    data: { event_id: eventId, calendar_id: calendarId },
  });
}
