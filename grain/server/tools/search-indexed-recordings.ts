/**
 * Tool: Search Indexed Recordings
 * Search through recordings that have been indexed via webhooks in the PostgreSQL database
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { searchRecordings, getRecordingsByDateRange } from "../lib/postgres.ts";

const IndexedRecordingSchema = z.object({
  id: z.string().describe("Unique recording identifier"),
  title: z.string().describe("Meeting title or subject"),
  source: z.string().describe("Recording source (e.g., zoom, meet, teams)"),
  url: z.string().describe("Public share URL"),
  media_type: z.string().nullable().describe("Media type of the recording"),
  start_datetime: z.string().describe("Recording start time (ISO 8601 format)"),
  end_datetime: z.string().describe("Recording end time (ISO 8601 format)"),
  duration_ms: z.number().describe("Duration in milliseconds"),
  thumbnail_url: z.string().nullable().describe("URL to the thumbnail image"),
  tags: z.array(z.string()).describe("Tags applied to the recording"),
  teams: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .describe("Teams associated with the recording"),
  meeting_type: z
    .object({
      id: z.string(),
      name: z.string(),
      scope: z.string(),
    })
    .nullable()
    .describe("Meeting type information"),
  indexed_at: z.string().describe("When the recording was indexed"),
});

export const createSearchIndexedRecordingsTool = (env: Env) =>
  createPrivateTool({
    id: "SEARCH_INDEXED_RECORDINGS",
    description:
      "Search through recordings that have been indexed in the local database via webhooks. " +
      "This provides faster search across recordings that have been automatically indexed " +
      "when Grain sends webhook notifications. You can search by text (title) or filter by date range. " +
      "Note: Only recordings received via webhooks are available here.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          "Search query to find recordings by title (uses full-text search)",
        ),
      start_date: z
        .string()
        .optional()
        .describe(
          "Filter recordings from this date onwards (ISO 8601 format, e.g., '2024-01-01')",
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          "Filter recordings up to this date (ISO 8601 format, e.g., '2024-12-31')",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .optional()
        .describe(
          "Maximum number of recordings to return (1-100, default: 10)",
        ),
    }),
    outputSchema: z.object({
      recordings: z
        .array(IndexedRecordingSchema)
        .describe("List of indexed recordings matching the search criteria"),
      count: z.number().describe("Number of recordings returned"),
    }),
    execute: async ({ context }) => {
      const { query, start_date, end_date, limit = 10 } = context;

      let recordings: unknown[];

      // If date range is provided, use date range search
      if (start_date && end_date) {
        recordings = await getRecordingsByDateRange(env, start_date, end_date);
      }
      // If query is provided, use text search
      else if (query) {
        recordings = await searchRecordings(env, query, limit);
      }
      // Default: return error if no search criteria
      else {
        throw new Error(
          "Please provide either a search query or a date range (start_date and end_date)",
        );
      }

      // Apply limit if using date range (which doesn't have built-in limit)
      if (start_date && end_date && recordings.length > limit) {
        recordings = recordings.slice(0, limit);
      }

      return {
        recordings: recordings as z.infer<typeof IndexedRecordingSchema>[],
        count: recordings.length,
      };
    },
  });
