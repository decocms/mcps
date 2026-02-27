import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { GrainAPIError, GrainClient } from "../lib/grain-client.ts";
import { getGrainApiKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

export const createGetSummaryTool = (env: Env) =>
  createPrivateTool({
    id: "GET_SUMMARY",
    description:
      "Get AI-generated intelligence notes for a Grain recording. " +
      "Returns markdown-formatted meeting notes and insights.",
    inputSchema: z.object({
      recordingId: z.string().describe("The recording UUID"),
      format: z
        .enum(["md", "json", "text"])
        .optional()
        .default("md")
        .describe("Notes format: md (markdown), json, or text (default: md)"),
    }),
    outputSchema: z.object({
      id: z.string(),
      title: z.string(),
      intelligence_notes: z
        .union([
          z.string(),
          z.array(z.object({ title: z.string(), body: z.string() })),
        ])
        .optional(),
    }),
    execute: async ({ context }) => {
      try {
        const client = new GrainClient({ apiKey: getGrainApiKey(env) });
        const format = context.format ?? "md";

        const recording = await client.getRecording(context.recordingId, {
          include_participants: false,
          include_owners: false,
          intelligence_notes_format: format,
        });

        let notes: string | { title: string; body: string }[] | undefined;
        if (format === "md") notes = recording.intelligence_notes_md;
        else if (format === "json") notes = recording.intelligence_notes_json;
        else notes = recording.intelligence_notes_text;

        return {
          id: recording.id,
          title: recording.title,
          intelligence_notes: notes,
        };
      } catch (error) {
        if (error instanceof GrainAPIError) {
          throw new Error(error.getUserMessage());
        }
        throw error;
      }
    },
  });
