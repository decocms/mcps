/**
 * Recording management tools for Grain
 *
 * These tools allow listing and accessing meeting recordings from Grain.
 * Grain automatically joins your calls, records them, and provides
 * AI-powered transcriptions and notes.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getGrainApiKey, getGrainApiUrl } from "../lib/env.ts";
import { GrainClient } from "../lib/client.ts";
import { MockGrainClient } from "../lib/mock-client.ts";

/**
 * List recordings with filters and pagination
 */
export const createListRecordingsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_RECORDINGS",
    description:
      "List your Grain meeting recordings. Filter by date, meeting type, platform (Zoom, Meet, Teams), participants, and more. Use this to browse your recorded meetings and find specific calls.",
    inputSchema: z.object({
      meeting_type: z
        .string()
        .optional()
        .describe(
          "Filter by meeting type (e.g., 'sales_call', 'customer_interview', 'team_meeting')",
        ),
      meeting_platform: z
        .enum(["zoom", "meet", "teams", "webex", "other"])
        .optional()
        .describe("Filter by meeting platform"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter by tags assigned to recordings"),
      participant_email: z
        .string()
        .optional()
        .describe("Filter recordings where this person participated"),
      from_date: z
        .string()
        .optional()
        .describe("Filter recordings after this date (ISO format: YYYY-MM-DD)"),
      to_date: z
        .string()
        .optional()
        .describe(
          "Filter recordings before this date (ISO format: YYYY-MM-DD)",
        ),
      status: z
        .enum(["processing", "ready", "failed"])
        .optional()
        .describe("Filter by processing status"),
      sort_by: z
        .enum(["recorded_at", "created_at", "duration", "title"])
        .optional()
        .default("recorded_at")
        .describe("Sort field"),
      sort_order: z
        .enum(["asc", "desc"])
        .optional()
        .default("desc")
        .describe("Sort order (descending = newest first)"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Number of recordings to return"),
      offset: z
        .number()
        .min(0)
        .optional()
        .default(0)
        .describe("Number of recordings to skip (for pagination)"),
    }),
    outputSchema: z.object({
      recordings: z.array(
        z.object({
          id: z.string().describe("Unique recording ID"),
          title: z.string().describe("Recording title"),
          duration_seconds: z.number().describe("Duration in seconds"),
          recorded_at: z.string().describe("When the meeting was recorded"),
          status: z
            .string()
            .describe("Processing status (processing, ready, failed)"),
          participants_count: z.number().describe("Number of participants"),
          transcript_available: z
            .boolean()
            .describe("Whether transcript is ready"),
        }),
      ),
      total: z.number().describe("Total number of recordings matching filters"),
      has_more: z.boolean().describe("Whether there are more results"),
    }),
    execute: async ({ context }) => {
      // Use mock client if API key is "mock" or not set
      const apiKey = env.GRAIN_API_KEY || "";
      const client =
        apiKey === "mock" || !apiKey
          ? new MockGrainClient()
          : new GrainClient({
              apiKey: getGrainApiKey(env),
              baseUrl: getGrainApiUrl(env),
            });

      const result = await client.listRecordings({
        meeting_type: context.meeting_type,
        meeting_platform: context.meeting_platform,
        tags: context.tags,
        participant_email: context.participant_email,
        from_date: context.from_date,
        to_date: context.to_date,
        status: context.status,
        sort_by: context.sort_by,
        sort_order: context.sort_order,
        limit: context.limit,
        offset: context.offset,
      });

      return {
        recordings: result.recordings,
        total: result.total,
        has_more: result.hasMore,
      };
    },
  });

export const recordingTools = [createListRecordingsTool];
