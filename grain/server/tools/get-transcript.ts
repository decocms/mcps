import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { GrainAPIError, GrainClient } from "../lib/grain-client.ts";
import { getGrainApiKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const TranscriptFormatSchema = z.enum(["json", "txt", "srt", "vtt"]);

export const createGetTranscriptTool = (env: Env) =>
  createPrivateTool({
    id: "GET_TRANSCRIPT",
    description:
      "Get transcript content for a Grain recording. " +
      "Supports JSON (structured), TXT (plain text), VTT and SRT (subtitles, paid seat required).",
    inputSchema: z.object({
      recordingId: z.string().describe("The recording UUID"),
      format: TranscriptFormatSchema.optional()
        .default("txt")
        .describe("Output format (default: txt)"),
    }),
    outputSchema: z.object({
      id: z.string(),
      title: z.string(),
      format: TranscriptFormatSchema,
      content: z.union([
        z.string(),
        z.array(
          z.object({
            speaker: z.string(),
            text: z.string(),
            start_time: z.number(),
            end_time: z.number(),
          }),
        ),
      ]),
    }),
    execute: async ({ context }) => {
      try {
        const client = new GrainClient({ apiKey: getGrainApiKey(env) });
        const format = context.format ?? "txt";

        const [recording, transcript] = await Promise.all([
          client.getRecording(context.recordingId, {
            include_participants: false,
            include_owners: false,
          }),
          client.getTranscript(context.recordingId, format),
        ]);

        return {
          id: recording.id,
          title: recording.title,
          format,
          content: transcript,
        };
      } catch (error) {
        if (error instanceof GrainAPIError) {
          throw new Error(error.getUserMessage());
        }
        throw error;
      }
    },
  });
