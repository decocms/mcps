/**
 * Tool: Get Recording
 * Get detailed information about a specific Grain recording
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { getGrainApiKey } from "../lib/env.ts";
import { z } from "zod";
import { GrainClient, GrainAPIError } from "../lib/grain-client.ts";
import type { Env } from "../types/env.ts";

export const createGetRecordingTool = (env: Env) =>
  createPrivateTool({
    id: "GET_RECORDING",
    description:
      "Get detailed information about a specific Grain recording by its ID. " +
      "Returns comprehensive details including title, date, duration, participants, " +
      "full transcript with timestamps, AI-generated summary, highlights, and URLs. " +
      "Perfect for deep diving into a specific meeting and extracting detailed information.",
    inputSchema: z.object({
      recordingId: z
        .string()
        .describe(
          "The unique identifier of the recording to retrieve (e.g., 'rec_abc123')",
        ),
    }),
    outputSchema: z.object({
      id: z.string().describe("Unique recording identifier"),
      title: z.string().describe("Meeting title or subject"),
      owners: z
        .array(z.string())
        .describe("Email addresses of recording owners"),
      source: z.string().describe("Recording source (e.g., zoom, meet, teams)"),
      url: z.string().describe("Public share URL"),
      tags: z.array(z.string()).describe("Tags applied to the recording"),
      summary: z.string().describe("AI-generated summary of the meeting"),
      start_datetime: z
        .string()
        .describe("Recording start time (ISO 8601 format)"),
      end_datetime: z.string().describe("Recording end time (ISO 8601 format)"),
      duration_ms: z.number().describe("Duration in milliseconds"),
      summary_points: z
        .array(
          z.object({
            timestamp: z
              .number()
              .describe("Timestamp in milliseconds from start"),
            text: z.string().describe("Summary point text"),
          }),
        )
        .describe("Key summary points with timestamps"),
      public_url: z.string().describe("Public URL to view the recording"),
      transcript_json_url: z
        .string()
        .describe("URL to download transcript in JSON format"),
      transcript_srt_url: z
        .string()
        .describe("URL to download transcript in SRT format"),
      transcript_txt_url: z
        .string()
        .describe("URL to download transcript in TXT format"),
      transcript_vtt_url: z
        .string()
        .describe("URL to download transcript in VTT format"),
      intelligence_notes_md: z
        .string()
        .describe("Markdown-formatted meeting notes with detailed analysis"),
      transcript_segments: z
        .array(
          z.object({
            speaker: z.string().describe("Speaker name or identifier"),
            text: z.string().describe("Transcript text"),
            start_time: z.number().describe("Start time in seconds"),
            end_time: z.number().describe("End time in seconds"),
          }),
        )
        .optional()
        .describe("Timestamped transcript segments with speaker attribution"),
      highlights: z
        .array(
          z.object({
            id: z.string(),
            text: z.string(),
            timestamp: z.number(),
            created_by: z.string().optional(),
          }),
        )
        .optional()
        .describe("User-created highlights or bookmarks"),
    }),
    execute: async ({ context }) => {
      const { recordingId } = context;

      try {
        const client = new GrainClient({
          apiKey: getGrainApiKey(env),
        });

        // Fetch detailed recording information
        const recording = await client.getRecording(recordingId);

        return {
          id: recording.id,
          title: recording.title,
          owners: recording.owners,
          source: recording.source,
          url: recording.url,
          tags: recording.tags,
          summary: recording.summary,
          start_datetime: recording.start_datetime,
          end_datetime: recording.end_datetime,
          duration_ms: recording.duration_ms,
          summary_points: recording.summary_points,
          public_url: recording.public_url,
          transcript_json_url: recording.transcript_json_url,
          transcript_srt_url: recording.transcript_srt_url,
          transcript_txt_url: recording.transcript_txt_url,
          transcript_vtt_url: recording.transcript_vtt_url,
          intelligence_notes_md: recording.intelligence_notes_md,
          transcript_segments: recording.transcript_segments,
          highlights: recording.highlights,
        };
      } catch (error) {
        if (error instanceof GrainAPIError) {
          throw new Error(error.getUserMessage());
        }
        throw error;
      }
    },
  });
