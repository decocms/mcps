/**
 * Event Management Tools
 *
 * Tools for listing, getting, creating, updating, and deleting events
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleCalendarClient, getAccessToken } from "../lib/google-client.ts";
import { PRIMARY_CALENDAR } from "../constants.ts";
import {
  publishEventCreated,
  publishEventUpdated,
  publishEventDeleted,
  publishEventUpcoming,
} from "../lib/event-publisher.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const EventDateTimeSchema = z.object({
  date: z
    .string()
    .optional()
    .describe("Date for all-day events (YYYY-MM-DD format)"),
  dateTime: z
    .string()
    .optional()
    .describe(
      "DateTime for timed events (RFC3339 format, e.g., 2024-01-15T10:00:00-03:00)",
    ),
  timeZone: z
    .string()
    .optional()
    .describe("Timezone (e.g., 'America/Sao_Paulo')"),
});

const AttendeeSchema = z.object({
  email: z.email().describe("Attendee email address"),
  displayName: z.string().optional().describe("Attendee display name"),
  optional: z.boolean().optional().describe("Whether attendance is optional"),
  responseStatus: z
    .enum(["needsAction", "declined", "tentative", "accepted"])
    .optional()
    .describe("Attendee response status"),
});

const ReminderSchema = z.object({
  method: z.enum(["email", "popup"]).describe("Reminder method"),
  minutes: z.coerce
    .number()
    .int()
    .min(0)
    .describe("Minutes before event to remind"),
});

const EventSchema = z.object({
  id: z.string().describe("Event ID"),
  summary: z.string().optional().describe("Event title"),
  description: z.string().optional().describe("Event description"),
  location: z.string().optional().describe("Event location"),
  start: EventDateTimeSchema.describe("Event start time"),
  end: EventDateTimeSchema.describe("Event end time"),
  status: z
    .enum(["confirmed", "tentative", "cancelled"])
    .optional()
    .describe("Event status"),
  htmlLink: z
    .string()
    .optional()
    .describe("Link to the event in Google Calendar"),
  created: z.string().optional().describe("Creation timestamp"),
  updated: z.string().optional().describe("Last update timestamp"),
  creator: z
    .object({
      email: z.string().optional(),
      displayName: z.string().optional(),
      self: z.boolean().optional(),
    })
    .optional()
    .describe("Event creator"),
  organizer: z
    .object({
      email: z.string().optional(),
      displayName: z.string().optional(),
      self: z.boolean().optional(),
    })
    .optional()
    .describe("Event organizer"),
  attendees: z.array(AttendeeSchema).optional().describe("Event attendees"),
  recurrence: z
    .array(z.string())
    .optional()
    .describe("Recurrence rules (RRULE format)"),
  recurringEventId: z
    .string()
    .optional()
    .describe("ID of the recurring event this instance belongs to"),
  hangoutLink: z.string().optional().describe("Google Meet link"),
  conferenceData: z
    .object({
      entryPoints: z
        .array(
          z.object({
            entryPointType: z.string(),
            uri: z.string(),
            label: z.string().optional(),
          }),
        )
        .optional()
        .describe("Conference entry points (video, phone, etc.)"),
      conferenceSolution: z
        .object({
          name: z.string(),
          iconUri: z.string(),
        })
        .optional(),
      conferenceId: z.string().optional(),
    })
    .optional()
    .describe("Conference/video call data"),
  colorId: z.string().optional().describe("Event color ID"),
  visibility: z
    .enum(["default", "public", "private", "confidential"])
    .optional()
    .describe("Event visibility"),
});

// ============================================================================
// Helper: Map API Event to output schema
// ============================================================================

function mapEvent(event: import("../lib/types.ts").Event) {
  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    status: event.status,
    htmlLink: event.htmlLink,
    created: event.created,
    updated: event.updated,
    creator: event.creator,
    organizer: event.organizer,
    attendees: event.attendees?.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.displayName,
      optional: attendee.optional,
      responseStatus: attendee.responseStatus,
    })),
    recurrence: event.recurrence,
    recurringEventId: event.recurringEventId,
    hangoutLink: event.hangoutLink,
    conferenceData: event.conferenceData
      ? {
          entryPoints: event.conferenceData.entryPoints?.map((ep) => ({
            entryPointType: ep.entryPointType,
            uri: ep.uri,
            label: ep.label,
          })),
          conferenceSolution: event.conferenceData.conferenceSolution
            ? {
                name: event.conferenceData.conferenceSolution.name,
                iconUri: event.conferenceData.conferenceSolution.iconUri,
              }
            : undefined,
          conferenceId: event.conferenceData.conferenceId,
        }
      : undefined,
    colorId: event.colorId,
    visibility: event.visibility,
  };
}

// ============================================================================
// List Events Tool
// ============================================================================

export const createListEventsTool = (env: Env) =>
  createPrivateTool({
    id: "list_events",
    description:
      "List events from a calendar with optional filters for date range, search query, and pagination.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .optional()
        .describe("Calendar ID (default: 'primary')"),
      timeMin: z
        .string()
        .optional()
        .describe(
          "Start of time range (RFC3339 format). If not provided, defaults to 7 days ago. Required if singleEvents is true.",
        ),
      timeMax: z
        .string()
        .optional()
        .describe("End of time range (RFC3339 format)"),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(2500)
        .optional()
        .describe("Maximum number of events to return (default: 50)"),
      pageToken: z.string().optional().describe("Token for fetching next page"),
      q: z.string().optional().describe("Free text search query"),
      singleEvents: z
        .boolean()
        .optional()
        .describe("Expand recurring events into instances (requires timeMin)"),
      orderBy: z
        .enum(["startTime", "updated"])
        .optional()
        .describe("Order by field (startTime requires singleEvents=true)"),
      showDeleted: z.boolean().optional().describe("Include deleted events"),
    }),
    outputSchema: z.object({
      events: z.array(EventSchema).describe("List of events"),
      nextPageToken: z.string().optional().describe("Token for next page"),
      summary: z.string().optional().describe("Calendar name"),
      timeZone: z.string().optional().describe("Calendar timezone"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      // Se timeMin não for fornecido, usa 7 dias atrás como padrão
      let timeMin = context.timeMin;
      if (!timeMin) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        timeMin = sevenDaysAgo.toISOString();
      }

      const response = await client.listEvents({
        calendarId: context.calendarId || PRIMARY_CALENDAR,
        timeMin: timeMin,
        timeMax: context.timeMax,
        maxResults: context.maxResults,
        pageToken: context.pageToken,
        q: context.q,
        singleEvents: context.singleEvents,
        orderBy: context.orderBy,
        showDeleted: context.showDeleted,
      });

      return {
        events: response.items.map(mapEvent),
        nextPageToken: response.nextPageToken,
        summary: response.summary,
        timeZone: response.timeZone,
      };
    },
  });

// ============================================================================
// Get Event Tool
// ============================================================================

export const createGetEventTool = (env: Env) =>
  createPrivateTool({
    id: "get_event",
    description: "Get detailed information about a specific event by its ID.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .optional()
        .describe("Calendar ID (default: 'primary')"),
      eventId: z.string().describe("Event ID"),
    }),
    outputSchema: z.object({
      event: EventSchema.describe("Event details"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const event = await client.getEvent(
        context.calendarId || PRIMARY_CALENDAR,
        context.eventId,
      );

      return { event: mapEvent(event) };
    },
  });

// ============================================================================
// Create Event Tool
// ============================================================================

export const createCreateEventTool = (env: Env) =>
  createPrivateTool({
    id: "create_event",
    description:
      "Create a new event in a calendar. Supports attendees, reminders, and all-day or timed events.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .optional()
        .describe("Calendar ID (default: 'primary')"),
      summary: z.string().describe("Event title"),
      description: z.string().optional().describe("Event description"),
      location: z.string().optional().describe("Event location"),
      start: EventDateTimeSchema.describe(
        "Event start (use 'date' for all-day, 'dateTime' for timed events)",
      ),
      end: EventDateTimeSchema.describe(
        "Event end (use 'date' for all-day, 'dateTime' for timed events)",
      ),
      attendees: z
        .array(
          z.object({
            email: z.email().describe("Attendee email"),
            displayName: z.string().optional().describe("Display name"),
            optional: z.boolean().optional().describe("Is attendance optional"),
          }),
        )
        .optional()
        .describe("List of attendees to invite"),
      recurrence: z
        .array(z.string())
        .optional()
        .describe(
          "Recurrence rules (RRULE format). Examples: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'], ['RRULE:FREQ=DAILY;COUNT=10'], ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15']",
        ),
      addGoogleMeet: z
        .boolean()
        .optional()
        .describe(
          "Add a Google Meet video conference link to this event automatically",
        ),
      reminders: z
        .object({
          useDefault: z.boolean().describe("Use default reminders"),
          overrides: z
            .array(ReminderSchema)
            .optional()
            .describe("Custom reminders"),
        })
        .optional()
        .describe("Reminder settings"),
      colorId: z.string().optional().describe("Event color ID (1-11)"),
      visibility: z
        .enum(["default", "public", "private", "confidential"])
        .optional()
        .describe("Event visibility"),
      guestsCanSeeOtherGuests: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether guests can see other attendees (default: true)"),
      sendUpdates: z
        .enum(["all", "externalOnly", "none"])
        .optional()
        .describe("Who should receive email notifications"),
    }),
    outputSchema: z.object({
      event: EventSchema.describe("Created event"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendarId = context.calendarId || PRIMARY_CALENDAR;
      const event = await client.createEvent({
        calendarId,
        summary: context.summary,
        description: context.description,
        location: context.location,
        start: context.start,
        end: context.end,
        recurrence: context.recurrence,
        attendees: context.attendees,
        reminders: context.reminders,
        colorId: context.colorId,
        visibility: context.visibility,
        guestsCanSeeOtherGuests: context.guestsCanSeeOtherGuests ?? true,
        sendUpdates: context.sendUpdates,
        ...(context.addGoogleMeet
          ? {
              conferenceDataVersion: 1 as const,
              conferenceData: {
                createRequest: {
                  requestId: crypto.randomUUID(),
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              },
            }
          : {}),
      });

      publishEventCreated(env, event, calendarId);

      return { event: mapEvent(event) };
    },
  });

// ============================================================================
// Update Event Tool
// ============================================================================

export const createUpdateEventTool = (env: Env) =>
  createPrivateTool({
    id: "update_event",
    description:
      "Update an existing event. Only provided fields will be updated.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .optional()
        .describe("Calendar ID (default: 'primary')"),
      eventId: z.string().describe("Event ID to update"),
      summary: z.string().optional().describe("New event title"),
      description: z.string().optional().describe("New event description"),
      location: z.string().optional().describe("New event location"),
      start: EventDateTimeSchema.optional().describe("New start time"),
      end: EventDateTimeSchema.optional().describe("New end time"),
      recurrence: z
        .array(z.string())
        .optional()
        .describe("Updated recurrence rules (RRULE format)"),
      attendees: z
        .array(
          z.object({
            email: z.email(),
            displayName: z.string().optional(),
            optional: z.boolean().optional(),
          }),
        )
        .optional()
        .describe("Updated attendees list"),
      colorId: z.string().optional().describe("New color ID"),
      visibility: z
        .enum(["default", "public", "private", "confidential"])
        .optional()
        .describe("New visibility setting"),
      guestsCanSeeOtherGuests: z
        .boolean()
        .optional()
        .describe("Whether guests can see other attendees"),
      sendUpdates: z
        .enum(["all", "externalOnly", "none"])
        .optional()
        .describe("Who should receive email notifications"),
    }),
    outputSchema: z.object({
      event: EventSchema.describe("Updated event"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendarId = context.calendarId || PRIMARY_CALENDAR;
      const event = await client.updateEvent({
        calendarId,
        eventId: context.eventId,
        summary: context.summary,
        description: context.description,
        location: context.location,
        start: context.start,
        end: context.end,
        recurrence: context.recurrence,
        attendees: context.attendees,
        colorId: context.colorId,
        visibility: context.visibility,
        guestsCanSeeOtherGuests: context.guestsCanSeeOtherGuests,
        sendUpdates: context.sendUpdates,
      });

      publishEventUpdated(env, event, calendarId);

      return { event: mapEvent(event) };
    },
  });

// ============================================================================
// Delete Event Tool
// ============================================================================

export const createDeleteEventTool = (env: Env) =>
  createPrivateTool({
    id: "delete_event",
    description: "Delete an event from a calendar.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .optional()
        .describe("Calendar ID (default: 'primary')"),
      eventId: z.string().describe("Event ID to delete"),
      sendUpdates: z
        .enum(["all", "externalOnly", "none"])
        .optional()
        .describe("Who should receive cancellation notifications"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendarId = context.calendarId || PRIMARY_CALENDAR;
      await client.deleteEvent(
        calendarId,
        context.eventId,
        context.sendUpdates,
      );

      publishEventDeleted(env, context.eventId, calendarId);

      return {
        success: true,
        message: `Event ${context.eventId} deleted successfully`,
      };
    },
  });

// ============================================================================
// Quick Add Event Tool
// ============================================================================

export const createQuickAddEventTool = (env: Env) =>
  createPrivateTool({
    id: "quick_add_event",
    description:
      "Create an event using natural language text. Google Calendar will parse the text to extract event details like date, time, and title. Examples: 'Meeting with John tomorrow at 3pm', 'Dentist appointment on Friday at 10am'",
    inputSchema: z.object({
      calendarId: z
        .string()
        .optional()
        .describe("Calendar ID (default: 'primary')"),
      text: z
        .string()
        .describe(
          "Natural language description of the event (e.g., 'Meeting with John tomorrow at 3pm')",
        ),
      sendUpdates: z
        .enum(["all", "externalOnly", "none"])
        .optional()
        .describe("Who should receive email notifications"),
    }),
    outputSchema: z.object({
      event: EventSchema.describe("Created event"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendarId = context.calendarId || PRIMARY_CALENDAR;
      const event = await client.quickAddEvent(
        calendarId,
        context.text,
        context.sendUpdates,
      );

      publishEventCreated(env, event, calendarId);

      return { event: mapEvent(event) };
    },
  });

// ============================================================================
// Respond to Event Tool (RSVP)
// ============================================================================

export const createRespondToEventTool = (env: Env) =>
  createPrivateTool({
    id: "respond_to_event",
    description:
      "Respond to an event invitation (accept, decline, or tentative). Updates your RSVP status for the event.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .optional()
        .describe("Calendar ID (default: 'primary')"),
      eventId: z.string().describe("Event ID to respond to"),
      response: z
        .enum(["accepted", "declined", "tentative"])
        .describe("Your response to the event invitation"),
      sendUpdates: z
        .enum(["all", "externalOnly", "none"])
        .optional()
        .describe("Who should receive email notifications about the response"),
    }),
    outputSchema: z.object({
      event: EventSchema.describe("Updated event with your response"),
      previousStatus: z
        .string()
        .optional()
        .describe("Your previous response status"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendarId = context.calendarId || PRIMARY_CALENDAR;

      // Get the current event to find our attendee entry
      const currentEvent = await client.getEvent(calendarId, context.eventId);

      const selfAttendee = currentEvent.attendees?.find((a) => a.self);
      const previousStatus = selfAttendee?.responseStatus;

      // Update the attendees list with our new response
      const updatedAttendees = currentEvent.attendees?.map((a) =>
        a.self
          ? {
              ...a,
              responseStatus: context.response as
                | "accepted"
                | "declined"
                | "tentative",
            }
          : a,
      );

      await client.updateEvent({
        calendarId,
        eventId: context.eventId,
        attendees: updatedAttendees?.map((a) => ({
          email: a.email,
          displayName: a.displayName,
          optional: a.optional,
        })),
        sendUpdates: context.sendUpdates,
      });

      // Re-fetch to get the updated responseStatus
      const updatedEvent = await client.getEvent(calendarId, context.eventId);

      publishEventUpdated(env, updatedEvent, calendarId);

      return {
        event: mapEvent(updatedEvent),
        previousStatus,
      };
    },
  });

// ============================================================================
// List Event Instances Tool
// ============================================================================

export const createListEventInstancesTool = (env: Env) =>
  createPrivateTool({
    id: "list_event_instances",
    description:
      "List individual instances of a recurring event. Useful for seeing when a weekly meeting occurs, modifying specific instances, etc.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .optional()
        .describe("Calendar ID (default: 'primary')"),
      eventId: z
        .string()
        .describe("ID of the recurring event to list instances for"),
      timeMin: z
        .string()
        .optional()
        .describe("Start of time range (RFC3339 format)"),
      timeMax: z
        .string()
        .optional()
        .describe("End of time range (RFC3339 format)"),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(2500)
        .optional()
        .describe("Maximum number of instances to return (default: 50)"),
      pageToken: z.string().optional().describe("Token for fetching next page"),
    }),
    outputSchema: z.object({
      instances: z.array(EventSchema).describe("List of event instances"),
      nextPageToken: z.string().optional().describe("Token for next page"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listEventInstances({
        calendarId: context.calendarId || PRIMARY_CALENDAR,
        eventId: context.eventId,
        timeMin: context.timeMin,
        timeMax: context.timeMax,
        maxResults: context.maxResults,
        pageToken: context.pageToken,
      });

      return {
        instances: response.items.map(mapEvent),
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// Check Upcoming Events Tool
// ============================================================================

export const createCheckUpcomingEventsTool = (env: Env) =>
  createPrivateTool({
    id: "check_upcoming_events",
    description:
      "Check for calendar events starting within the next N minutes and emit them to the event bus. Designed to be called periodically by the mesh.",
    inputSchema: z.object({
      minutesAhead: z.coerce
        .number()
        .int()
        .min(1)
        .max(1440)
        .optional()
        .default(15)
        .describe(
          "How many minutes ahead to search for events (default: 15). Use a value slightly larger than the cron interval for safety overlap.",
        ),
      notifyWithinMinutes: z.coerce
        .number()
        .int()
        .min(1)
        .max(1440)
        .optional()
        .describe(
          "Only emit events to the event bus if they start within this many minutes. When set, events found in the search window but beyond this threshold are returned but NOT emitted. Use this to avoid duplicate notifications when using overlap (e.g., cron every 10 min, minutesAhead=12, notifyWithinMinutes=10).",
        ),
      calendarId: z
        .string()
        .optional()
        .describe("Calendar to check (default: 'primary')."),
    }),
    outputSchema: z.object({
      eventsFound: z.number().describe("Number of upcoming events found"),
      eventsNotified: z
        .number()
        .describe("Number of events emitted to the event bus"),
      events: z
        .array(
          z.object({
            id: z.string(),
            summary: z.string().optional(),
            start: EventDateTimeSchema,
            end: EventDateTimeSchema,
            minutesUntilStart: z.number().optional(),
            attendees: z
              .array(
                z.object({
                  email: z.string(),
                  displayName: z.string().optional(),
                  organizer: z.boolean().optional(),
                  self: z.boolean().optional(),
                  responseStatus: z
                    .enum(["needsAction", "declined", "tentative", "accepted"])
                    .optional(),
                }),
              )
              .optional()
              .describe("List of event attendees with their response status"),
            notified: z
              .boolean()
              .describe("Whether this event was emitted to the event bus"),
          }),
        )
        .describe("List of upcoming events"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendarId = context.calendarId || PRIMARY_CALENDAR;
      const minutesAhead = context.minutesAhead ?? 15;
      const notifyThreshold = context.notifyWithinMinutes ?? minutesAhead;
      const now = new Date();
      const ahead = new Date(now.getTime() + minutesAhead * 60 * 1000);

      const allItems: import("../lib/types.ts").Event[] = [];
      let pageToken: string | undefined;

      do {
        const response = await client.listEvents({
          calendarId,
          timeMin: now.toISOString(),
          timeMax: ahead.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          pageToken,
        });

        allItems.push(...(response.items ?? []));
        pageToken = response.nextPageToken;
      } while (pageToken);

      let eventsNotified = 0;

      const events = allItems.map((event) => {
        const startTime = event.start?.dateTime || event.start?.date;
        const minutesUntilStart = startTime
          ? Math.round((new Date(startTime).getTime() - now.getTime()) / 60000)
          : undefined;

        const shouldNotify =
          minutesUntilStart !== undefined &&
          minutesUntilStart <= notifyThreshold;

        if (shouldNotify) {
          publishEventUpcoming(env, event, calendarId, minutesUntilStart);
          eventsNotified++;
        }

        return {
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          attendees: event.attendees?.map((a) => ({
            email: a.email,
            displayName: a.displayName,
            organizer: a.organizer,
            self: a.self,
            responseStatus: a.responseStatus,
          })),
          minutesUntilStart,
          notified: shouldNotify,
        };
      });

      return {
        eventsFound: allItems.length,
        eventsNotified,
        events,
      };
    },
  });

// ============================================================================
// Export all event tools
// ============================================================================

export const eventTools = [
  createListEventsTool,
  createGetEventTool,
  createCreateEventTool,
  createUpdateEventTool,
  createDeleteEventTool,
  createQuickAddEventTool,
  createRespondToEventTool,
  createListEventInstancesTool,
  createCheckUpcomingEventsTool,
];
