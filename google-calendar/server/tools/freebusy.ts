/**
 * Free/Busy Tool
 *
 * Tool for checking availability across calendars
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleCalendarClient, getAccessToken } from "../lib/google-client.ts";
import { PRIMARY_CALENDAR } from "../constants.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const BusyPeriodSchema = z.object({
  start: z.string().describe("Start time of busy period (RFC3339)"),
  end: z.string().describe("End time of busy period (RFC3339)"),
});

const CalendarFreeBusySchema = z.object({
  calendarId: z.string().describe("Calendar ID"),
  busy: z.array(BusyPeriodSchema).describe("List of busy time periods"),
  errors: z
    .array(
      z.object({
        domain: z.string(),
        reason: z.string(),
      }),
    )
    .optional()
    .describe("Any errors for this calendar"),
});

// ============================================================================
// Get FreeBusy Tool
// ============================================================================

export const createGetFreeBusyTool = (env: Env) =>
  createPrivateTool({
    id: "get_freebusy",
    description:
      "Check free/busy information for one or more calendars within a time range. Useful for finding available meeting times or checking someone's availability.",
    inputSchema: z.object({
      timeMin: z
        .string()
        .describe(
          "Start of the time range to query (RFC3339 format, e.g., '2024-01-15T00:00:00Z')",
        ),
      timeMax: z
        .string()
        .describe(
          "End of the time range to query (RFC3339 format, e.g., '2024-01-22T00:00:00Z')",
        ),
      calendarIds: z
        .array(z.string())
        .optional()
        .describe(
          "List of calendar IDs to query. Defaults to ['primary'] if not specified.",
        ),
      timeZone: z
        .string()
        .optional()
        .describe("Timezone for the query (e.g., 'America/Sao_Paulo')"),
    }),
    outputSchema: z.object({
      timeMin: z.string().describe("Start of queried time range"),
      timeMax: z.string().describe("End of queried time range"),
      calendars: z
        .array(CalendarFreeBusySchema)
        .describe("Free/busy information for each calendar"),
    }),
    execute: async ({ context }) => {
      const client = new GoogleCalendarClient({
        accessToken: getAccessToken(env),
      });

      const calendarIds = context.calendarIds || [PRIMARY_CALENDAR];

      const response = await client.getFreeBusy({
        timeMin: context.timeMin,
        timeMax: context.timeMax,
        timeZone: context.timeZone,
        items: calendarIds.map((id) => ({ id })),
      });

      const calendars = Object.entries(response.calendars).map(
        ([calendarId, data]) => ({
          calendarId,
          busy: data.busy,
          errors: data.errors,
        }),
      );

      return {
        timeMin: response.timeMin,
        timeMax: response.timeMax,
        calendars,
      };
    },
  });

// ============================================================================
// Export freebusy tools
// ============================================================================

export const freebusyTools = [createGetFreeBusyTool];
