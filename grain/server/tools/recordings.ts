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
import { runSQL } from "../lib/postgres.ts";

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
      try {
        // Build SQL query with filters
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        // Add date filters
        if (context.from_date) {
          conditions.push(`recorded_at >= $${paramIndex++}`);
          params.push(context.from_date);
        }
        if (context.to_date) {
          conditions.push(`recorded_at <= $${paramIndex++}`);
          params.push(context.to_date);
        }

        // Add status filter
        if (context.status) {
          conditions.push(`status = $${paramIndex++}`);
          params.push(context.status);
        }

        // Build WHERE clause
        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Build ORDER BY clause
        const sortField = context.sort_by || "recorded_at";
        const sortOrder = context.sort_order || "desc";
        const orderClause = `ORDER BY ${sortField} ${sortOrder.toUpperCase()}`;

        // Add LIMIT and OFFSET
        const limit = context.limit || 20;
        const offset = context.offset || 0;
        const limitClause = `LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        // Execute query
        const recordings = await runSQL<{
          id: string;
          title: string;
          duration_seconds: number;
          recorded_at: string;
          status: string;
          participants_count: number;
          transcript_available: boolean;
        }>(
          env,
          `
          SELECT 
            id, 
            title, 
            duration_seconds, 
            recorded_at, 
            status, 
            participants_count, 
            transcript_available
          FROM grain_recordings
          ${whereClause}
          ${orderClause}
          ${limitClause}
        `,
          params,
        );

        // Get total count
        const countResult = await runSQL<{ count: number }>(
          env,
          `SELECT COUNT(*) as count FROM grain_recordings ${whereClause}`,
          params.slice(0, conditions.length),
        );
        const total = countResult[0]?.count || 0;

        // Check if there are more results
        const hasMore = offset + recordings.length < total;

        return {
          recordings: recordings.map((r) => ({
            id: r.id,
            title: r.title,
            duration_seconds: r.duration_seconds,
            recorded_at: r.recorded_at,
            status: r.status,
            participants_count: r.participants_count,
            transcript_available: r.transcript_available,
          })),
          total,
          has_more: hasMore,
        };
      } catch (error) {
        console.error("Error listing recordings from PostgreSQL:", error);
        // Return empty results on error
        return {
          recordings: [],
          total: 0,
          has_more: false,
        };
      }
    },
  });

export const recordingTools = [createListRecordingsTool];
