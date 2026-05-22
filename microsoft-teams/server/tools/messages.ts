import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getAccessToken } from "../lib/auth.ts";
import {
  sendChannelMessage,
  replyToMessage,
  listJoinedTeams,
  listChannels,
  listChannelMessages,
  listMessageReplies,
  editChannelMessage,
  reactToChannelMessage,
  type ReactionType,
} from "../lib/graph-client.ts";
import { toErrorResponse } from "../lib/errors.ts";

async function token(env: Env): Promise<string> {
  return getAccessToken(env);
}

// ─── SEND_MESSAGE ───────────────────────────────────────────────────────

export const createSendMessageTool = (env: Env) =>
  createTool({
    id: "SEND_MESSAGE",
    description:
      "Send a new TOP-LEVEL message in a Microsoft Teams channel. " +
      "Use this to START a new conversation thread. To REPLY inside an " +
      "existing thread, use REPLY_TO_MESSAGE with the parent " +
      "message_id instead — never use SEND_MESSAGE for replies (it would " +
      "create a separate thread). " +
      "Get team_id from LIST_TEAMS, channel_id from LIST_CHANNELS. " +
      "Optional `subject` renders as a bold heading above the body. " +
      "Optional `content_type='html'` lets you format with <b>, <a>, <br>, " +
      "<ul>, <li>, etc. (HTML is sanitized by Teams).",
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
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
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
        return toErrorResponse(err);
      }
    },
  });

// ─── REPLY_TO_MESSAGE ───────────────────────────────────────────────────

export const createReplyToMessageTool = (env: Env) =>
  createTool({
    id: "REPLY_TO_MESSAGE",
    description:
      "Reply INSIDE an existing message thread in a Teams CHANNEL. " +
      "This is the right tool to use when responding to a teams.message.received " +
      "trigger event — the trigger payload gives you `message_id` (or " +
      "`reply_to_id` if the user's message was already inside a thread). " +
      "Replies appear nested under the parent message in Teams UI, keeping " +
      "the conversation organized. " +
      "For starting a brand-new top-level message, use SEND_MESSAGE.",
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
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
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
        return toErrorResponse(err);
      }
    },
  });

// ─── LIST_TEAMS ─────────────────────────────────────────────────────────

export const createListTeamsTool = (env: Env) =>
  createTool({
    id: "LIST_TEAMS",
    description:
      "List all Microsoft Teams TEAMS (workspaces) the signed-in user belongs to. " +
      "Returns an array of `{ id, displayName, description }`. " +
      "Use the `id` (format: `19:abc...@thread.tacv2`) as `team_id` in any " +
      "channel-related tool (LIST_CHANNELS, SEND_MESSAGE, etc.). " +
      "Call this first when the user references a team by name and you " +
      "don't have the id yet.",
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
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
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
        return toErrorResponse(err);
      }
    },
  });

// ─── LIST_CHANNELS ──────────────────────────────────────────────────────

export const createListChannelsTool = (env: Env) =>
  createTool({
    id: "LIST_CHANNELS",
    description:
      "List all CHANNELS inside a given Microsoft Teams team. " +
      "Returns `{ id, displayName, description, membershipType }` per channel. " +
      "Use the `id` as `channel_id` in send/read/edit/delete message tools. " +
      "membershipType is usually 'standard' (open to all team members), " +
      "'private' (subset of members) or 'shared'. " +
      "Pre-requisite: get `team_id` from LIST_TEAMS first.",
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
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
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
        return toErrorResponse(err);
      }
    },
  });

// ─── LIST_CHANNEL_MESSAGES ──────────────────────────────────────────────

