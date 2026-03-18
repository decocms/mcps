import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";

function formatInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  });
  return formatter.format(date);
}

export const createGetCurrentTimeTool = (_env: Env) =>
  createPrivateTool({
    id: "get_current_time",
    description:
      "Get the current date and time. If a timezone is provided, returns the time in that timezone. If no timezone is provided, returns UTC and a list of common timezones with their current times.",
    inputSchema: z.object({
      timeZone: z
        .string()
        .optional()
        .describe(
          "IANA timezone (e.g., 'America/Sao_Paulo', 'US/Eastern', 'Europe/London'). If omitted, returns UTC and all common timezones.",
        ),
    }),
    outputSchema: z.object({
      utc: z.string().describe("Current UTC time in ISO 8601 format"),
      timeZone: z.string().optional().describe("Requested timezone"),
      localTime: z
        .string()
        .optional()
        .describe("Current time in the requested timezone"),
      timezones: z
        .array(
          z.object({
            timeZone: z.string(),
            localTime: z.string(),
          }),
        )
        .optional()
        .describe("List of common timezones with current times"),
    }),
    execute: async ({ context }) => {
      const now = new Date();
      const utc = now.toISOString();

      if (context.timeZone) {
        const localTime = formatInTimeZone(now, context.timeZone);

        return {
          utc,
          timeZone: context.timeZone,
          localTime,
        };
      }

      const commonTimezones = [
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "America/Sao_Paulo",
        "America/Argentina/Buenos_Aires",
        "America/Mexico_City",
        "Europe/London",
        "Europe/Paris",
        "Europe/Berlin",
        "Europe/Madrid",
        "Europe/Rome",
        "Europe/Moscow",
        "Asia/Dubai",
        "Asia/Kolkata",
        "Asia/Shanghai",
        "Asia/Tokyo",
        "Asia/Seoul",
        "Australia/Sydney",
        "Pacific/Auckland",
      ];

      return {
        utc,
        timezones: commonTimezones.map((tz) => ({
          timeZone: tz,
          localTime: formatInTimeZone(now, tz),
        })),
      };
    },
  });

export const utilTools = [createGetCurrentTimeTool];
