import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { searchIndexedRecordings } from "../db/queries.ts";
import type { Env } from "../types/env.ts";

export const createSearchIndexedRecordingsTool = (env: Env) =>
  createPrivateTool({
    id: "SEARCH_INDEXED_RECORDINGS",
    description:
      "Search recordings indexed in Supabase via webhooks. " +
      "Text search matches title, participant names/emails, and AI notes. " +
      "Can also filter by date range, tag, or owner email.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          "Free-text search across title, participants, and intelligence notes",
        ),
      start_date: z
        .string()
        .optional()
        .describe("Recordings on or after this date (ISO 8601)"),
      end_date: z
        .string()
        .optional()
        .describe("Recordings on or before this date (ISO 8601)"),
      tag: z.string().optional().describe("Filter by exact tag"),
      owner: z
        .string()
        .optional()
        .describe("Filter by owner email (exact match)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .optional()
        .describe("Max results (1-100, default 10)"),
    }),
    outputSchema: z.object({
      recordings: z.array(
        z.object({
          id: z.string(),
          title: z.string().nullable(),
          url: z.string().nullable(),
          start_datetime: z.string().nullable(),
          end_datetime: z.string().nullable(),
          owners: z.array(z.string()),
          tags: z.array(z.string()),
          participants: z.array(
            z.object({
              email: z.string(),
              name: z.string(),
              scope: z.string(),
            }),
          ),
          intelligence_notes_md: z.string().nullable(),
          indexed_at: z.string(),
        }),
      ),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      void env;
      const { query, start_date, end_date, tag, owner, limit = 10 } = context;

      if (!query && !start_date && !end_date && !tag && !owner) {
        throw new Error(
          "Provide at least one filter: query, start_date, end_date, tag, or owner.",
        );
      }

      const recordings = await searchIndexedRecordings({
        query,
        startDate: start_date,
        endDate: end_date,
        tag,
        owner,
        limit,
      });

      return {
        recordings: recordings.map((r) => ({
          id: r.id,
          title: r.title,
          url: r.url,
          start_datetime: r.start_datetime,
          end_datetime: r.end_datetime,
          owners: r.owners,
          tags: r.tags,
          participants: r.participants,
          intelligence_notes_md: r.intelligence_notes_md,
          indexed_at: r.indexed_at,
        })),
        count: recordings.length,
      };
    },
  });
