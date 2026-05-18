import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getAccessToken } from "../lib/auth.ts";
import {
  sendChannelMessage,
  replyToMessage,
  listJoinedTeams,
  listChannels,
} from "../lib/graph-client.ts";

async function token(env: Env): Promise<string> {
  return getAccessToken(env);
}

// ─── TEAMS_SEND_MESSAGE ───────────────────────────────────────────────────────

export const createSendMessageTool = (env: Env) =>
  createTool({
    id: "TEAMS_SEND_MESSAGE",
    description:
      "Send a message to a Microsoft Teams channel. " +
      "Use team_id and channel_id to specify the destination. " +
      "Supports plain text or HTML content.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z

      .object({
        team_id: z

          .string()

          .describe("Teams team ID (e.g. '19:abc123...'). Required."),
        channel_id: z

          .string()

          .describe("Teams channel ID. Required."),
        content: z.string().describe("Message text or HTML to send."),
        content_type: z

          .enum(["text", "html"])

          .default("text")

          .describe("Content type: 'text' (default) or 'html'."),
        subject: z

          .string()

          .optional()

          .describe(
            "Optional subject for the channel message (shown as the bold heading above the message). Only applies to top-level channel messages, not replies.",
          ),
      })

      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      message_id: z.string().nullish(),
      web_url: z.string().nullish(),
      error: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        team_id: string;
        channel_id: string;
        content: string;
        content_type?: "text" | "html";
        subject?: string;
      };
      try {
        const accessToken = await token(env);
        const msg = await sendChannelMessage(
          input.team_id,
          input.channel_id,
          input.content,
          input.content_type ?? "text",
          accessToken,
          input.subject,
        );
        return {
          success: true,
          message_id: msg.id,
          web_url: msg.webUrl,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_REPLY_TO_MESSAGE ───────────────────────────────────────────────────

export const createReplyToMessageTool = (env: Env) =>
  createTool({
    id: "TEAMS_REPLY_TO_MESSAGE",
    description:
      "Reply to an existing message in a Teams channel thread. " +
      "Use message_id from a trigger payload to reply in context.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z

      .object({
        team_id: z.string().describe("Teams team ID."),
        channel_id: z.string().describe("Teams channel ID."),
        message_id: z

          .string()

          .describe("ID of the parent message to reply to."),
        content: z.string().describe("Reply text or HTML."),
        content_type: z

          .enum(["text", "html"])

          .default("text")

          .describe("Content type: 'text' (default) or 'html'."),
      })

      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      message_id: z.string().nullish(),
      web_url: z.string().nullish(),
      error: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        team_id: string;
        channel_id: string;
        message_id: string;
        content: string;
        content_type?: "text" | "html";
      };
      try {
        const accessToken = await token(env);
        const msg = await replyToMessage(
          input.team_id,
          input.channel_id,
          input.message_id,
          input.content,
          input.content_type ?? "text",
          accessToken,
        );
        return {
          success: true,
          message_id: msg.id,
          web_url: msg.webUrl,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_LIST_TEAMS ─────────────────────────────────────────────────────────

export const createListTeamsTool = (env: Env) =>
  createTool({
    id: "TEAMS_LIST_TEAMS",
    description: "List all Microsoft Teams teams the app has access to.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({
      success: z.boolean(),
      teams: z

        .array(
          z.object({
            id: z.string(),
            displayName: z.string(),
            description: z.string().nullish(),
          }),
        )

        .optional(),
      error: z.string().optional(),
    }),
    execute: async () => {
      try {
        const accessToken = await token(env);
        const teams = await listJoinedTeams(accessToken);
        return {
          success: true,
          teams: teams.map((t) => ({
            id: t.id,
            displayName: t.displayName,
            description: t.description ?? null,
          })),
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_LIST_CHANNELS ──────────────────────────────────────────────────────

export const createListChannelsTool = (env: Env) =>
  createTool({
    id: "TEAMS_LIST_CHANNELS",
    description: "List all channels in a Microsoft Teams team.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z

      .object({
        team_id: z.string().describe("Teams team ID."),
      })

      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      channels: z

        .array(
          z.object({
            id: z.string(),
            displayName: z.string(),
            description: z.string().nullish(),
            membershipType: z.string().nullish(),
          }),
        )

        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { team_id } = context as { team_id: string };
      try {
        const accessToken = await token(env);
        const channels = await listChannels(team_id, accessToken);
        return {
          success: true,
          channels: channels.map((c) => ({
            id: c.id,
            displayName: c.displayName,
            description: c.description ?? null,
            membershipType: c.membershipType ?? null,
          })),
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

export const messageTools = [
  createSendMessageTool,
  createReplyToMessageTool,
  createListTeamsTool,
  createListChannelsTool,
];
