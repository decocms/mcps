/**
 * Conference Records and Participants Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { MeetClient, getAccessToken } from "../lib/meet-client.ts";

const ConferenceSchema = z.object({
  name: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  space: z.string().optional(),
});

const ParticipantSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  userType: z.string().optional(),
  earliestStartTime: z.string().optional(),
  latestEndTime: z.string().optional(),
});

export const createListConferenceRecordsTool = (env: Env) =>
  createPrivateTool({
    id: "list_conference_records",
    description: "List conference records (past meetings).",
    inputSchema: z.object({
      filter: z
        .string()
        .optional()
        .describe("Filter (e.g., 'space.name=spaces/abc123')"),
      maxResults: z.coerce
        .number()
        .optional()
        .describe("Max results (default 100)"),
    }),
    outputSchema: z.object({
      conferences: z.array(ConferenceSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const records = await client.listConferenceRecords(
        context.filter,
        context.maxResults,
      );
      return {
        conferences: records.map((r) => ({
          name: r.name,
          startTime: r.startTime,
          endTime: r.endTime,
          space: r.space,
        })),
        count: records.length,
      };
    },
  });

export const createGetConferenceRecordTool = (env: Env) =>
  createPrivateTool({
    id: "get_conference_record",
    description: "Get details about a specific conference record.",
    inputSchema: z.object({
      name: z
        .string()
        .describe("Conference record name (e.g., 'conferenceRecords/abc123')"),
    }),
    outputSchema: z.object({
      conference: ConferenceSchema,
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const record = await client.getConferenceRecord(context.name);
      return {
        conference: {
          name: record.name,
          startTime: record.startTime,
          endTime: record.endTime,
          space: record.space,
        },
      };
    },
  });

export const createListParticipantsTool = (env: Env) =>
  createPrivateTool({
    id: "list_participants",
    description: "List participants of a conference.",
    inputSchema: z.object({
      conferenceRecord: z.string().describe("Conference record name"),
      maxResults: z.coerce.number().optional().describe("Max results"),
    }),
    outputSchema: z.object({
      participants: z.array(ParticipantSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const participants = await client.listParticipants(
        context.conferenceRecord,
        context.maxResults,
      );
      return {
        participants: participants.map((p) => ({
          name: p.name,
          displayName:
            p.signedinUser?.displayName ||
            p.anonymousUser?.displayName ||
            p.phoneUser?.displayName,
          userType: p.signedinUser
            ? "signed_in"
            : p.anonymousUser
              ? "anonymous"
              : p.phoneUser
                ? "phone"
                : "unknown",
          earliestStartTime: p.earliestStartTime,
          latestEndTime: p.latestEndTime,
        })),
        count: participants.length,
      };
    },
  });

export const createGetParticipantSessionsTool = (env: Env) =>
  createPrivateTool({
    id: "get_participant_sessions",
    description:
      "Get session details for a participant (when they joined/left).",
    inputSchema: z.object({
      participantName: z.string().describe("Participant name"),
    }),
    outputSchema: z.object({
      sessions: z.array(
        z.object({
          name: z.string(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const sessions = await client.listParticipantSessions(
        context.participantName,
      );
      return {
        sessions: sessions.map((s) => ({
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      };
    },
  });

export const conferenceTools = [
  createListConferenceRecordsTool,
  createGetConferenceRecordTool,
  createListParticipantsTool,
  createGetParticipantSessionsTool,
];
