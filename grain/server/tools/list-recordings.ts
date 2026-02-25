import { createPrivateTool } from "@decocms/runtime/tools";
import { getGrainApiKey } from "../lib/env.ts";
import { z } from "zod";
import { GrainClient, GrainAPIError } from "../lib/grain-client.ts";
import type { Env } from "../types/env.ts";

export const createListRecordingsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_RECORDINGS",
    description:
      "List and search through your Grain meeting recordings. " +
      "Filter by date range, title keywords, or meeting attendance role.",
    inputSchema: z.object({
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous response"),
      start_date: z
        .string()
        .optional()
        .describe(
          "Only recordings starting on or after this date (ISO 8601, e.g. '2025-01-01')",
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          "Only recordings starting before this date (ISO 8601, e.g. '2025-02-01')",
        ),
      title: z
        .string()
        .optional()
        .describe("Case-insensitive title search (e.g. 'All Hands')"),
      attendance: z
        .enum(["hosted", "attended"])
        .optional()
        .describe("Filter by your role: 'hosted' or 'attended'"),
      include_highlights: z
        .boolean()
        .optional()
        .describe("Include highlights in response"),
      include_participants: z
        .boolean()
        .optional()
        .describe("Include participant list in response"),
    }),
    outputSchema: z.object({
      recordings: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          url: z.string(),
          start_datetime: z.string(),
          end_datetime: z.string(),
          public_thumbnail_url: z.string().nullable(),
        }),
      ),
      cursor: z.string().nullable().describe("Next page cursor, null if last"),
    }),
    execute: async ({ context }) => {
      try {
        const client = new GrainClient({ apiKey: getGrainApiKey(env) });
        const response = await client.listRecordings({
          cursor: context.cursor,
          start_date: context.start_date,
          end_date: context.end_date,
          title: context.title,
          attendance: context.attendance,
          include_highlights: context.include_highlights,
          include_participants: context.include_participants,
        });

        return {
          recordings: response.recordings,
          cursor: response.cursor,
        };
      } catch (error) {
        if (error instanceof GrainAPIError) {
          throw new Error(error.getUserMessage());
        }
        throw error;
      }
    },
  });
