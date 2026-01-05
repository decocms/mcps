/**
 * Advanced Calendar Tools
 *
 * Additional tools for advanced calendar operations:
 * - move_event: Move events between calendars
 * - find_available_slots: Find free time slots across calendars
 * - duplicate_event: Create a copy of an existing event
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleCalendarClient, getAccessToken } from "../lib/google-client.ts";
import { PRIMARY_CALENDAR } from "../constants.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const TimeSlotSchema = z.object({
  start: z.string().describe("Start time of the available slot (ISO 8601)"),
  end: z.string().describe("End time of the available slot (ISO 8601)"),
});

const EventDateTimeSchema = z.object({
  date: z
    .string()
    .optional()
    .describe("Date for all-day events (YYYY-MM-DD format)"),
  dateTime: z
    .string()
    .optional()
    .describe("DateTime for timed events (RFC3339 format)"),
  timeZone: z
    .string()
    .optional()
    .describe("Timezone (e.g., 'America/Sao_Paulo')"),
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
});

// ============================================================================
// Move Event Tool
// ============================================================================

export const createMoveEventTool = (env: Env) =>
  createPrivateTool({
    id: "move_event",
    description:
      "Move an event from one calendar to another. The event will be removed from the source calendar and added to the destination calendar.",
    inputSchema: z.object({
      sourceCalendarId: z
        .string()
        .describe("Calendar ID where the event currently exists"),
      eventId: z.string().describe("Event ID to move"),
      destinationCalendarId: z
        .string()
        .describe("Calendar ID to move the event to"),
      sendUpdates: z
        .enum(["all", "externalOnly", "none"])
        .optional()
        .describe("Who should receive email notifications about the move"),
    }),
    outputSchema: z.object({
      event: EventSchema.describe("The moved event with its new details"),
      message: z.string().describe("Success message"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const event = await client.moveEvent(
        context.sourceCalendarId,
        context.eventId,
        context.destinationCalendarId,
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
        },
        message: `Event moved successfully from ${context.sourceCalendarId} to ${context.destinationCalendarId}`,
      };
    },
  });

// ============================================================================
// Find Available Slots Tool
// ============================================================================

export const createFindAvailableSlotsTool = (env: Env) =>
  createPrivateTool({
    id: "find_available_slots",
    description:
      "Find available time slots across one or more calendars. Useful for scheduling meetings by finding times when all participants are free.",
    inputSchema: z.object({
      calendarIds: z
        .array(z.string())
        .optional()
        .describe("List of calendar IDs to check. Defaults to ['primary']"),
      timeMin: z
        .string()
        .describe(
          "Start of the search range (RFC3339 format, e.g., '2024-01-15T08:00:00Z')",
        ),
      timeMax: z
        .string()
        .describe(
          "End of the search range (RFC3339 format, e.g., '2024-01-15T18:00:00Z')",
        ),
      slotDurationMinutes: z
        .number()
        .int()
        .min(5)
        .max(480)
        .describe(
          "Duration of each slot in minutes (e.g., 30 for 30-minute meetings)",
        ),
      timeZone: z
        .string()
        .optional()
        .describe("Timezone for the search (e.g., 'America/Sao_Paulo')"),
      maxSlots: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of slots to return (default: 10)"),
    }),
    outputSchema: z.object({
      availableSlots: z
        .array(TimeSlotSchema)
        .describe("List of available time slots"),
      totalFound: z.number().describe("Total number of available slots found"),
      searchRange: z.object({
        start: z.string().describe("Start of search range"),
        end: z.string().describe("End of search range"),
      }),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendarIds = context.calendarIds || [PRIMARY_CALENDAR];
      const maxSlots = context.maxSlots || 10;

      const slots = await client.findAvailableSlots(
        calendarIds,
        context.timeMin,
        context.timeMax,
        context.slotDurationMinutes,
        context.timeZone,
      );

      const limitedSlots = slots.slice(0, maxSlots);

      return {
        availableSlots: limitedSlots,
        totalFound: slots.length,
        searchRange: {
          start: context.timeMin,
          end: context.timeMax,
        },
      };
    },
  });

// ============================================================================
// Duplicate Event Tool
// ============================================================================

export const createDuplicateEventTool = (env: Env) =>
  createPrivateTool({
    id: "duplicate_event",
    description:
      "Create a copy of an existing event. You can optionally change the date/time and target calendar.",
    inputSchema: z.object({
      sourceCalendarId: z
        .string()
        .optional()
        .describe(
          "Calendar ID where the original event exists (default: 'primary')",
        ),
      eventId: z.string().describe("Event ID to duplicate"),
      targetCalendarId: z
        .string()
        .optional()
        .describe("Calendar ID for the new event (default: same as source)"),
      newStart: EventDateTimeSchema.optional().describe(
        "New start time for the duplicated event (keeps original if not provided)",
      ),
      newEnd: EventDateTimeSchema.optional().describe(
        "New end time for the duplicated event (keeps original if not provided)",
      ),
      newSummary: z
        .string()
        .optional()
        .describe(
          "New title for the duplicated event (adds 'Copy of' prefix if not provided)",
        ),
      sendUpdates: z
        .enum(["all", "externalOnly", "none"])
        .optional()
        .describe("Who should receive email notifications"),
    }),
    outputSchema: z.object({
      originalEvent: EventSchema.describe("The original event"),
      newEvent: EventSchema.describe("The newly created duplicate event"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const sourceCalendarId = context.sourceCalendarId || PRIMARY_CALENDAR;
      const targetCalendarId = context.targetCalendarId || sourceCalendarId;

      // Get the original event
      const originalEvent = await client.getEvent(
        sourceCalendarId,
        context.eventId,
      );

      // Create the duplicate
      const newEvent = await client.createEvent({
        calendarId: targetCalendarId,
        summary:
          context.newSummary || `Copy of ${originalEvent.summary || "Event"}`,
        description: originalEvent.description,
        location: originalEvent.location,
        start: context.newStart || originalEvent.start,
        end: context.newEnd || originalEvent.end,
        attendees: originalEvent.attendees?.map((a) => ({
          email: a.email,
          displayName: a.displayName,
          optional: a.optional,
        })),
        colorId: originalEvent.colorId,
        visibility: originalEvent.visibility,
        sendUpdates: context.sendUpdates,
      });

      return {
        originalEvent: {
          id: originalEvent.id,
          summary: originalEvent.summary,
          description: originalEvent.description,
          location: originalEvent.location,
          start: originalEvent.start,
          end: originalEvent.end,
          status: originalEvent.status,
          htmlLink: originalEvent.htmlLink,
        },
        newEvent: {
          id: newEvent.id,
          summary: newEvent.summary,
          description: newEvent.description,
          location: newEvent.location,
          start: newEvent.start,
          end: newEvent.end,
          status: newEvent.status,
          htmlLink: newEvent.htmlLink,
        },
      };
    },
  });

// ============================================================================
// Export all advanced tools
// ============================================================================

export const advancedTools = [
  createMoveEventTool,
  createFindAvailableSlotsTool,
  createDuplicateEventTool,
];