/** Strip HTML to plain text (Graph returns HTML for many messages). */
function toPlainText(body: { contentType: string; content: string }): string {
  if (body.contentType === "text") return body.content;
  return body.content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export const createListChannelMessagesTool = (env: Env) =>
  createTool({
    id: "LIST_CHANNEL_MESSAGES",
    description:
      "List recent top-level messages of a Microsoft Teams channel (newest first). " +
      "Each message includes id, sender, text, created_at, and reply_count. " +
      "Use LIST_MESSAGE_REPLIES with a message id to read its thread.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        team_id: z.string().describe("Teams team ID."),
        channel_id: z.string().describe("Teams channel ID."),
        top: z
          .number()
          .default(20)
          .describe("Max number of messages to return (default 20, max 50)."),
        include_replies: z
          .boolean()
          .default(false)
          .describe(
            "When true, each message includes its full thread of replies (uses $expand=replies on Graph — single round-trip).",
          ),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      messages: z
        .array(
          z.object({
            id: z.string(),
            created_at: z.string(),
            subject: z.string().nullish(),
            sender_id: z.string().nullish(),
            sender_name: z.string().nullish(),
            text: z.string(),
            web_url: z.string().nullish(),
            replies: z
              .array(
                z.object({
                  id: z.string(),
                  created_at: z.string(),
                  sender_id: z.string().nullish(),
                  sender_name: z.string().nullish(),
                  text: z.string(),
                }),
              )
              .nullish(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        team_id: string;
        channel_id: string;
        top?: number;
        include_replies?: boolean;
      };
      try {
        const accessToken = await token(env);
        const messages = await listChannelMessages(
          input.team_id,
          input.channel_id,
          accessToken,
          Math.min(input.top ?? 20, 50),
          input.include_replies ?? false,
        );
        return {
          success: true,
          messages: messages.map((m) => ({
            id: m.id,
            created_at: m.createdDateTime,
            subject: m.subject ?? null,
            sender_id: m.from?.user?.id ?? m.from?.application?.id ?? null,
            sender_name:
              m.from?.user?.displayName ??
              m.from?.application?.displayName ??
              null,
            text: toPlainText(m.body),
            web_url: m.webUrl ?? null,
            replies: m.replies
              ? m.replies.map((r) => ({
                  id: r.id,
                  created_at: r.createdDateTime,
                  sender_id:
                    r.from?.user?.id ?? r.from?.application?.id ?? null,
                  sender_name:
                    r.from?.user?.displayName ??
                    r.from?.application?.displayName ??
                    null,
                  text: toPlainText(r.body),
                }))
              : null,
          })),
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── LIST_MESSAGE_REPLIES ───────────────────────────────────────────────

export const createListMessageRepliesTool = (env: Env) =>
  createTool({
    id: "LIST_MESSAGE_REPLIES",
    description:
      "List all replies in a Teams channel message thread. " +
      "Use the message id from LIST_CHANNEL_MESSAGES to read the full thread.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        team_id: z.string().describe("Teams team ID."),
        channel_id: z.string().describe("Teams channel ID."),
        message_id: z
          .string()
          .describe("ID of the parent message whose replies you want."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      replies: z
        .array(
          z.object({
            id: z.string(),
            created_at: z.string(),
            sender_id: z.string().nullish(),
            sender_name: z.string().nullish(),
            text: z.string(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        team_id: string;
        channel_id: string;
        message_id: string;
      };
      try {
        const accessToken = await token(env);
        const replies = await listMessageReplies(
          input.team_id,
          input.channel_id,
          input.message_id,
          accessToken,
        );
        return {
          success: true,
          replies: replies.map((m) => ({
            id: m.id,
            created_at: m.createdDateTime,
            sender_id: m.from?.user?.id ?? m.from?.application?.id ?? null,
            sender_name:
              m.from?.user?.displayName ??
              m.from?.application?.displayName ??
              null,
            text: toPlainText(m.body),
          })),
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── EDIT_CHANNEL_MESSAGE ───────────────────────────────────────────────

export const createEditChannelMessageTool = (env: Env) =>
  createTool({
    id: "EDIT_CHANNEL_MESSAGE",
    description:
      "Edit the content of a message previously sent in a Teams channel. " +
      "You can only edit messages YOU sent. Teams shows an 'Edited' label after the update.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        team_id: z.string().describe("Teams team ID."),
        channel_id: z.string().describe("Teams channel ID."),
        message_id: z.string().describe("ID of the message to edit."),
        content: z.string().describe("New message text or HTML."),
        content_type: z
          .enum(["text", "html"])
          .default("text")
          .describe("Content type of the new content."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
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
        await editChannelMessage(
          input.team_id,
          input.channel_id,
          input.message_id,
          input.content,
          input.content_type ?? "text",
          accessToken,
        );
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── REACT_TO_CHANNEL_MESSAGE ───────────────────────────────────────────

export const createReactToChannelMessageTool = (env: Env) =>
  createTool({
    id: "REACT_TO_CHANNEL_MESSAGE",
    description:
      "Add an emoji reaction to a message in a Teams channel. " +
      "Allowed reactions: like, heart, laugh, surprised, sad, angry.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        team_id: z.string().describe("Teams team ID."),
        channel_id: z.string().describe("Teams channel ID."),
        message_id: z.string().describe("ID of the message to react to."),
        reaction: z
          .enum(["like", "heart", "laugh", "surprised", "sad", "angry"])
          .describe("Reaction emoji."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        team_id: string;
        channel_id: string;
        message_id: string;
        reaction: ReactionType;
      };
      try {
        const accessToken = await token(env);
        await reactToChannelMessage(
          input.team_id,
          input.channel_id,
          input.message_id,
          input.reaction,
          accessToken,
        );
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

export const messageTools = [
  createSendMessageTool,
  createReplyToMessageTool,
  createListTeamsTool,
  createListChannelsTool,
  createListChannelMessagesTool,
  createListMessageRepliesTool,
  createEditChannelMessageTool,
  createReactToChannelMessageTool,
];
