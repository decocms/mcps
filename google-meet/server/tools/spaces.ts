/**
 * Meeting Space Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { MeetClient, getAccessToken } from "../lib/meet-client.ts";

const SpaceSchema = z.object({
  name: z.string(),
  meetingUri: z.string().optional(),
  meetingCode: z.string().optional(),
  accessType: z.string().optional(),
  entryPointAccess: z.string().optional(),
  activeConference: z.string().optional(),
});

export const createCreateMeetingTool = (env: Env) =>
  createPrivateTool({
    id: "create_meeting",
    description: "Create a new Google Meet meeting space.",
    inputSchema: z.object({
      accessType: z
        .enum(["OPEN", "TRUSTED", "RESTRICTED"])
        .optional()
        .describe(
          "Access level: OPEN (anyone with link), TRUSTED (org only), RESTRICTED (invited only)",
        ),
      entryPointAccess: z
        .enum(["ALL", "CREATOR_APP_ONLY"])
        .optional()
        .describe("Entry point access"),
    }),
    outputSchema: z.object({
      meeting: SpaceSchema,
      meetingLink: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const space = await client.createSpace({
        accessType: context.accessType,
        entryPointAccess: context.entryPointAccess,
      });
      return {
        meeting: {
          name: space.name,
          meetingUri: space.meetingUri,
          meetingCode: space.meetingCode,
          accessType: space.config?.accessType,
          entryPointAccess: space.config?.entryPointAccess,
          activeConference: space.activeConference?.conferenceRecord,
        },
        meetingLink: space.meetingUri || "",
        success: true,
      };
    },
  });

export const createGetMeetingTool = (env: Env) =>
  createPrivateTool({
    id: "get_meeting",
    description: "Get details about a meeting space.",
    inputSchema: z.object({
      spaceName: z.string().describe("Space name (e.g., 'spaces/abc123')"),
    }),
    outputSchema: z.object({
      meeting: SpaceSchema,
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const space = await client.getSpace(context.spaceName);
      return {
        meeting: {
          name: space.name,
          meetingUri: space.meetingUri,
          meetingCode: space.meetingCode,
          accessType: space.config?.accessType,
          entryPointAccess: space.config?.entryPointAccess,
          activeConference: space.activeConference?.conferenceRecord,
        },
      };
    },
  });

export const createEndMeetingTool = (env: Env) =>
  createPrivateTool({
    id: "end_meeting",
    description: "End an active conference in a meeting space.",
    inputSchema: z.object({
      spaceName: z.string().describe("Space name (e.g., 'spaces/abc123')"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      await client.endActiveConference(context.spaceName);
      return { success: true, message: "Conference ended" };
    },
  });

export const createUpdateMeetingTool = (env: Env) =>
  createPrivateTool({
    id: "update_meeting",
    description: "Update meeting space settings.",
    inputSchema: z.object({
      spaceName: z.string().describe("Space name"),
      accessType: z
        .enum(["OPEN", "TRUSTED", "RESTRICTED"])
        .optional()
        .describe("New access level"),
      entryPointAccess: z
        .enum(["ALL", "CREATOR_APP_ONLY"])
        .optional()
        .describe("New entry point access"),
    }),
    outputSchema: z.object({
      meeting: SpaceSchema,
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new MeetClient({ accessToken: getAccessToken(env) });
      const space = await client.updateSpace(context.spaceName, {
        accessType: context.accessType,
        entryPointAccess: context.entryPointAccess,
      });
      return {
        meeting: {
          name: space.name,
          meetingUri: space.meetingUri,
          meetingCode: space.meetingCode,
          accessType: space.config?.accessType,
          entryPointAccess: space.config?.entryPointAccess,
          activeConference: space.activeConference?.conferenceRecord,
        },
        success: true,
      };
    },
  });

export const spaceTools = [
  createCreateMeetingTool,
  createGetMeetingTool,
  createEndMeetingTool,
  createUpdateMeetingTool,
];
