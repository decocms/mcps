/**
 * Tool: List Recordings
 * List and search through your Grain meeting recordings
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { getGrainApiKey } from "../lib/env.ts";
import { z } from "zod";
import { GrainClient, GrainAPIError } from "../lib/grain-client.ts";
import type { Env } from "../types/env.ts";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.ts";

export const createListRecordingsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_RECORDINGS",
    description:
      "List and search through your Grain meeting recordings. " +
      "You can filter recordings by date range, status, or search by keywords. " +
      "Returns details including title, date, duration, participants, and transcript summaries. " +
      "Perfect for finding specific meetings, reviewing recent recordings, or analyzing meeting patterns.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE_SIZE)
        .default(DEFAULT_PAGE_SIZE)
        .optional()
        .describe(
          `Maximum number of recordings to return (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})`,
        ),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .optional()
        .describe("Number of recordings to skip for pagination (default: 0)"),
      start_date: z
        .string()
        .optional()
        .describe(
          "Filter recordings from this date onwards (ISO 8601 format, e.g., '2024-01-01' or '2024-01-01T00:00:00Z')",
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          "Filter recordings up to this date (ISO 8601 format, e.g., '2024-12-31' or '2024-12-31T23:59:59Z')",
        ),
      status: z
        .enum(["processing", "ready", "failed"])
        .optional()
        .describe(
          "Filter by recording status: 'processing' (still being processed), 'ready' (available), or 'failed' (processing error)",
        ),
      search: z
        .string()
        .optional()
        .describe(
          "Search recordings by title, transcript content, or participant names",
        ),
    }),
    outputSchema: z.object({
      recordings: z
        .array(
          z.object({
            id: z.string().describe("Unique recording identifier"),
            title: z.string().describe("Meeting title or subject"),
            owners: z
              .array(z.string())
              .describe("Email addresses of recording owners"),
            source: z
              .string()
              .describe("Recording source (e.g., zoom, meet, teams)"),
            url: z.string().describe("Public share URL"),
            tags: z.array(z.string()).describe("Tags applied to the recording"),
            summary: z
              .string()
              .optional()
              .describe(
                "AI-generated summary of the meeting (may be empty if still processing)",
              ),
            start_datetime: z
              .string()
              .describe("Recording start time (ISO 8601 format)"),
            end_datetime: z
              .string()
              .describe("Recording end time (ISO 8601 format)"),
            duration_ms: z.number().describe("Duration in milliseconds"),
            public_url: z.string().describe("Public URL to view the recording"),
            transcript_json_url: z
              .string()
              .describe("URL to download transcript in JSON format"),
            transcript_txt_url: z
              .string()
              .describe("URL to download transcript in TXT format"),
            intelligence_notes_md: z
              .string()
              .optional()
              .describe(
                "Markdown-formatted meeting notes (may be empty if still processing)",
              ),
          }),
        )
        .describe("List of recordings matching the filters"),
      cursor: z
        .string()
        .optional()
        .describe("Cursor for pagination (use with next request)"),
    }),
    execute: async ({ context }) => {
      const {
        limit = DEFAULT_PAGE_SIZE,
        offset = 0,
        start_date,
        end_date,
        status,
        search,
      } = context;

      try {
        const client = new GrainClient({
          apiKey: getGrainApiKey(env),
        });
        // Fetch recordings with filters
        const response = await client.listRecordings({
          limit,
          offset,
          start_date,
          end_date,
          status,
          search,
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
