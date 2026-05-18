/**
 * Chat tools — 1-on-1 and group chats (Microsoft Teams private messages).
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getAccessToken } from "../lib/auth.ts";
import {
  listMyChats,
  getChatMembers,
  sendChatMessage,
  listChatMessages,
  findUserByEmail,
  getMyUserId,
  createOneOnOneChat,
  createGroupChat,
} from "../lib/graph-client.ts";

async function token(env: Env): Promise<string> {
  return getAccessToken(env);
}

// ─── TEAMS_LIST_CHATS ─────────────────────────────────────────────────────────

export const createListChatsTool = (env: Env) =>
  createTool({
    id: "TEAMS_LIST_CHATS",
    description:
      "List all Microsoft Teams chats the authenticated user is part of (1-on-1, group chats, and meeting chats). Returns chat IDs that can be used with TEAMS_SEND_CHAT_MESSAGE.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({
      success: z.boolean(),
      chats: z
        .array(
          z.object({
            id: z.string(),
            topic: z.string().nullish(),
            chat_type: z.string(),
            last_updated: z.string(),
            web_url: z.string().nullish(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
    }),
    execute: async () => {
      try {
        const accessToken = await token(env);
        const myId = await getMyUserId(accessToken);
        const chats = await listMyChats(accessToken);
        return {
          success: true,
          chats: chats.map((c) => {
            // For 1-on-1 chats, derive a topic from the other member's name
            let topic = c.topic ?? null;
            if (!topic && c.chatType === "oneOnOne" && c.members) {
              const other = c.members.find(
                (m: any) => (m.userId ?? m.id) !== myId,
              );
              topic = other?.displayName ?? null;
            }
            return {
              id: c.id,
              topic,
              chat_type: c.chatType,
              last_updated: c.lastUpdatedDateTime,
              web_url: c.webUrl ?? null,
            };
          }),
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_GET_CHAT_MEMBERS ───────────────────────────────────────────────────

export const createGetChatMembersTool = (env: Env) =>
  createTool({
    id: "TEAMS_GET_CHAT_MEMBERS",
    description:
      "List the members of a chat (useful for 1-on-1 chats with no topic so you can identify who you are talking to).",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        chat_id: z.string().describe("Chat ID from TEAMS_LIST_CHATS."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      members: z
        .array(
          z.object({
            id: z.string(),
            display_name: z.string(),
            email: z.string().nullish(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { chat_id } = context as { chat_id: string };
      try {
        const accessToken = await token(env);
        const members = await getChatMembers(chat_id, accessToken);
        return {
          success: true,
          members: members.map((m) => ({
            id: m.id,
            display_name: m.displayName,
            email: m.email ?? null,
          })),
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_SEND_CHAT_MESSAGE ──────────────────────────────────────────────────

export const createSendChatMessageTool = (env: Env) =>
  createTool({
    id: "TEAMS_SEND_CHAT_MESSAGE",
    description:
      "Send a message to an existing Microsoft Teams chat (1-on-1 or group). " +
      "Use chat_id from TEAMS_LIST_CHATS or from TEAMS_CREATE_PRIVATE_CHAT / TEAMS_CREATE_GROUP_CHAT.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        chat_id: z.string().describe("Chat ID. Required."),
        content: z.string().describe("Message text or HTML to send."),
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
        chat_id: string;
        content: string;
        content_type?: "text" | "html";
      };
      try {
        const accessToken = await token(env);
        const msg = await sendChatMessage(
          input.chat_id,
          input.content,
          input.content_type ?? "text",
          accessToken,
        );
        return {
          success: true,
          message_id: msg.id,
          web_url: msg.webUrl ?? null,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_LIST_CHAT_MESSAGES ─────────────────────────────────────────────────

export const createListChatMessagesTool = (env: Env) =>
  createTool({
    id: "TEAMS_LIST_CHAT_MESSAGES",
    description: "List recent messages from a Teams chat (useful for context).",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        chat_id: z.string().describe("Chat ID from TEAMS_LIST_CHATS."),
        top: z
          .number()
          .default(20)
          .describe("Max number of messages to return (default 20)."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      messages: z
        .array(
          z.object({
            id: z.string(),
            created_at: z.string(),
            sender_name: z.string().nullish(),
            text: z.string(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { chat_id, top } = context as { chat_id: string; top?: number };
      try {
        const accessToken = await token(env);
        const messages = await listChatMessages(
          chat_id,
          accessToken,
          top ?? 20,
        );
        return {
          success: true,
          messages: messages.map((m) => {
            const text =
              m.body.contentType === "text"
                ? m.body.content
                : m.body.content
                    .replace(/<[^>]+>/g, "")
                    .replace(/&nbsp;/g, " ")
                    .trim();
            return {
              id: m.id,
              created_at: m.createdDateTime,
              sender_name:
                m.from?.user?.displayName ??
                m.from?.application?.displayName ??
                null,
              text,
            };
          }),
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_FIND_USER ──────────────────────────────────────────────────────────

export const createFindUserTool = (env: Env) =>
  createTool({
    id: "TEAMS_FIND_USER",
    description:
      "Look up a user in the Azure AD directory by email or user-principal-name. " +
      "Returns their AAD id. Use this to get the id needed by TEAMS_CREATE_PRIVATE_CHAT " +
      "or TEAMS_CREATE_GROUP_CHAT.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        email: z
          .string()
          .describe("Email or user-principal-name of the person to find."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      user: z
        .object({
          id: z.string(),
          display_name: z.string(),
          user_principal_name: z.string(),
          email: z.string().nullish(),
        })
        .nullish(),
      error: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { email } = context as { email: string };
      try {
        const accessToken = await token(env);
        const user = await findUserByEmail(email, accessToken);
        if (!user) {
          return { success: false, error: `User not found: ${email}` };
        }
        return {
          success: true,
          user: {
            id: user.id,
            display_name: user.displayName,
            user_principal_name: user.userPrincipalName,
            email: user.mail ?? null,
          },
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_CREATE_PRIVATE_CHAT ────────────────────────────────────────────────

export const createCreatePrivateChatTool = (env: Env) =>
  createTool({
    id: "TEAMS_CREATE_PRIVATE_CHAT",
    description:
      "Open a 1-on-1 private chat with another user. Microsoft Graph deduplicates: " +
      "calling this with the same user returns the existing chat. " +
      "Returns the chat_id to use with TEAMS_SEND_CHAT_MESSAGE. " +
      "Pass the other user's Azure AD id (from TEAMS_FIND_USER).",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        user_id: z
          .string()
          .describe(
            "Azure AD id of the other user (obtained from TEAMS_FIND_USER).",
          ),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      chat_id: z.string().nullish(),
      web_url: z.string().nullish(),
      error: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { user_id } = context as { user_id: string };
      try {
        const accessToken = await token(env);
        const myId = await getMyUserId(accessToken);
        const chat = await createOneOnOneChat(myId, user_id, accessToken);
        return {
          success: true,
          chat_id: chat.id,
          web_url: chat.webUrl ?? null,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

// ─── TEAMS_CREATE_GROUP_CHAT ──────────────────────────────────────────────────

export const createCreateGroupChatTool = (env: Env) =>
  createTool({
    id: "TEAMS_CREATE_GROUP_CHAT",
    description:
      "Create a group chat with multiple users (3 or more including yourself). Returns the chat_id for sending messages.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        user_ids: z
          .preprocess((val) => {
            if (typeof val === "string") {
              return val
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
            return val;
          }, z.array(z.string()).min(2))
          .describe(
            "Azure AD ids of the other members (at least 2 — you are added automatically). Accepts an array of ids or a comma-separated string.",
          ),
        topic: z.string().describe("Display name / topic of the group chat."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      chat_id: z.string().nullish(),
      web_url: z.string().nullish(),
      error: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { user_ids: string[]; topic: string };
      try {
        const accessToken = await token(env);
        const myId = await getMyUserId(accessToken);
        const chat = await createGroupChat(
          myId,
          input.user_ids,
          input.topic,
          accessToken,
        );
        return {
          success: true,
          chat_id: chat.id,
          web_url: chat.webUrl ?? null,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  });

export const chatTools = [
  createListChatsTool,
  createGetChatMembersTool,
  createSendChatMessageTool,
  createListChatMessagesTool,
  createFindUserTool,
  createCreatePrivateChatTool,
  createCreateGroupChatTool,
];
