import { createPrivateTool } from "@decocms/runtime/tools";
import { getGrainApiKey } from "../lib/env.ts";
import { z } from "zod";
import { GrainClient, GrainAPIError } from "../lib/grain-client.ts";
import type { Env } from "../types/env.ts";

export const createGetRecordingTool = (env: Env) =>
  createPrivateTool({
    id: "GET_RECORDING",
    description:
      "Get detailed information about a specific Grain recording. " +
      "Choose what to include: participants, highlights, transcript (JSON), intelligence notes (markdown).",
    inputSchema: z.object({
      recordingId: z.string().describe("The recording UUID"),
      include_highlights: z
        .boolean()
        .optional()
        .describe("Include highlights (default false)"),
      include_transcript: z
        .boolean()
        .optional()
        .describe("Include transcript as JSON (default false)"),
      include_notes: z
        .boolean()
        .optional()
        .describe("Include AI intelligence notes as markdown (default false)"),
    }),
    outputSchema: z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      start_datetime: z.string(),
      end_datetime: z.string(),
      public_thumbnail_url: z.string().nullable(),
      owners: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      participants: z
        .array(
          z.object({
            email: z.string(),
            name: z.string(),
            scope: z.string(),
          }),
        )
        .optional(),
      highlights: z
        .array(
          z.object({
            id: z.string(),
            text: z.string(),
            transcript: z.string(),
            timestamp: z.number(),
            duration: z.number(),
            url: z.string(),
          }),
        )
        .optional(),
      transcript_json: z
        .array(
          z.object({
            speaker: z.string(),
            text: z.string(),
            start_time: z.number(),
            end_time: z.number(),
          }),
        )
        .optional(),
      intelligence_notes_md: z.string().optional(),
    }),
    execute: async ({ context }) => {
      try {
        const client = new GrainClient({ apiKey: getGrainApiKey(env) });

        const recording = await client.getRecording(context.recordingId, {
          include_highlights: context.include_highlights,
          include_participants: true,
          include_owners: true,
          transcript_format: context.include_transcript ? "json" : undefined,
          intelligence_notes_format: context.include_notes ? "md" : undefined,
        });

        return {
          id: recording.id,
          title: recording.title,
          url: recording.url,
          start_datetime: recording.start_datetime,
          end_datetime: recording.end_datetime,
          public_thumbnail_url: recording.public_thumbnail_url,
          owners: recording.owners,
          tags: recording.tags,
          participants: recording.participants,
          highlights: recording.highlights?.map((h) => ({
            id: h.id,
            text: h.text,
            transcript: h.transcript,
            timestamp: h.timestamp,
            duration: h.duration,
            url: h.url,
          })),
          transcript_json: recording.transcript_json,
          intelligence_notes_md: recording.intelligence_notes_md,
        };
      } catch (error) {
        if (error instanceof GrainAPIError) {
          throw new Error(error.getUserMessage());
        }
        throw error;
      }
    },
  });
