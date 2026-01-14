/**
 * Recordings and Transcripts Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { MeetClient, getAccessToken } from "../lib/meet-client.ts";

const RecordingSchema = z.object({
  name: z.string(),
  state: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  driveFileId: z.string().optional(),
  exportUri: z.string().optional(),
});

const TranscriptSchema = z.object({
  name: z.string(),
  state: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  docsDocumentId: z.string().optional(),
  exportUri: z.string().optional(),
});

export const createListRecordingsTool = (env: Env) =>
  createPrivateTool({
    id: "list_recordings",
    description: "List recordings for a conference.",
    inputSchema: z.object({
      conferenceRecord: z.string().describe("Conference record name"),
    }),
    outputSchema: z.object({
      recordings: z.array(RecordingSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const recordings = await client.listRecordings(context.conferenceRecord);
      return {
        recordings: recordings.map((r) => ({
          name: r.name,
          state: r.state,
          startTime: r.startTime,
          endTime: r.endTime,
          driveFileId: r.driveDestination?.file,
          exportUri: r.driveDestination?.exportUri,
        })),
        count: recordings.length,
      };
    },
  });

export const createGetRecordingTool = (env: Env) =>
  createPrivateTool({
    id: "get_recording",
    description: "Get details about a specific recording.",
    inputSchema: z.object({
      name: z.string().describe("Recording name"),
    }),
    outputSchema: z.object({
      recording: RecordingSchema,
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const recording = await client.getRecording(context.name);
      return {
        recording: {
          name: recording.name,
          state: recording.state,
          startTime: recording.startTime,
          endTime: recording.endTime,
          driveFileId: recording.driveDestination?.file,
          exportUri: recording.driveDestination?.exportUri,
        },
      };
    },
  });

export const createListTranscriptsTool = (env: Env) =>
  createPrivateTool({
    id: "list_transcripts",
    description: "List transcripts for a conference.",
    inputSchema: z.object({
      conferenceRecord: z.string().describe("Conference record name"),
    }),
    outputSchema: z.object({
      transcripts: z.array(TranscriptSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const transcripts = await client.listTranscripts(
        context.conferenceRecord,
      );
      return {
        transcripts: transcripts.map((t) => ({
          name: t.name,
          state: t.state,
          startTime: t.startTime,
          endTime: t.endTime,
          docsDocumentId: t.docsDestination?.document,
          exportUri: t.docsDestination?.exportUri,
        })),
        count: transcripts.length,
      };
    },
  });

export const createListTranscriptEntriesTool = (env: Env) =>
  createPrivateTool({
    id: "list_transcript_entries",
    description: "Get transcript entries (what was said during the meeting).",
    inputSchema: z.object({
      transcriptName: z.string().describe("Transcript name"),
      maxResults: z.coerce.number().optional().describe("Max results"),
    }),
    outputSchema: z.object({
      entries: z.array(
        z.object({
          name: z.string(),
          participant: z.string().optional(),
          text: z.string().optional(),
          languageCode: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
        }),
      ),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const entries = await client.listTranscriptEntries(
        context.transcriptName,
        context.maxResults,
      );
      return {
        entries: entries.map((e) => ({
          name: e.name,
          participant: e.participant,
          text: e.text,
          languageCode: e.languageCode,
          startTime: e.startTime,
          endTime: e.endTime,
        })),
        count: entries.length,
      };
    },
  });

export const recordingTools = [
  createListRecordingsTool,
  createGetRecordingTool,
  createListTranscriptsTool,
  createListTranscriptEntriesTool,
];
