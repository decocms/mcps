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
  hangoutLink: z.string().optional().describe("Google Meet link"),
  colorId: z.string().optional().describe("Event color ID"),
  visibility: z
    .enum(["default", "public", "private", "confidential"])
    .optional()
    .describe("Event visibility"),
});

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
      console.log("HI!!");
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
        events: response.items.map((event) => ({
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
          hangoutLink: event.hangoutLink,
          colorId: event.colorId,
          visibility: event.visibility,
        })),
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

      return {
        event: {
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
          hangoutLink: event.hangoutLink,
          colorId: event.colorId,
          visibility: event.visibility,
        },
      };
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

      const event = await client.createEvent({
        calendarId: context.calendarId || PRIMARY_CALENDAR,
        summary: context.summary,
        description: context.description,
        location: context.location,
        start: context.start,
        end: context.end,
        attendees: context.attendees,
        reminders: context.reminders,
        colorId: context.colorId,
        visibility: context.visibility,
        sendUpdates: context.sendUpdates,
      });

      return {
        event: {
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
          hangoutLink: event.hangoutLink,
          colorId: event.colorId,
          visibility: event.visibility,
        },
      };
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

      const event = await client.updateEvent({
        calendarId: context.calendarId || PRIMARY_CALENDAR,
        eventId: context.eventId,
        summary: context.summary,
        description: context.description,
        location: context.location,
        start: context.start,
        end: context.end,
        attendees: context.attendees,
        colorId: context.colorId,
        visibility: context.visibility,
        sendUpdates: context.sendUpdates,
      });

      return {
        event: {
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
          hangoutLink: event.hangoutLink,
          colorId: event.colorId,
          visibility: event.visibility,
        },
      };
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

      await client.deleteEvent(
        context.calendarId || PRIMARY_CALENDAR,
        context.eventId,
        context.sendUpdates,
      );

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

      const event = await client.quickAddEvent(
        context.calendarId || PRIMARY_CALENDAR,
        context.text,
        context.sendUpdates,
      );

      return {
        event: {
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
          hangoutLink: event.hangoutLink,
          colorId: event.colorId,
          visibility: event.visibility,
        },
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
];
