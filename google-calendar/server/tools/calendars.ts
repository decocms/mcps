/**
 * Calendar Management Tools
 *
 * Tools for listing, getting, creating, and deleting calendars
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleCalendarClient, getAccessToken } from "../lib/google-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const CalendarSchema = z.object({
  id: z.string().describe("Calendar ID"),
  summary: z.string().describe("Calendar name/title"),
  description: z.string().optional().describe("Calendar description"),
  location: z.string().optional().describe("Geographic location"),
  timeZone: z.string().optional().describe("Calendar timezone"),
  accessRole: z.string().optional().describe("User's access role"),
  primary: z
    .boolean()
    .optional()
    .describe("Whether this is the primary calendar"),
  backgroundColor: z.string().optional().describe("Background color"),
  foregroundColor: z.string().optional().describe("Foreground color"),
});

// ============================================================================
// List Calendars Tool
// ============================================================================

export const createListCalendarsTool = (env: Env) =>
  createPrivateTool({
    id: "list_calendars",
    description:
      "List all calendars accessible by the authenticated user. Returns calendar IDs, names, colors, and access roles.",
    inputSchema: z.object({
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(250)
        .optional()
        .describe("Maximum number of calendars to return (default: 50)"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
    }),
    outputSchema: z.object({
      calendars: z.array(CalendarSchema).describe("List of calendars"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listCalendars(
        context.pageToken,
        context.maxResults,
      );

      return {
        calendars: response.items.map((cal) => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description,
          location: cal.location,
          timeZone: cal.timeZone,
          accessRole: cal.accessRole,
          primary: cal.primary,
          backgroundColor: cal.backgroundColor,
          foregroundColor: cal.foregroundColor,
        })),
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Calendar Tool
// ============================================================================

export const createGetCalendarTool = (env: Env) =>
  createPrivateTool({
    id: "get_calendar",
    description:
      "Get detailed information about a specific calendar by its ID.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .describe(
          "Calendar ID (use 'primary' for the user's primary calendar)",
        ),
    }),
    outputSchema: z.object({
      calendar: CalendarSchema.describe("Calendar details"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendar = await client.getCalendar(context.calendarId);

      return {
        calendar: {
          id: calendar.id,
          summary: calendar.summary,
          description: calendar.description,
          location: calendar.location,
          timeZone: calendar.timeZone,
          accessRole: calendar.accessRole,
          primary: calendar.primary,
          backgroundColor: calendar.backgroundColor,
          foregroundColor: calendar.foregroundColor,
        },
      };
    },
  });

// ============================================================================
// Create Calendar Tool
// ============================================================================

export const createCreateCalendarTool = (env: Env) =>
  createPrivateTool({
    id: "create_calendar",
    description:
      "Create a new secondary calendar. Note: You cannot create a new primary calendar.",
    inputSchema: z.object({
      summary: z.string().describe("Name of the new calendar"),
      description: z
        .string()
        .optional()
        .describe("Description of the calendar"),
      location: z
        .string()
        .optional()
        .describe("Geographic location of the calendar"),
      timeZone: z
        .string()
        .optional()
        .describe("Timezone (e.g., 'America/Sao_Paulo', 'UTC')"),
    }),
    outputSchema: z.object({
      calendar: z.object({
        id: z.string().describe("ID of the created calendar"),
        summary: z.string().describe("Calendar name"),
        description: z.string().optional(),
        location: z.string().optional(),
        timeZone: z.string().optional(),
      }),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendar = await client.createCalendar({
        summary: context.summary,
        description: context.description,
        location: context.location,
        timeZone: context.timeZone,
      });

      return {
        calendar: {
          id: calendar.id,
          summary: calendar.summary,
          description: calendar.description,
          location: calendar.location,
          timeZone: calendar.timeZone,
        },
      };
    },
  });

// ============================================================================
// Delete Calendar Tool
// ============================================================================

export const createDeleteCalendarTool = (env: Env) =>
  createPrivateTool({
    id: "delete_calendar",
    description:
      "Delete a secondary calendar. Note: You cannot delete the primary calendar.",
    inputSchema: z.object({
      calendarId: z
        .string()
        .describe("ID of the calendar to delete (cannot be 'primary')"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      if (context.calendarId === "primary") {
        throw new Error("Cannot delete the primary calendar");
      }

      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteCalendar(context.calendarId);

      return {
        success: true,
        message: `Calendar ${context.calendarId} deleted successfully`,
      };
    },
  });

// ============================================================================
// Export all calendar tools
// ============================================================================

export const calendarTools = [
  createListCalendarsTool,
  createGetCalendarTool,
  createCreateCalendarTool,
  createDeleteCalendarTool,
];
