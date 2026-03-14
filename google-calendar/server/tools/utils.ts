import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";

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
        const localTime = now.toLocaleString("en-US", {
          timeZone: context.timeZone,
          dateStyle: "full",
          timeStyle: "long",
        });

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
          localTime: now.toLocaleString("en-US", {
            timeZone: tz,
            dateStyle: "full",
            timeStyle: "long",
          }),
        })),
      };
    },
  });

export const utilTools = [createGetCurrentTimeTool];
